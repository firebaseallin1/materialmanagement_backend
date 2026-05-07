const { Stock } = require('../models/Transactions');
const crypto = require('crypto');

// ── Shared populate helper ────────────────────────────────────────────────────
const _populate = (q) =>
  q.populate('material', 'name unit code')
   .populate('branch', 'name')
   .populate('fromBranch', 'name')
   .populate('toBranch', 'name')
   .populate('createdBy', 'name');

// ── Get all stock ledger entries (with filters) ───────────────────────────────
exports.getAll = async (req, res) => {
  try {
    const { branch, material, type, from, to, page = 1, limit = 50 } = req.query;
    const query = {};
    if (branch)   query.branch   = branch;
    if (material) query.material = material;
    if (type)     query.type     = type;
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to)   query.date.$lte = new Date(to);
    }
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      _populate(Stock.find(query)).sort({ date: -1 }).skip(skip).limit(Number(limit)),
      Stock.countDocuments(query),
    ]);
    res.json({ success: true, data, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Transaction history (one entry per business event) ────────────────────────
// Shows: store records + legacy records + the 'out' side of transfers
exports.history = async (req, res) => {
  try {
    const { branch, material, transactionType, from, to, page = 1, limit = 50 } = req.query;
    const mongoose = require('mongoose');

    const match = {
      $or: [
        { transactionType: { $exists: false } },              // legacy records
        { transactionType: 'store' },
        { transactionType: 'stock_move', type: 'out' },      // one side of each move event
      ],
    };

    if (material) match.material = new mongoose.Types.ObjectId(material);
    if (transactionType) match.transactionType = transactionType;
    if (from || to) {
      match.date = {};
      if (from) match.date.$gte = new Date(from);
      if (to)   match.date.$lte = new Date(to);
    }
    if (branch) {
      match.$and = [{
        $or: [
          { branch:      new mongoose.Types.ObjectId(branch) },
          { fromBranch:  new mongoose.Types.ObjectId(branch) },
          { toBranch:    new mongoose.Types.ObjectId(branch) },
        ],
      }];
    }

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      _populate(Stock.find(match)).sort({ date: -1 }).skip(skip).limit(Number(limit)),
      Stock.countDocuments(match),
    ]);
    res.json({ success: true, data, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Get single record ─────────────────────────────────────────────────────────
exports.getOne = async (req, res) => {
  try {
    const doc = await _populate(Stock.findById(req.params.id));
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Create ────────────────────────────────────────────────────────────────────
exports.create = async (req, res) => {
  try {
    const {
      transactionType = 'store',
      material, branch, fromBranch, toBranch, quantity, date, remarks,
      transportName, driverName, vehicleName, distance, cost,
    } = req.body;
    const mongoose = require('mongoose');

    // ── STORE STOCK ──────────────────────────────────────────────────────────
    if (transactionType === 'store') {
      if (!branch)   return res.status(400).json({ success: false, message: 'Branch is required' });
      if (!material) return res.status(400).json({ success: false, message: 'Material is required' });
      if (!quantity || quantity <= 0) return res.status(400).json({ success: false, message: 'Quantity must be > 0' });

      const doc = await Stock.create({
        material, branch, type: 'in', transactionType: 'store',
        quantity, date: date || new Date(), remarks, createdBy: req.user.id,
      });
      const populated = await _populate(Stock.findById(doc._id));
      return res.status(201).json({ success: true, data: populated });
    }

    // ── STOCK MOVE (inter-branch transfer) ────────────────────────────────────
    if (transactionType !== 'stock_move') {
      return res.status(400).json({ success: false, message: 'Invalid transactionType' });
    }
    if (!fromBranch || !toBranch) {
      return res.status(400).json({ success: false, message: 'fromBranch and toBranch are required' });
    }
    if (fromBranch === toBranch) {
      return res.status(400).json({ success: false, message: 'Source and destination branch must differ' });
    }
    if (!material) return res.status(400).json({ success: false, message: 'Material is required' });
    if (!quantity || quantity <= 0) return res.status(400).json({ success: false, message: 'Quantity must be > 0' });

    // Check available balance in fromBranch
    const rows = await Stock.aggregate([
      { $match: { material: new mongoose.Types.ObjectId(material), branch: new mongoose.Types.ObjectId(fromBranch) } },
      { $group: { _id: '$type', total: { $sum: '$quantity' } } },
    ]);
    const inQty  = rows.find(r => r._id === 'in')?.total  ?? 0;
    const outQty = rows.find(r => r._id === 'out')?.total ?? 0;
    const available = inQty - outQty;
    if (quantity > available) {
      return res.status(400).json({ success: false, message: `Insufficient stock. Available: ${available}` });
    }

    const transferRef = crypto.randomUUID();
    const common = {
      material, transactionType: 'stock_move', fromBranch, toBranch, transferRef,
      quantity, date: date || new Date(), remarks,
      transportName, driverName, vehicleName, distance, cost,
      createdBy: req.user.id,
    };

    // Create both ledger entries; roll back first if second fails
    let outDoc = null;
    try {
      outDoc = await Stock.create({ ...common, branch: fromBranch, type: 'out' });
      await Stock.create({ ...common, branch: toBranch,   type: 'in'  });
    } catch (innerErr) {
      if (outDoc) await Stock.findByIdAndDelete(outDoc._id);
      throw innerErr;
    }

    const populated = await _populate(Stock.findById(outDoc._id));
    return res.status(201).json({ success: true, data: populated });

  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ── Update ────────────────────────────────────────────────────────────────────
exports.update = async (req, res) => {
  try {
    const doc = await Stock.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });

    if (doc.transferRef) {
      // For transfers: only allow updating quantity, date, remarks on both paired records
      const { quantity, date, remarks } = req.body;
      const updates = {};
      if (quantity !== undefined) updates.quantity = quantity;
      if (date     !== undefined) updates.date     = date;
      if (remarks  !== undefined) updates.remarks  = remarks;
      await Stock.updateMany({ transferRef: doc.transferRef }, { $set: updates }, { runValidators: true });
    } else {
      await Stock.findByIdAndUpdate(req.params.id, req.body, { runValidators: true });
    }

    const updated = await _populate(Stock.findById(req.params.id));
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ── Delete ────────────────────────────────────────────────────────────────────
exports.remove = async (req, res) => {
  try {
    const doc = await Stock.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });

    if (doc.transferRef) {
      await Stock.deleteMany({ transferRef: doc.transferRef });
    } else {
      await Stock.findByIdAndDelete(req.params.id);
    }
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Total stock summary per material (all branches) ───────────────────────────
// Logic:
//   stored   = qty formally stored at the store-branch (via 'store' transactions)
//   dispatched = qty moved OUT from the store-branch only
//   returned   = qty returned back TO the store-branch via stock_move
//   moved    = dispatched - returned  (net qty currently away from store-branch)
//   balance  = stored - moved         (= stored - dispatched + returned)
exports.summary = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { branch } = req.query;
    const match = {};
    if (branch) match.branch = new mongoose.Types.ObjectId(branch);

    const isStore = {
      $or: [
        { $eq: ['$transactionType', 'store'] },
        { $and: [{ $eq: [{ $ifNull: ['$transactionType', null] }, null] }, { $eq: ['$type', 'in'] }] },
      ],
    };
    const isMoveOut = { $and: [{ $eq: ['$transactionType', 'stock_move'] }, { $eq: ['$type', 'out'] }] };
    const isMoveIn  = { $and: [{ $eq: ['$transactionType', 'stock_move'] }, { $eq: ['$type', 'in']  }] };

    const summary = await Stock.aggregate([
      { $match: match },
      // Phase 1: per {material, branch} — identify store-branches and their move volumes
      {
        $group: {
          _id:        { material: '$material', branch: '$branch' },
          storeQty:   { $sum: { $cond: [isStore,   '$quantity', 0] } },
          moveOutQty: { $sum: { $cond: [isMoveOut, '$quantity', 0] } },
          moveInQty:  { $sum: { $cond: [isMoveIn,  '$quantity', 0] } },
        },
      },
      // Phase 2: per material — dispatched/returned only counted at store-branches
      {
        $group: {
          _id:        '$_id.material',
          stored:     { $sum: '$storeQty' },
          dispatched: { $sum: { $cond: [{ $gt: ['$storeQty', 0] }, '$moveOutQty', 0] } },
          returned:   { $sum: { $cond: [{ $gt: ['$storeQty', 0] }, '$moveInQty',  0] } },
        },
      },
      // moved = net qty still away from store-branch; balance = what's in store
      {
        $addFields: {
          moved:   { $max: [{ $subtract: ['$dispatched', '$returned'] }, 0] },
          balance: { $subtract: [{ $add: ['$stored', '$returned'] }, '$dispatched'] },
        },
      },
      { $lookup: { from: 'materials', localField: '_id', foreignField: '_id', as: 'material' } },
      { $unwind: '$material' },
      { $sort: { 'material.name': 1 } },
    ]);
    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Balance for a specific material + branch ──────────────────────────────────
exports.balance = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { material, branch } = req.query;
    if (!material || !branch) return res.json({ success: true, balance: 0 });

    const rows = await Stock.aggregate([
      { $match: { material: new mongoose.Types.ObjectId(material), branch: new mongoose.Types.ObjectId(branch) } },
      { $group: { _id: '$type', total: { $sum: '$quantity' } } },
    ]);
    const inQty  = rows.find(r => r._id === 'in')?.total  ?? 0;
    const outQty = rows.find(r => r._id === 'out')?.total ?? 0;
    res.json({ success: true, balance: inQty - outQty });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Stock breakdown per branch ─────────────────────────────────────────────────
// Per branch-material:
//   stored  = formal 'store' transactions at this branch
//   moveIn  = stock received via stock_move (from another branch)
//   moveOut = stock dispatched via stock_move (to another branch)
//   balance = stored + moveIn - moveOut  (physical qty at this branch)
exports.branchWise = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { branch } = req.query;
    const match = {};
    if (branch) match.branch = new mongoose.Types.ObjectId(branch);

    const isStore = {
      $or: [
        { $eq: ['$transactionType', 'store'] },
        { $and: [{ $eq: [{ $ifNull: ['$transactionType', null] }, null] }, { $eq: ['$type', 'in'] }] },
      ],
    };
    const isMoveOut = { $and: [{ $eq: ['$transactionType', 'stock_move'] }, { $eq: ['$type', 'out'] }] };
    const isMoveIn  = { $and: [{ $eq: ['$transactionType', 'stock_move'] }, { $eq: ['$type', 'in']  }] };

    const data = await Stock.aggregate([
      { $match: match },
      // Phase 1: per {branch, material}
      {
        $group: {
          _id:     { branch: '$branch', material: '$material' },
          stored:  { $sum: { $cond: [isStore,   '$quantity', 0] } },
          moveOut: { $sum: { $cond: [isMoveOut, '$quantity', 0] } },
          moveIn:  { $sum: { $cond: [isMoveIn,  '$quantity', 0] } },
        },
      },
      // balance = stored + moveIn - moveOut
      { $addFields: { balance: { $subtract: [{ $add: ['$stored', '$moveIn'] }, '$moveOut'] } } },
      { $lookup: { from: 'materials', localField: '_id.material', foreignField: '_id', as: 'material' } },
      { $unwind: '$material' },
      { $lookup: { from: 'branches',  localField: '_id.branch',   foreignField: '_id', as: 'branch'   } },
      { $unwind: '$branch' },
      // Phase 2: group by branch
      {
        $group: {
          _id:          '$_id.branch',
          branch:       { $first: '$branch' },
          totalStored:  { $sum: '$stored' },
          totalMoveIn:  { $sum: '$moveIn' },
          totalMoveOut: { $sum: '$moveOut' },
          totalBalance: { $sum: '$balance' },
          materials:    { $push: { material: '$material', stored: '$stored', moveIn: '$moveIn', moveOut: '$moveOut', balance: '$balance' } },
        },
      },
      { $sort: { 'branch.name': 1 } },
    ]);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

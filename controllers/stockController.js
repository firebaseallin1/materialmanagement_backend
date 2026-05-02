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
        { transactionType: { $exists: false } },                                  // legacy
        { transactionType: 'store' },
        { transactionType: { $in: ['stock_in', 'stock_out'] }, type: 'out' },    // one side of transfer
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
    const { transactionType = 'store', material, branch, fromBranch, toBranch, quantity, date, remarks } = req.body;
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
      await _populate(Stock.findById(doc._id)).then(d => {
        res.status(201).json({ success: true, data: d });
      });
      return;
    }

    // ── TRANSFER (stock_in / stock_out) ──────────────────────────────────────
    if (!['stock_in', 'stock_out'].includes(transactionType)) {
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
    const common = { material, transactionType, fromBranch, toBranch, transferRef, quantity, date: date || new Date(), remarks, createdBy: req.user.id };

    // Create both ledger entries; if the second fails, clean up the first
    let outDoc = null;
    try {
      outDoc = await Stock.create({ ...common, branch: fromBranch, type: 'out' });
      await Stock.create({ ...common, branch: toBranch, type: 'in' });
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
exports.summary = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { branch } = req.query;
    const match = {};
    if (branch) match.branch = new mongoose.Types.ObjectId(branch);
    const summary = await Stock.aggregate([
      { $match: match },
      { $group: { _id: { material: '$material', type: '$type' }, total: { $sum: '$quantity' } } },
      {
        $group: {
          _id: '$_id.material',
          in:  { $sum: { $cond: [{ $eq: ['$_id.type', 'in']  }, '$total', 0] } },
          out: { $sum: { $cond: [{ $eq: ['$_id.type', 'out'] }, '$total', 0] } },
        },
      },
      { $addFields: { balance: { $subtract: ['$in', '$out'] } } },
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
exports.branchWise = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { branch } = req.query;
    const match = {};
    if (branch) match.branch = new mongoose.Types.ObjectId(branch);

    const data = await Stock.aggregate([
      { $match: match },
      { $group: { _id: { branch: '$branch', material: '$material', type: '$type' }, total: { $sum: '$quantity' } } },
      {
        $group: {
          _id: { branch: '$_id.branch', material: '$_id.material' },
          in:  { $sum: { $cond: [{ $eq: ['$_id.type', 'in']  }, '$total', 0] } },
          out: { $sum: { $cond: [{ $eq: ['$_id.type', 'out'] }, '$total', 0] } },
        },
      },
      { $addFields: { balance: { $subtract: ['$in', '$out'] } } },
      { $lookup: { from: 'materials', localField: '_id.material', foreignField: '_id', as: 'material' } },
      { $unwind: '$material' },
      { $lookup: { from: 'branches',  localField: '_id.branch',   foreignField: '_id', as: 'branch'   } },
      { $unwind: '$branch' },
      {
        $group: {
          _id:          '$_id.branch',
          branch:       { $first: '$branch' },
          totalIn:      { $sum: '$in' },
          totalOut:     { $sum: '$out' },
          totalBalance: { $sum: '$balance' },
          materials:    { $push: { material: '$material', in: '$in', out: '$out', balance: '$balance' } },
        },
      },
      { $sort: { 'branch.name': 1 } },
    ]);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const { Stock, Material } = require('../models/Transactions');

// Get all stock with filters
exports.getAll = async (req, res) => {
  try {
    const { branch, material, type, from, to, page = 1, limit = 50 } = req.query;
    const query = {};
    if (branch) query.branch = branch;
    if (material) query.material = material;
    if (type) query.type = type;
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) query.date.$lte = new Date(to);
    }
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      Stock.find(query)
        .populate('material', 'name unit code')
        .populate('branch', 'name')
        .populate('createdBy', 'name')
        .sort({ date: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Stock.countDocuments(query),
    ]);
    res.json({ success: true, data, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getOne = async (req, res) => {
  try {
    const doc = await Stock.findById(req.params.id)
      .populate('material branch createdBy');
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const doc = await Stock.create({ ...req.body, createdBy: req.user.id });
    await doc.populate('material branch createdBy');
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const doc = await Stock.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
      .populate('material branch createdBy');
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    await Stock.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Total stock summary per material (all branches combined)
exports.summary = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { branch } = req.query;
    const match = {};
    if (branch) match.branch = new mongoose.Types.ObjectId(branch);
    const summary = await Stock.aggregate([
      { $match: match },
      {
        $group: {
          _id: { material: '$material', type: '$type' },
          total: { $sum: '$quantity' },
        },
      },
      {
        $group: {
          _id: '$_id.material',
          in: { $sum: { $cond: [{ $eq: ['$_id.type', 'in'] }, '$total', 0] } },
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

// Balance for a specific material + branch
exports.balance = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { material, branch } = req.query;
    if (!material || !branch) return res.json({ success: true, balance: 0 });

    const rows = await Stock.aggregate([
      {
        $match: {
          material: new mongoose.Types.ObjectId(material),
          branch:   new mongoose.Types.ObjectId(branch),
        },
      },
      { $group: { _id: '$type', total: { $sum: '$quantity' } } },
    ]);

    const inQty  = rows.find(r => r._id === 'in')?.total  ?? 0;
    const outQty = rows.find(r => r._id === 'out')?.total ?? 0;
    res.json({ success: true, balance: inQty - outQty });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Stock breakdown per branch → materials with in / out / balance
exports.branchWise = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { branch } = req.query;
    const match = {};
    if (branch) match.branch = new mongoose.Types.ObjectId(branch);

    const data = await Stock.aggregate([
      { $match: match },
      // Group by branch + material + type
      {
        $group: {
          _id: { branch: '$branch', material: '$material', type: '$type' },
          total: { $sum: '$quantity' },
        },
      },
      // Pivot in / out per branch-material pair
      {
        $group: {
          _id: { branch: '$_id.branch', material: '$_id.material' },
          in:  { $sum: { $cond: [{ $eq: ['$_id.type', 'in']  }, '$total', 0] } },
          out: { $sum: { $cond: [{ $eq: ['$_id.type', 'out'] }, '$total', 0] } },
        },
      },
      { $addFields: { balance: { $subtract: ['$in', '$out'] } } },
      // Join material details
      {
        $lookup: {
          from: 'materials',
          localField: '_id.material',
          foreignField: '_id',
          as: 'material',
        },
      },
      { $unwind: '$material' },
      // Join branch details
      {
        $lookup: {
          from: 'branches',
          localField: '_id.branch',
          foreignField: '_id',
          as: 'branch',
        },
      },
      { $unwind: '$branch' },
      // Group into branch buckets
      {
        $group: {
          _id: '$_id.branch',
          branch:       { $first: '$branch' },
          totalIn:      { $sum: '$in' },
          totalOut:     { $sum: '$out' },
          totalBalance: { $sum: '$balance' },
          materials: {
            $push: {
              material: '$material',
              in:       '$in',
              out:      '$out',
              balance:  '$balance',
            },
          },
        },
      },
      { $sort: { 'branch.name': 1 } },
    ]);

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

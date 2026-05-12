const { Payment } = require('../models/Transactions');
exports.getAll = async (req, res) => {
  try {
    const { branch, type, from, to, page = 1, limit = 50 } = req.query;
    const query = {};
    if (branch) query.branch = branch;
    if (type) query.type = type;
    if (from || to) { query.date = {}; if (from) query.date.$gte = new Date(from); if (to) query.date.$lte = new Date(to); }
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      Payment.find(query).populate('branch','name').populate('employee','name').populate('createdBy','name').sort({ date: -1 }).skip(skip).limit(Number(limit)),
      Payment.countDocuments(query),
    ]);
    res.json({ success: true, data, total });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
exports.getOne = async (req, res) => {
  try {
    const doc = await Payment.findById(req.params.id).populate('branch employee createdBy');
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: doc });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
exports.create = async (req, res) => {
  try {
    const doc = await Payment.create({ ...req.body, createdBy: req.user.id });
    res.status(201).json({ success: true, data: doc });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
};
exports.update = async (req, res) => {
  try {
    const doc = await Payment.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: doc });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
};
exports.remove = async (req, res) => {
  try { await Payment.findByIdAndDelete(req.params.id); res.json({ success: true, message: 'Deleted' }); }
  catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const { Payment, Expense, Measurement } = require('../models/Transactions');
exports.getAll = async (req, res) => {
  try {
    const { branch, type, category, from, to, page = 1, limit = 50 } = req.query;
    const query = {};
    if (branch) query.branch = branch;
    if (type) query.type = type;
    if (category) query.category = category;
    if (from || to) {
      const utcDay = (s, end = false) => new Date(s.substring(0, 10) + (end ? 'T23:59:59.999Z' : 'T00:00:00.000Z'));
      query.date = {};
      if (from) query.date.$gte = utcDay(from);
      if (to)   query.date.$lte = utcDay(to, true);
    }
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
    // Mark linked expenses as paid
    if (req.body.category === 'expense' && Array.isArray(req.body.expenseIds) && req.body.expenseIds.length) {
      await Expense.updateMany(
        { _id: { $in: req.body.expenseIds } },
        { $set: { isPaid: true, paymentId: doc._id } }
      );
    }
    // Mark linked measurements as paid
    if (req.body.category === 'measurement' && Array.isArray(req.body.measurementIds) && req.body.measurementIds.length) {
      await Measurement.updateMany(
        { _id: { $in: req.body.measurementIds } },
        { $set: { isPaid: true, paymentId: doc._id } }
      );
    }
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
  try {
    const doc = await Payment.findById(req.params.id);
    if (doc && doc.category === 'measurement' && doc.measurementIds && doc.measurementIds.length) {
      await Measurement.updateMany(
        { _id: { $in: doc.measurementIds } },
        { $set: { isPaid: false, paymentId: null } }
      );
    }
    await Payment.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

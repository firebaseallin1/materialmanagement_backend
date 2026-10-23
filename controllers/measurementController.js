const { Measurement } = require('../models/Transactions');
const { Counter } = require('../models/Masters');
exports.getAll = async (req, res) => {
  try {
    const { branch, location, from, to, isPaid, page = 1, limit = 200 } = req.query;
    const query = {};
    if (branch) query.branch = branch;
    if (location) query.location = new RegExp(location, 'i');
    if (isPaid !== undefined) query.isPaid = isPaid === 'true';
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) query.date.$lte = new Date(to);
    }
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      Measurement.find(query)
        .populate('branch', 'name')
        .populate('createdBy', 'name')
        .sort({ date: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Measurement.countDocuments(query),
    ]);
    res.json({ success: true, data, total });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
exports.getOne = async (req, res) => {
  try {
    const doc = await Measurement.findById(req.params.id).populate('branch material createdBy');
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: doc });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
exports.create = async (req, res) => {
  try {
    const now = new Date();
    const yr  = now.getFullYear();
    const mo  = String(now.getMonth() + 1).padStart(2, '0');
    const key = `meas_${yr}-${mo}`;
    const ctr = await Counter.findOneAndUpdate(
      { _id: key },
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    );
    const dcNo = `${yr}-${mo}-${String(ctr.seq).padStart(4, '0')}`;
    const doc = await Measurement.create({ ...req.body, dcNo, createdBy: req.user.id });
    res.status(201).json({ success: true, data: doc });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
};
exports.update = async (req, res) => {
  try {
    const doc = await Measurement.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: doc });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
};
exports.remove = async (req, res) => {
  try { await Measurement.findByIdAndDelete(req.params.id); res.json({ success: true, message: 'Deleted' }); }
  catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

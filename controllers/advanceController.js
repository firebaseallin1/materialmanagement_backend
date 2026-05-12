const { Advance, Attendance, Payment } = require('../models/Transactions');

exports.getAll = async (req, res) => {
  try {
    const { branch, employee, from, to, page = 1, limit = 50 } = req.query;
    const query = {};
    if (branch) query.branch = branch;
    if (employee) query.employee = employee;
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) query.date.$lte = new Date(to);
    }
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      Advance.find(query)
        .populate('employee', 'name photo')
        .populate('branch', 'name')
        .sort({ date: -1 }).skip(skip).limit(Number(limit)),
      Advance.countDocuments(query),
    ]);
    res.json({ success: true, data, total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getOne = async (req, res) => {
  try {
    const doc = await Advance.findById(req.params.id).populate('employee branch createdBy');
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const doc = await Advance.create({ ...req.body, createdBy: req.user.id });
    await doc.populate([{ path: 'employee', select: 'name photo' }, { path: 'branch', select: 'name' }]);
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const doc = await Advance.findByIdAndUpdate(req.params.id, req.body, { new: true })
      .populate('employee', 'name photo')
      .populate('branch', 'name');
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    await Advance.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Returns outstanding earnings balance and advance balance for an employee
exports.getBalance = async (req, res) => {
  try {
    const { employee } = req.query;
    if (!employee) return res.status(400).json({ success: false, message: 'employee id required' });

    const [attendances, advances, payments] = await Promise.all([
      Attendance.find({ employee }),
      Advance.find({ employee }),
      Payment.find({ employee }),
    ]);

    const totalEarnings = attendances.reduce((sum, a) => {
      const hrs = (a.isPresent ? 8 : 0) + (a.otEnabled ? (a.otHours || 0) : 0);
      return sum + hrs * (a.hourRate || 0);
    }, 0);

    const totalAdvances = advances.reduce((sum, a) => sum + (a.amount || 0), 0);
    const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalAdvanceAdjusted = payments.reduce((sum, p) => sum + (p.advanceAdjustment || 0), 0);

    res.json({
      success: true,
      totalEarnings,
      totalAdvances,
      totalPaid,
      totalAdvanceAdjusted,
      outstandingBalance: totalEarnings - totalPaid,
      advanceBalance: totalAdvances - totalAdvanceAdjusted,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

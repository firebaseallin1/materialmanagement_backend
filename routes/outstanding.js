const express = require('express');
const router = express.Router();
const { Advance, Payment } = require('../models/Transactions');
const { Employee } = require('../models/Masters');
const { protect } = require('../middleware/auth');

// GET /api/outstanding
// Returns per-employee: totalAdvance, totalPaid, outstandingBalance
router.get('/', protect, async (req, res) => {
  try {
    const { branch, search } = req.query;

    let empQuery = { isActive: true };
    if (req.user.role !== 'admin') empQuery.createdBy = req.user.id;
    if (branch) empQuery.branch = branch;
    if (search) {
      empQuery.$or = [
        { name: { $regex: search, $options: 'i' } },
        { empCode: { $regex: search, $options: 'i' } },
        { designation: { $regex: search, $options: 'i' } },
      ];
    }

    const employees = await Employee.find(empQuery)
      .populate('branch', 'name')
      .populate('createdBy', 'name userId')
      .sort({ name: 1 });

    if (employees.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const empIds = employees.map(e => e._id);

    const [advanceAgg, paymentAgg] = await Promise.all([
      Advance.aggregate([
        { $match: { employee: { $in: empIds } } },
        { $group: { _id: '$employee', totalAdvance: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      Payment.aggregate([
        {
          $match: {
            employee: { $in: empIds },
            type: 'paid',
            $or: [{ category: 'labor' }, { category: { $exists: false } }, { category: 'other' }],
          },
        },
        { $group: { _id: '$employee', totalPaid: { $sum: '$amount' }, payCount: { $sum: 1 } } },
      ]),
    ]);

    const advanceMap = {};
    for (const a of advanceAgg) advanceMap[a._id.toString()] = a;
    const paymentMap = {};
    for (const p of paymentAgg) paymentMap[p._id.toString()] = p;

    const data = employees.map(emp => {
      const key = emp._id.toString();
      const agg = advanceMap[key] || { totalAdvance: 0, count: 0 };
      const pay = paymentMap[key] || { totalPaid: 0, payCount: 0 };
      const outstanding = Math.max(0, agg.totalAdvance - pay.totalPaid);
      return {
        _id: emp._id,
        name: emp.name,
        empCode: emp.empCode,
        designation: emp.designation,
        branch: emp.branch,
        photo: emp.photo,
        createdBy: emp.createdBy,
        totalAdvance: agg.totalAdvance,
        advanceCount: agg.count,
        totalPaid: pay.totalPaid,
        payCount: pay.payCount,
        outstandingBalance: outstanding,
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

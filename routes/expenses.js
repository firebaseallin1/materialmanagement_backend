const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/expenseController');
const { protect } = require('../middleware/auth');
const { Expense, Payment } = require('../models/Transactions');

// GET /api/expenses/payment-summary?branch=X&from=Y&to=Z
// Returns unpaid expenses for the given branch within the date range,
// plus previousOutstanding from the last recorded expense payment for that branch.
router.get('/payment-summary', protect, async (req, res) => {
  try {
    const { branch, from, to } = req.query;

    const query = { isPaid: { $ne: true } };
    if (branch) query.branch = branch;
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }

    const paymentMatch = { category: 'expense', type: 'paid' };
    if (branch) paymentMatch.branch = branch;

    const [data, lastPayment] = await Promise.all([
      Expense.find(query).populate('branch', 'name').sort({ date: 1 }).lean(),
      Payment.findOne(paymentMatch)
        .sort({ periodTo: -1, createdAt: -1 })
        .select('thisWeekOutstanding periodTo')
        .lean(),
    ]);

    const previousOutstanding = lastPayment?.thisWeekOutstanding || 0;

    res.json({ success: true, data, previousOutstanding });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/', protect, ctrl.getAll);
router.get('/:id', protect, ctrl.getOne);
router.post('/', protect, ctrl.create);
router.put('/:id', protect, ctrl.update);
router.delete('/:id', protect, ctrl.remove);
module.exports = router;

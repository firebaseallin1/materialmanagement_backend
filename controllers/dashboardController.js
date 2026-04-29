const { Stock, Attendance, Expense, Payment, Transport } = require('../models/Transactions');
const { Material, Branch, Location } = require('../models/Masters');
const User = require('../models/User');

exports.getSummary = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      totalMaterials,
      totalBranches,
      totalUsers,
      todayAttendance,
      todayExpenses,
      todayPayments,
      recentStock,
      recentExpenses,
    ] = await Promise.all([
      Material.countDocuments({ isActive: true }),
      Branch.countDocuments({ isActive: true }),
      User.countDocuments({ isActive: true }),
      Attendance.countDocuments({ date: { $gte: today, $lt: tomorrow } }),
      Expense.aggregate([{ $match: { date: { $gte: today, $lt: tomorrow } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Payment.aggregate([{ $match: { date: { $gte: today, $lt: tomorrow } } }, { $group: { _id: '$type', total: { $sum: '$amount' } } }]),
      Stock.find().populate('material', 'name').populate('branch', 'name').sort({ createdAt: -1 }).limit(5),
      Expense.find().populate('branch', 'name').sort({ createdAt: -1 }).limit(5),
    ]);

    const stockSummary = await Stock.aggregate([
      { $group: { _id: '$type', total: { $sum: '$quantity' } } },
    ]);

    res.json({
      success: true,
      data: {
        counts: { materials: totalMaterials, branches: totalBranches, users: totalUsers, todayAttendance },
        todayExpense: todayExpenses[0]?.total || 0,
        todayPayments,
        stockSummary,
        recentStock,
        recentExpenses,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

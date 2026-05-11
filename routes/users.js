const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');

// Generate next available userId for a given role+category prefix
// GET /api/users/generate-id?rolePrefix=ADM&catPrefix=SAL
router.get('/generate-id', protect, async (req, res) => {
  try {
    const { rolePrefix = '', catPrefix = '' } = req.query;
    const rp = rolePrefix.toUpperCase().substring(0, 3).padEnd(3, 'X');
    const cp = catPrefix.toUpperCase().substring(0, 3).padEnd(3, 'X');
    const prefix = rp + cp;
    const pattern = new RegExp(`^${prefix}\\d{3}$`);
    const users = await User.find({ userId: pattern }).select('userId');
    const nums = users.map(u => parseInt(u.userId.slice(-3), 10)).filter(n => !isNaN(n));
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    const userId = prefix + String(next).padStart(3, '0');
    res.json({ success: true, userId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/', protect, async (req, res) => {
  try {
    const users = await User.find()
      .populate('branch', 'name')
      .populate('userCategory', 'name')
      .select('-password');
    res.json({ success: true, data: users });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.create(req.body);
    const populated = await User.findById(user._id)
      .populate('branch', 'name')
      .populate('userCategory', 'name')
      .select('-password');
    res.status(201).json({ success: true, data: populated });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const { password, ...rest } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, rest, { new: true })
      .populate('branch', 'name')
      .populate('userCategory', 'name')
      .select('-password');
    res.json({ success: true, data: user });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'User deactivated' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;

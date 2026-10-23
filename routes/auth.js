// routes/auth.js
const express = require('express');
const router = express.Router();
const { register, login, getMe, changePassword } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const User = require('../models/User');
router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.put('/changepassword', protect, changePassword);

// Restore admin role for the authenticated user's own account
// (only works if the user's userId is 'Admin')
router.post('/restore-admin', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('userId role');
    if (!user || user.userId !== 'Admin') {
      return res.status(403).json({ success: false, message: 'Not allowed' });
    }
    await User.findByIdAndUpdate(req.user.id, { role: 'admin' });
    res.json({ success: true, message: 'Admin role restored. Please log out and log back in.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

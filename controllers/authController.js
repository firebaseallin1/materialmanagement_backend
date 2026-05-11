const jwt = require('jsonwebtoken');
const User = require('../models/User');

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });

// @POST /api/auth/register
exports.register = async (req, res) => {
  try {
    const { name, userId, password, phone, role, branch } = req.body;
    const exists = await User.findOne({ userId });
    if (exists) return res.status(400).json({ success: false, message: 'User ID already registered' });
    const user = await User.create({ name, userId, password, phone, role, branch });
    res.status(201).json({ success: true, token: generateToken(user._id), user: { id: user._id, name: user.name, userId: user.userId, role: user.role } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { userId, password } = req.body;
    console.log(req.body);
    if (!userId || !password)
      {
      return res.status(400).json({ success: false, message: 'User ID and password required' });
      }
    const user = await User.findOne({ userId }).populate('branch');
    console.log(user);
    if (!user)
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    if (!user.isActive) return res.status(403).json({ success: false, message: 'Account deactivated' });
    res.json({ success: true, token: generateToken(user._id), user: { id: user._id, name: user.name, userId: user.userId, role: user.role, branch: user.branch } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @GET /api/auth/me
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('branch');
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @PUT /api/auth/changepassword
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);
    if (!(await user.matchPassword(currentPassword)))
      return res.status(400).json({ success: false, message: 'Current password incorrect' });
    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

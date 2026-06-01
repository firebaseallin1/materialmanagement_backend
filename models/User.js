const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  userId: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true, minlength: 6 },
  email: { type: String, trim: true, sparse: true, unique: true },
  phone: { type: String, trim: true },
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
  branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  userCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'UserCategory' },
  photo: { type: String },
  employees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
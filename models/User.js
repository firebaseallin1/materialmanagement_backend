const mongoose = require('mongoose');


const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  userId: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true, minlength: 6 },
  phone: { type: String, trim: true },
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
  branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });


module.exports = mongoose.model('User', userSchema);
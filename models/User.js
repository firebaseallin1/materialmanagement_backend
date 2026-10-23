const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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
}, {
  timestamps: true,
  toJSON: { transform: (_doc, ret) => { delete ret.password; return ret; } },
});

const isHashed = (pw) => typeof pw === 'string' && /^\$2[aby]\$\d{2}\$/.test(pw);

// Hash password on create / save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || isHashed(this.password)) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Hash password on findByIdAndUpdate / findOneAndUpdate
userSchema.pre('findOneAndUpdate', async function (next) {
  const update = this.getUpdate() || {};
  const target = update.$set && update.$set.password !== undefined ? update.$set : update;
  if (target.password && !isHashed(target.password)) {
    target.password = await bcrypt.hash(target.password, 10);
  }
  next();
});

// Compare entered password; supports legacy plain-text passwords
userSchema.methods.matchPassword = async function (entered) {
  if (!entered || !this.password) return false;
  if (isHashed(this.password)) return bcrypt.compare(entered, this.password);
  return entered === this.password;
};

userSchema.methods.isPasswordHashed = function () {
  return isHashed(this.password);
};

module.exports = mongoose.model('User', userSchema);

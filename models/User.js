const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String },
  password: { type: String, required: true },
  role: { type: String, enum: ["user", "admin"], default: "user" },
  canCount: { type: Number, default: 0 },
  monthlyTotal: { type: Number, default: 0 },
  canHistory: [
    {
      date: Date,
      countChanged: Number,
      totalCans: Number,
      totalPrice: Number,
    },
  ],
});

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
userSchema.methods.comparePassword = function (input) {
  return bcrypt.compare(input, this.password);
};

module.exports = mongoose.model("User", userSchema);

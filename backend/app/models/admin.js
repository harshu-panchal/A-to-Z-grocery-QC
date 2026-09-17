import mongoose from "mongoose";
import bcrypt from "bcrypt";

const adminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },

    password: {
      type: String,
      required: true,
      select: false,
    },

    role: {
      type: String,
      default: "admin",
    },
    isVerified: {
      type: Boolean,
      default: true, // Internal admins might be verified by default or via admin code
    },

    lastLogin: Date,

    // Audit fix H5: incremented on every password change/reset. Embedded in
    // the JWT at login and checked on every request by `verifyToken` so a
    // password change immediately invalidates every token issued before it,
    // instead of leaving a leaked token valid for the rest of its 7-day
    // lifetime.
    tokenVersion: {
      type: Number,
      default: 0,
      select: false,
    },
  },
  { timestamps: true },
);

// Hash password before saving
adminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password
adminSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

export default mongoose.model("Admin", adminSchema);

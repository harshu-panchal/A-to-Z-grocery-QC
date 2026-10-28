import mongoose from "mongoose";
import bcrypt from "bcrypt";

// A staff login created by a seller (works inside that seller's shop only) or
// by the admin team (works inside the admin panel). What the person may open
// is stored on the record itself as `permissions`: { "orders.orders": "edit" }.

const workingHoursSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    start: { type: String, default: "09:00" }, // HH:mm, shop time
    end: { type: String, default: "21:00" },
    days: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] }, // 0 = Sunday
  },
  { _id: false },
);

const staffSchema = new mongoose.Schema(
  {
    ownerType: { type: String, enum: ["seller", "admin"], required: true, index: true },
    // seller: the shop owner. admin: the admin who created the account (the
    // admin team shares one staff list; this id is only used as "acting as").
    ownerId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

    name: { type: String, required: true, trim: true, maxlength: 80 },
    jobTitle: { type: String, trim: true, maxlength: 60, default: "" },
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    password: { type: String, required: true, select: false },

    typeId: { type: mongoose.Schema.Types.ObjectId, ref: "StaffType", default: null },
    permissions: { type: mongoose.Schema.Types.Mixed, default: {} },
    workingHours: { type: workingHoursSchema, default: () => ({}) },

    isActive: { type: Boolean, default: true },
    // Bumped on password change / switch-off so older tokens stop working.
    tokenVersion: { type: Number, default: 0, select: false },
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true, minimize: false },
);

// One login id (email or phone) belongs to exactly one staff account.
staffSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" } } });
staffSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: "string" } } });

staffSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  return next();
});

staffSchema.methods.comparePassword = function comparePassword(entered) {
  return bcrypt.compare(String(entered), this.password);
};

export default mongoose.models.Staff || mongoose.model("Staff", staffSchema);

import mongoose from "mongoose";

// A quick button the owner created ("Night Cashier", "Returns Desk"...). It
// only pre-fills the Add Staff form; people created from it keep their own
// copy of the permissions.

const staffTypeSchema = new mongoose.Schema(
  {
    ownerType: { type: String, enum: ["seller", "admin"], required: true, index: true },
    // seller: the shop owner. admin: null (shared by the whole admin team).
    ownerId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    permissions: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true, minimize: false },
);

staffTypeSchema.index({ ownerType: 1, ownerId: 1, name: 1 }, { unique: true });

export default mongoose.models.StaffType || mongoose.model("StaffType", staffTypeSchema);

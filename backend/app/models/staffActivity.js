import mongoose from "mongoose";

// What staff did: one row per action (a bill created, a price changed, a
// login, a blocked attempt...). Rows expire automatically.

const staffActivitySchema = new mongoose.Schema(
  {
    ownerType: { type: String, enum: ["seller", "admin"], required: true },
    // seller: the shop owner (so each shop sees only its own staff).
    // admin: null (the whole admin team sees it).
    ownerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    staffId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    staffName: { type: String, trim: true },
    jobTitle: { type: String, trim: true },

    kind: { type: String, enum: ["login", "login_failed", "logout", "action", "blocked"], default: "action" },
    action: { type: String, trim: true, required: true }, // "Created a POS bill"
    detail: { type: String, trim: true, default: "" }, // "#INV-123 · ₹450"
    amount: { type: Number },
    method: { type: String },
    path: { type: String },
    status: { type: Number },
    ip: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

staffActivitySchema.index({ ownerType: 1, ownerId: 1, createdAt: -1 });
// Keep roughly six months of history.
staffActivitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

export default mongoose.models.StaffActivity || mongoose.model("StaffActivity", staffActivitySchema);

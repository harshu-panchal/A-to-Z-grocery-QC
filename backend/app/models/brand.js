import mongoose from "mongoose";

// Brand list sellers and admins pick from, so the same brand is never typed
// two ways ("Amul" / "amul" / "Amull"). Products keep the brand's name as text.

const brandSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // lower-case, single-spaced name: one brand per key
    key: { type: String, required: true, unique: true },
    // a seller's new brand waits for the admin; admin-made / imported ones are approved
    status: { type: String, enum: ["approved", "pending"], default: "approved", index: true },
    requestedBy: {
      role: { type: String, enum: ["seller", "admin"] },
      id: { type: mongoose.Schema.Types.ObjectId },
      name: { type: String, trim: true },
    },
  },
  { timestamps: true },
);

export default mongoose.model("Brand", brandSchema);

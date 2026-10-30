import mongoose from "mongoose";

// The owner collected the cash a staff member took at the counter.
// Covers [from, to); the next count starts at `to`. `floatLeft` is change
// money left in the drawer, counted again in the next period.

const staffCashCollectionSchema = new mongoose.Schema(
  {
    ownerType: { type: String, enum: ["seller", "admin"], required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, default: null }, // seller id; null for admin
    staffId: { type: mongoose.Schema.Types.ObjectId, required: true },
    staffName: { type: String, trim: true },

    from: { type: Date, required: true },
    to: { type: Date, required: true },

    expected: { type: Number, required: true }, // cash the staff member should hand over
    received: { type: Number, required: true }, // what the owner counted
    difference: { type: Number, required: true }, // received - expected (negative = short)
    floatLeft: { type: Number, default: 0 },

    // for the record: what made up the period
    breakdown: { type: mongoose.Schema.Types.Mixed, default: {} },
    note: { type: String, trim: true },

    collectedBy: { type: mongoose.Schema.Types.ObjectId },
    collectedByName: { type: String, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

staffCashCollectionSchema.index({ ownerType: 1, ownerId: 1, staffId: 1, to: -1 });

export default mongoose.model("StaffCashCollection", staffCashCollectionSchema);

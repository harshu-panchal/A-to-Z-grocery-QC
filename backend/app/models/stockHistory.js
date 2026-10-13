import mongoose from "mongoose";

const stockHistorySchema = new mongoose.Schema(
    {
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true,
        },
        seller: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Seller",
            required: true,
        },
        type: {
            type: String,
            enum: [
                "Restock", "Sale", "Correction", "Reservation", "Release",
                // POS ledger
                "POS Sale", "POS Edit Restore", "POS Edit Deduct", "POS Cancel Restore",
                "Purchase", "Exchange In", "Exchange Out", "Stock Count",
            ],
            required: true,
        },
        quantity: {
            type: Number, // Positive for restock, negative for sale/correction
            required: true,
        },
        note: {
            type: String,
            trim: true,
        },
        order: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Order",
        },
        // POS fields (unset for online-order rows)
        source: {
            type: String,
            enum: ["ONLINE", "POS", "PURCHASE", "MANUAL", "AUDIT"],
        },
        variantSku: { type: String, trim: true },
        posOrder: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PosOrder",
        },
        stockAfter: Number,
        createdByRole: { type: String, enum: ["admin", "seller"] },
        createdBy: { type: mongoose.Schema.Types.ObjectId },
    },
    { timestamps: true }
);

stockHistorySchema.index({ product: 1, seller: 1, createdAt: -1 });
stockHistorySchema.index({ order: 1 });
stockHistorySchema.index({ type: 1 });
stockHistorySchema.index({ source: 1, seller: 1, createdAt: -1 });

export default mongoose.model("StockHistory", stockHistorySchema);

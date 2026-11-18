import mongoose from "mongoose";
import { ALL_USER_MODEL_NAMES_WITH_LEGACY } from "../constants/refModels.js";

export const TICKET_CATEGORIES = [
    "order",
    "delivery",
    "payment",
    "refund",
    "account",
    "product",
    "payout",
    "kyc",
    "general",
];

const ticketSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        // Phase 5 P5-2: enum widened to include canonical "User" / "Delivery"
        // while still accepting legacy "Customer" / "Rider" rows. The
        // migration script rewrites existing values to the canonical form;
        // new code should write the canonical names.
        userType: {
            type: String,
            enum: ALL_USER_MODEL_NAMES_WITH_LEGACY,
            required: true,
        },
        subject: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            required: true,
        },
        // What the ticket is about. Order-type categories usually carry an
        // orderId; account/general ones never do.
        category: {
            type: String,
            enum: TICKET_CATEGORIES,
            default: "general",
        },
        // Human order id (Order.orderId, e.g. "ORD…") when raised for a
        // specific order; `order` is the resolved ObjectId for joins.
        orderId: {
            type: String,
            trim: true,
            default: "",
        },
        order: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Order",
            default: null,
        },
        priority: {
            type: String,
            enum: ["low", "medium", "high"],
            default: "medium",
        },
        status: {
            type: String,
            enum: ["open", "processing", "closed"],
            default: "open",
        },
        messages: [
            {
                sender: {
                    type: String,
                    required: true,
                },
                senderId: {
                    type: mongoose.Schema.Types.ObjectId,
                    refPath: 'messages.senderType',
                },
                senderType: {
                    type: String,
                    enum: ["User", "Admin"],
                    required: true,
                },
                text: {
                    type: String,
                    default: "",
                    required: function requiredText() {
                        return !this.mediaUrl;
                    },
                },
                mediaUrl: {
                    type: String,
                    default: "",
                    trim: true,
                },
                mediaType: {
                    type: String,
                    enum: ["", "image"],
                    default: "",
                    trim: true,
                },
                mimeType: {
                    type: String,
                    default: "",
                    trim: true,
                },
                createdAt: {
                    type: Date,
                    default: Date.now,
                },
                isAdmin: {
                    type: Boolean,
                    default: false,
                }
            },
        ],
    },
    { timestamps: true }
);

ticketSchema.index({ userId: 1, userType: 1, createdAt: -1 });
ticketSchema.index({ status: 1, priority: 1 });
ticketSchema.index({ userId: 1, orderId: 1, status: 1 });
ticketSchema.index({ userType: 1, status: 1, createdAt: -1 });

export default mongoose.model("Ticket", ticketSchema);

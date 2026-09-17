import mongoose from "mongoose";

export const LEGAL_AUDIENCES = ["customer", "seller", "delivery"];
export const LEGAL_PAGE_TYPES = ["terms", "privacy", "about", "support"];

const legalContentSchema = new mongoose.Schema(
  {
    audience: {
      type: String,
      enum: LEGAL_AUDIENCES,
      required: true,
      index: true,
    },
    pageType: {
      type: String,
      enum: LEGAL_PAGE_TYPES,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    contentHtml: {
      type: String,
      default: "",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

legalContentSchema.index({ audience: 1, pageType: 1 }, { unique: true });

export default mongoose.model("LegalContent", legalContentSchema);

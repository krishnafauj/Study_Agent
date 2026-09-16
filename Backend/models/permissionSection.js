import mongoose from "mongoose";

/**
 * PermissionSection
 *
 * A named page range ("dedicated section") on a file. The file owner defines
 * these; grants approve a user for a subset of them. Page ranges may overlap or
 * be non-contiguous across sections.
 *
 * Parsing is now per-section: creating a section immediately parses ONLY its
 * pages (extract → chunk → LLM → embed), so a big book is processed section by
 * section instead of all at once. These fields track that parse.
 *   parseStatus: unparsed → parsing → parsed | failed
 */
const permissionSectionSchema = new mongoose.Schema(
  {
    fileId: { type: String, required: true, index: true }, // = UserFile._id
    userId: { type: String, required: true, index: true }, // owner who created it
    title: { type: String, required: true }, // e.g. "Chapter 2: Laws of Motion"
    pageStart: { type: Number, required: true },
    pageEnd: { type: Number, required: true },
    order: { type: Number, default: 0 },

    // ── Per-section parse state ──
    parseStatus: {
      type: String,
      enum: ["unparsed", "parsing", "parsed", "failed"],
      default: "unparsed",
      index: true,
    },
    parseProgress: { type: Number, default: 0 }, // 0-100
    topicsCreated: { type: Number, default: 0 },
    parsedAt: { type: Date, default: null },
    parseError: { type: String, default: null },
  },
  { timestamps: true }
);

permissionSectionSchema.index({ fileId: 1, order: 1 });

const PermissionSection = mongoose.model(
  "PermissionSection",
  permissionSectionSchema
);

export default PermissionSection;

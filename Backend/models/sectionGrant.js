import mongoose from "mongoose";

/**
 * SectionGrant
 *
 * Turns "user X can chat with this book" into "user X can access ONLY these
 * sub-parts (sections), each at a specific permission mode".
 *
 *   mode "assign" → the section's pages ARE parsed; the student can chat about it.
 *   mode "see"    → the student can view the section's topics/outline read-only;
 *                   it is NOT parsed into chat.
 *
 * One document per (file, invited user). The server always derives a caller's
 * scope from this document, never from client input.
 */
const grantedSectionSchema = new mongoose.Schema(
  {
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PermissionSection",
      required: true,
    },
    mode: {
      type: String,
      enum: ["assign", "see"],
      default: "assign",
    },
  },
  { _id: false }
);

const sectionGrantSchema = new mongoose.Schema(
  {
    fileId: { type: String, required: true, index: true }, // = UserFile._id
    grantedToEmail: { type: String, required: true, index: true, lowercase: true, trim: true },
    grantedToUserId: { type: String, default: null, index: true }, // filled once known
    sections: { type: [grantedSectionSchema], default: [] },
    grantedBy: { type: String, required: true }, // owner userId
    status: {
      type: String,
      enum: ["active", "revoked"],
      default: "active",
    },
  },
  { timestamps: true }
);

// One grant per user per file — updating re-approves the same document.
sectionGrantSchema.index({ fileId: 1, grantedToEmail: 1 }, { unique: true });

const SectionGrant = mongoose.model("SectionGrant", sectionGrantSchema);

export default SectionGrant;

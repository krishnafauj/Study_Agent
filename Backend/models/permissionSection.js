import mongoose from "mongoose";

/**
 * PermissionSection
 *
 * A named page range ("dedicated section") on a file, used purely for access
 * control. The file owner defines these; grants approve a user for a subset of
 * them. Page ranges may overlap or be non-contiguous across sections.
 */
const permissionSectionSchema = new mongoose.Schema(
  {
    fileId: { type: String, required: true, index: true }, // = UserFile._id
    userId: { type: String, required: true, index: true }, // owner who created it
    title: { type: String, required: true }, // e.g. "Chapter 2: Laws of Motion"
    pageStart: { type: Number, required: true },
    pageEnd: { type: Number, required: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

permissionSectionSchema.index({ fileId: 1, order: 1 });

const PermissionSection = mongoose.model(
  "PermissionSection",
  permissionSectionSchema
);

export default PermissionSection;

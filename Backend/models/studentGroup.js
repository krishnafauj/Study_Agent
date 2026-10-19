import mongoose from "mongoose";

/**
 * StudentGroup
 *
 * A reusable list of students owned by a teacher. Created by hand or from an
 * imported Excel/CSV sheet; later assigned to books as a whole.
 */
const memberSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: "" },
    email: { type: String, required: true, lowercase: true, trim: true },
  },
  { _id: false }
);

const studentGroupSchema = new mongoose.Schema(
  {
    ownerId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, default: "", maxlength: 500 },
    members: { type: [memberSchema], default: [] },
  },
  { timestamps: true }
);

// One group name per owner
studentGroupSchema.index({ ownerId: 1, name: 1 }, { unique: true });

export default mongoose.models.StudentGroup ||
  mongoose.model("StudentGroup", studentGroupSchema);

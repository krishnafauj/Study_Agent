import mongoose from "mongoose";

const userFileSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    fileName: { type: String, required: true },
    s3Key: { type: String, required: true },
    fileSize: { type: Number, required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const UserFile = mongoose.model("UserFile", userFileSchema);
export default UserFile;

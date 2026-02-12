import mongoose from "mongoose";

const connectDB = async () => {
  try {
    // Prevent multiple connections
    if (mongoose.connection.readyState >= 1) {
      console.log("MongoDB already connected");
      return;
    }

    // Make sure env variable name matches your .env
    await mongoose.connect(process.env.MONGODB_URI);

    console.log("MongoDB connected");

  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1); // stop server if DB fails
  }
};

export default connectDB;

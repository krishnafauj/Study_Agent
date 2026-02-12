import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import connectDB from "./models/MongoConnect.js";
import apiRoutes from "./Route/Route.js";

const app = express();

console.log("Route loaded");

app.use(cors());
app.use(express.json());
app.use("/api", apiRoutes);

const PORT = process.env.PORT || 4000;

async function startServer() {
  try {

    // ⭐ Connect MongoDB FIRST
    await connectDB();

    console.log("Starting server...");

    app.listen(PORT, () => {
      console.log(`Server started on port ${PORT}`);
    });

  } catch (err) {
    console.error("Failed to start server:", err);
  }
}

startServer();

import mongoose from "mongoose";
import dotenv from "dotenv";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import UserFile from "./models/userFile.js";

dotenv.config();

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function run() {
  try {
    const { extractFirstPageText, deriveDynamicFileName } = await import("./services/pdfHierarchyService.js");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    const files = await UserFile.find({});
    console.log(`Found ${files.length} files to migrate.`);

    for (const file of files) {
      try {
        console.log(`Processing file: ${file.fileName}`);
        const command = new GetObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: file.s3Key,
        });
        const response = await s3Client.send(command);
        const pdfBuffer = Buffer.from(await response.Body.transformToByteArray());
        
        const firstPageText = await extractFirstPageText(pdfBuffer);
        const dynamicName = deriveDynamicFileName(firstPageText, file.fileName);
        
        if (dynamicName !== file.fileName) {
          console.log(`Renaming: ${file.fileName} -> ${dynamicName}`);
          file.fileName = dynamicName;
          await file.save();
        } else {
          console.log(`Keeping name: ${file.fileName}`);
        }
      } catch (err) {
        console.error(`Error processing ${file.fileName}: ${err.message}`);
      }
    }

    console.log("Migration complete.");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();

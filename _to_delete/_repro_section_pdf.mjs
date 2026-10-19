import dotenv from "dotenv"; dotenv.config({ path: process.cwd() + "/.env" });
import mongoose from "mongoose";
const { default: UserFile } = await import(process.cwd() + "/models/userFile.js");
const { getFileBuffer } = await import(process.cwd() + "/services/s3Service.js");
const { PDFDocument } = await import("pdf-lib");
try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  const f = await UserFile.findById("6aaa68ebe8d3adc747c33ffc").lean();
  console.log("s3Key:", f?.s3Key);
  const buf = await getFileBuffer(f.s3Key);
  console.log("bytes:", buf.length, buf.subarray(0, 8).toString());
  const src = await PDFDocument.load(buf, { ignoreEncryption: true });
  console.log("pages:", src.getPageCount());
  const out = await PDFDocument.create();
  const p = await out.copyPages(src, [5,6,7,8,9]); p.forEach(x => out.addPage(x));
  console.log("ok out bytes:", (await out.save()).length);
} catch (e) { console.error("ERR:", e.name, e.message, e.stack?.split("\n").slice(0,4).join("\n")); }
process.exit(0);

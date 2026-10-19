import dotenv from "dotenv"; dotenv.config();
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { PDFDocument } from "pdf-lib";
const s3 = new S3Client({ region: process.env.S3_REGION || "us-east-1", credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY } });
try {
  const l = await s3.send(new ListObjectsV2Command({ Bucket: process.env.S3_BUCKET, MaxKeys: 200 }));
  const hits = (l.Contents || []).filter(o => /CODING/i.test(o.Key));
  console.log("matches:", hits.map(h => h.Key + " " + h.Size));
  for (const h of hits.slice(0, 2)) {
    const r = await s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: h.Key }));
    const buf = Buffer.from(await r.Body.transformToByteArray());
    try {
      const src = await PDFDocument.load(buf, { ignoreEncryption: true });
      const n = src.getPageCount();
      const out = await PDFDocument.create();
      (await out.copyPages(src, [5,6,7,8,9].filter(i => i < n))).forEach(p => out.addPage(p));
      console.log(h.Key, "pages", n, "-> out bytes", (await out.save()).length);
    } catch (e) { console.error("PDF ERR", h.Key, e.name, e.message, "\n", e.stack?.split("\n").slice(1,4).join("\n")); }
  }
} catch (e) { console.error("S3 ERR", e.name, e.message); }

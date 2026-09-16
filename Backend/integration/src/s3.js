import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { logger } from "./logger.js";

let _client = null;
function client() {
  if (_client) return _client;
  _client = new S3Client({
    region: process.env.AWS_REGION || "us-east-1",
    credentials: process.env.AWS_ACCESS_KEY_ID
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined, // fall back to default provider chain (IAM role, etc.)
  });
  return _client;
}

export async function fetchPdfFromS3(s3Key, bucket = process.env.S3_BUCKET) {
  logger.info("S3", `Fetching s3://${bucket}/${s3Key}`);
  const res = await client().send(new GetObjectCommand({ Bucket: bucket, Key: s3Key }));
  const buf = Buffer.from(await res.Body.transformToByteArray());
  logger.info("S3", `Downloaded ${buf.length} bytes`);
  return buf;
}

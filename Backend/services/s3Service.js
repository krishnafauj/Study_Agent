import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getS3Client() {
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;
  const region = process.env.S3_REGION || "us-east-1";

  if (!accessKeyId || !secretAccessKey || !process.env.S3_BUCKET) {
    throw new Error("S3 not configured: set S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET");
  }

  return new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export async function uploadFileToS3(fileBuffer, originalName, userId) {
  const s3 = getS3Client();
  const key = `${userId}/${Date.now()}_${originalName}`;

  const cmd = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
    Body: fileBuffer,
    ContentType: "application/pdf",
  });

  await s3.send(cmd);
  return key;
}

// Download a file's raw bytes from S3 as a Buffer (used for per-section parsing).
// Uses the same credentials as upload, so it works wherever upload already does.
export async function getFileBuffer(s3Key) {
  const s3 = getS3Client();
  const cmd = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: s3Key,
  });
  const res = await s3.send(cmd);
  return Buffer.from(await res.Body.transformToByteArray());
}

export async function getFileDownloadUrl(s3Key) {
  const s3 = getS3Client();
  const cmd = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: s3Key,
  });
  return getSignedUrl(s3, cmd, { expiresIn: 60 * 60 });
}

export async function deleteFileFromS3(s3Key) {
  const s3 = getS3Client();
  const cmd = new DeleteObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: s3Key,
  });
  await s3.send(cmd);
}

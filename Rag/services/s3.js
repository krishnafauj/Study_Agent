import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl as awsGetSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

let s3Client = null;

function getS3Client() {
  if (s3Client) return s3Client;

  const accessKey = process.env.S3_ACCESS_KEY;
  const secretKey = process.env.S3_SECRET_KEY;
  const region = process.env.S3_REGION || 'ap-south-1';

  if (!accessKey || accessKey === 'your-access-key') {
    return null;
  }

  s3Client = new S3Client({
    region,
    credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    },
  });

  return s3Client;
}

/**
 * Upload a file buffer to S3
 * @param {Buffer} fileBuffer
 * @param {string} originalName
 * @param {string} folderName
 * @returns {Promise<string>} The S3 key
 */
export async function uploadToS3(fileBuffer, originalName, folderName) {
  const client = getS3Client();
  if (!client) {
    throw new Error('S3 is not configured. Please set S3_ACCESS_KEY, S3_SECRET_KEY, and S3_BUCKET in .env');
  }

  const ext = originalName.split('.').pop();
  const key = `rag/${folderName}/${uuidv4()}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
    Body: fileBuffer,
    ContentType: 'application/pdf',
  });

  await client.send(command);
  return key;
}

/**
 * Get a pre-signed download URL for an S3 object
 * @param {string} key
 * @returns {Promise<string>}
 */
export async function getSignedDownloadUrl(key) {
  const client = getS3Client();
  if (!client) {
    throw new Error('S3 is not configured.');
  }

  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
  });

  return awsGetSignedUrl(client, command, { expiresIn: 3600 });
}

/**
 * Check if S3 is configured
 */
export function isS3Configured() {
  return getS3Client() !== null;
}

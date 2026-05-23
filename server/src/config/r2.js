const { S3Client } = require("@aws-sdk/client-s3");

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

let s3Client = null;

if (accountId && accessKeyId && secretAccessKey) {
  s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
} else {
  console.warn("Cloudflare R2 credentials not provided in .env. R2 uploads will fail.");
}

module.exports = {
  s3Client,
  bucketName: process.env.R2_BUCKET_NAME || "plotviewer-3d-models",
  publicUrl: process.env.R2_PUBLIC_URL || "", // Optional public R2 URL like https://pub-xxxx.r2.dev
};

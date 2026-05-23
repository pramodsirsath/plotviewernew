const admin = require("firebase-admin");

let bucket = null;

try {
  // If FIREBASE_SERVICE_ACCOUNT_PATH is provided, use it. Otherwise, look for base64 encoded JSON
  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const path = require("path");
    const serviceAccountPath = path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "your-project-id.appspot.com",
    });
    bucket = admin.storage().bucket();
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const serviceAccount = JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf-8")
    );
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "your-project-id.appspot.com",
    });
    bucket = admin.storage().bucket();
  } else {
    console.warn("Firebase Admin SDK not initialized. Missing FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_BASE64 in .env");
  }
} catch (error) {
  console.error("Firebase Admin initialization error:", error);
}

module.exports = {
  admin,
  bucket,
};

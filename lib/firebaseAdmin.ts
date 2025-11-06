// lib/firebaseAdmin.ts
import admin from "firebase-admin";

if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Missing Firebase Admin credentials");
  }
  // Vercelの環境変数は \n がエスケープされていることが多い
  privateKey = privateKey.replace(/\\n/g, "\n");

  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
}

export const adminAuth = admin.auth();
export const adminDb = admin.firestore();
export const FieldValue = admin.firestore.FieldValue;
export const adminFs = admin.firestore;
export default admin;

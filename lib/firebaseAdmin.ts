// lib/firebaseAdmin.ts
import { initializeApp, getApps, cert, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const hasEnv =
  process.env.FIREBASE_PROJECT_ID &&
  process.env.FIREBASE_CLIENT_EMAIL &&
  process.env.FIREBASE_PRIVATE_KEY;

if (!getApps().length) {
  if (hasEnv) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID!,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
        privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
      }),
    });
  } else {
    // ローカルで gcloud auth application-default login してるならこれでもOK
    initializeApp({
      credential: applicationDefault(),
    });
  }
}

export const adminAuth = getAuth();
export const adminDb = getFirestore();


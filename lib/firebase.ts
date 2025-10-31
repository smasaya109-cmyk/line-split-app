import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBybt9HJ7sy2C8j91fHGbXp0FQXkKBXiKM",
  authDomain: "line-split-app.firebaseapp.com",
  projectId: "line-split-app",
  storageBucket: "line-split-app.firebasestorage.app",
  messagingSenderId: "28904665289",
  appId: "1:28904665289:web:eef63b9d956620ff359d18",
  measurementId: "G-3PMCMWWF25V",
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
export const db = getFirestore(app);

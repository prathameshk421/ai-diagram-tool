import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

export type FirebaseServices = {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
};

function readConfig() {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if (!apiKey || !authDomain || !projectId) return null;
  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
}

let cached: FirebaseServices | null | undefined;

export function getFirebase(): FirebaseServices | null {
  if (cached !== undefined) return cached;
  const config = readConfig();
  if (!config) {
    cached = null;
    return cached;
  }
  const app = initializeApp(config);
  cached = { app, auth: getAuth(app), db: getFirestore(app) };
  return cached;
}

export function isFirebaseConfigured(): boolean {
  return getFirebase() !== null;
}

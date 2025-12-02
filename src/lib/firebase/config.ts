import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyB58gokZwQOZFTNdqAO-QE7jILjUyAoVjk",
    authDomain: "crm-lawgic-pi.firebaseapp.com",
    projectId: "crm-lawgic-pi",
    storageBucket: "crm-lawgic-pi.firebasestorage.app",
    messagingSenderId: "140222958602",
    appId: "1:140222958602:web:899af7c96ee4214d74a3f3"
};

// Initialize Firebase (singleton pattern to avoid re-initialization errors in dev)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };

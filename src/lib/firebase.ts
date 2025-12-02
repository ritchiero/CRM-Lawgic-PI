import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
    apiKey: "AIzaSyB58gokZwQOZFTNdqAO-QE7jILjUyAoVjk",
    authDomain: "crm-lawgic-pi.firebaseapp.com",
    projectId: "crm-lawgic-pi",
    storageBucket: "crm-lawgic-pi.firebasestorage.app",
    messagingSenderId: "140222958602",
    appId: "1:140222958602:web:899af7c96ee4214d74a3f3"
};

// Initialize Firebase only if it hasn't been initialized
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize services
export const db = getFirestore(app);
export const auth = getAuth(app);

export default app;

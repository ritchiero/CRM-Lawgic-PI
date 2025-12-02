import { auth, db } from "./config";
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut as firebaseSignOut,
    updateProfile,
    User
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";

// Define User Role type
export type UserRole = 'admin' | 'user';

// Define User Profile interface
export interface UserProfile {
    uid: string;
    email: string;
    displayName?: string;
    role: UserRole;
    createdAt: any; // Firestore Timestamp
    lastLogin: any; // Firestore Timestamp
}

// Sign Up Function
export const signUp = async (email: string, password: string, displayName: string) => {
    try {
        // 1. Create user in Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 2. Update display name
        await updateProfile(user, { displayName });

        // 3. Create user document in Firestore
        const userProfile: UserProfile = {
            uid: user.uid,
            email: user.email!,
            displayName,
            role: 'user', // Default role
            createdAt: serverTimestamp(),
            lastLogin: serverTimestamp()
        };

        await setDoc(doc(db, "users", user.uid), userProfile);

        return user;
    } catch (error) {
        console.error("Error signing up:", error);
        throw error;
    }
};

// Sign In Function
export const signIn = async (email: string, password: string) => {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);

        // Update last login
        const userRef = doc(db, "users", userCredential.user.uid);
        await setDoc(userRef, { lastLogin: serverTimestamp() }, { merge: true });

        return userCredential.user;
    } catch (error) {
        console.error("Error signing in:", error);
        throw error;
    }
};

// Sign Out Function
export const signOut = async () => {
    try {
        await firebaseSignOut(auth);
    } catch (error) {
        console.error("Error signing out:", error);
        throw error;
    }
};

// Get User Profile
export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
    try {
        const userDoc = await getDoc(doc(db, "users", uid));
        if (userDoc.exists()) {
            return userDoc.data() as UserProfile;
        }
        return null;
    } catch (error) {
        console.error("Error fetching user profile:", error);
        throw error;
    }
};

import {
    signInWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    signOut,
    onAuthStateChanged,
    User,
    sendPasswordResetEmail,
    updateProfile
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, getDocs, collection } from 'firebase/firestore';
import { getAuthInstance, getDbInstance } from '@/lib/firebase';

export interface UserData {
    uid: string;
    email: string;
    displayName: string;
    role: 'admin' | 'user';
    active: boolean;
    createdAt: Date;
    lastLogin?: Date;
}

// Sign in with Google
export const signInWithGoogle = async (): Promise<UserData> => {
    try {
        const auth = getAuthInstance();
        const db = getDbInstance();
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        const user = result.user;

        // Get or create user data
        let userData = await getUserData(user.uid);

        if (!userData) {
            // Create new user document if it doesn't exist
            userData = {
                uid: user.uid,
                email: user.email || '',
                displayName: user.displayName || user.email?.split('@')[0] || 'Usuario',
                role: 'user', // Default role
                active: true,
                createdAt: new Date(),
                lastLogin: new Date()
            };

            await setDoc(doc(db, 'users', user.uid), {
                ...userData,
                createdAt: serverTimestamp(),
                lastLogin: serverTimestamp()
            });
        }

        return userData;
    } catch (error: any) {
        console.error('Google sign-in error:', error);

        if (error.code === 'auth/popup-closed-by-user') {
            throw new Error('Inicio de sesión cancelado');
        }
        if (error.code === 'auth/popup-blocked') {
            throw new Error('Popup bloqueado. Permite popups para este sitio');
        }

        throw error;
    }
};

// Sign in with email and password
export const login = async (email: string, password: string): Promise<UserData> => {
    try {
        const auth = getAuthInstance();
        const db = getDbInstance();
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Get or create additional user data from Firestore
        let userData = await getUserData(user.uid);

        if (!userData) {
            // Create user document if it doesn't exist
            userData = {
                uid: user.uid,
                email: user.email || email,
                displayName: user.displayName || user.email?.split('@')[0] || 'Usuario',
                role: 'user',
                active: true,
                createdAt: new Date(),
                lastLogin: new Date()
            };

            await setDoc(doc(db, 'users', user.uid), {
                ...userData,
                createdAt: serverTimestamp(),
                lastLogin: serverTimestamp()
            });
        }

        if (!userData.active) {
            await signOut(auth);
            throw new Error('Cuenta de usuario inactiva');
        }

        return userData;
    } catch (error: any) {
        console.error('Login error:', error);

        // Friendly error messages
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
            throw new Error('Email o contraseña incorrectos');
        }
        if (error.code === 'auth/user-not-found') {
            throw new Error('Usuario no encontrado');
        }
        if (error.code === 'auth/too-many-requests') {
            throw new Error('Demasiados intentos. Intenta más tarde');
        }

        throw error;
    }
};

// Sign out
export const logout = async (): Promise<void> => {
    try {
        await signOut(getAuthInstance());
    } catch (error) {
        console.error('Logout error:', error);
        throw error;
    }
};

// Update user profile
export const updateUserProfile = async (uid: string, data: Partial<UserData>): Promise<void> => {
    try {
        const auth = getAuthInstance();
        const db = getDbInstance();
        const userRef = doc(db, 'users', uid);
        await setDoc(userRef, data, { merge: true });

        // Also update Firebase Auth profile if displayName is changed
        if (data.displayName && auth.currentUser && auth.currentUser.uid === uid) {
            await updateProfile(auth.currentUser, {
                displayName: data.displayName
            });
        }
    } catch (error) {
        console.error('Error updating user profile:', error);
        throw error;
    }
};

// Get all users (for mapping UIDs to names)
export const getAllUsers = async (): Promise<UserData[]> => {
    try {
        const db = getDbInstance();
        const usersSnapshot = await getDocs(collection(db, 'users'));
        return usersSnapshot.docs.map(doc => ({
            uid: doc.id,
            ...doc.data()
        } as UserData));
    } catch (error) {
        console.error('Error fetching all users:', error);
        return [];
    }
};

// Get user data from Firestore
export const getUserData = async (uid: string): Promise<UserData | null> => {
    try {
        const db = getDbInstance();
        const userDoc = await getDoc(doc(db, 'users', uid));

        if (!userDoc.exists()) {
            return null;
        }

        const data = userDoc.data();
        return {
            uid,
            email: data.email,
            displayName: data.displayName,
            role: data.role,
            active: data.active,
            createdAt: data.createdAt?.toDate() || new Date(),
            lastLogin: data.lastLogin?.toDate()
        };
    } catch (error) {
        console.error('Error fetching user data:', error);
        return null;
    }
};

// Listen to auth state changes
export const onAuthChange = (callback: (user: User | null) => void) => {
    return onAuthStateChanged(getAuthInstance(), callback);
};

// Send password reset email
export const resetPassword = async (email: string): Promise<void> => {
    try {
        await sendPasswordResetEmail(getAuthInstance(), email);
    } catch (error: any) {
        console.error('Password reset error:', error);

        if (error.code === 'auth/user-not-found') {
            throw new Error('No existe una cuenta con este email');
        }
        if (error.code === 'auth/invalid-email') {
            throw new Error('Email inválido');
        }

        throw error;
    }
};

// Get current user
export const getCurrentUser = (): User | null => {
    return getAuthInstance().currentUser;
};

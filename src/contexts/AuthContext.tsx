"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User } from 'firebase/auth';
import { onAuthChange, getUserData, login, logout, signInWithGoogle } from '@/services/authService';

export interface UserData {
    uid: string;
    email: string;
    displayName: string;
    role: 'admin' | 'user';
    active: boolean;
    tagColor?: string;
}

interface AuthContextType {
    user: User | null;
    userData: UserData | null;
    loading: boolean;
    login: (email: string, password: string) => Promise<void>;
    loginWithGoogle: () => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [userData, setUserData] = useState<UserData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthChange(async (firebaseUser) => {
            setUser(firebaseUser);

            if (firebaseUser) {
                // Fetch additional user data from Firestore
                const data = await getUserData(firebaseUser.uid);
                setUserData(data);
            } else {
                setUserData(null);
            }

            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleLogin = async (email: string, password: string) => {
        const data = await login(email, password);
        setUserData(data);
    };

    const handleLoginWithGoogle = async () => {
        const data = await signInWithGoogle();
        setUserData(data);
    };

    const handleLogout = async () => {
        await logout();
        setUserData(null);
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                userData,
                loading,
                login: handleLogin,
                loginWithGoogle: handleLoginWithGoogle,
                logout: handleLogout
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

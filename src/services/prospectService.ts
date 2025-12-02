import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    query,
    where,
    orderBy,
    onSnapshot,
    Timestamp,
    serverTimestamp
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';

export interface Prospect {
    id: string;
    name: string;
    company: string;
    email: string;
    phone: string;
    notes: string;
    stage: string;
    createdAt: Date;
    updatedAt?: Date;
    createdBy: string;
    history: Array<{
        stage: string;
        date: Date;
        movedBy?: string;
    }>;
}

// Create a new prospect
export const createProspect = async (prospectData: Omit<Prospect, 'id' | 'createdAt' | 'stage' | 'history' | 'createdBy' | 'updatedAt'>) => {
    try {
        const user = auth.currentUser;
        const userId = user?.uid || 'anonymous';

        const now = new Date();
        const newProspect = {
            ...prospectData,
            stage: 'Detección de prospecto',
            createdAt: Timestamp.fromDate(now),
            updatedAt: serverTimestamp(),
            createdBy: userId,
            history: [{
                stage: 'Detección de prospecto',
                date: Timestamp.fromDate(now),
                movedBy: userId
            }]
        };

        const docRef = await addDoc(collection(db, 'prospects'), newProspect);
        return docRef.id;
    } catch (error) {
        console.error('Error creating prospect:', error);
        throw error;
    }
};

// Update a prospect
export const updateProspect = async (id: string, updates: Partial<Prospect>) => {
    try {
        const prospectRef = doc(db, 'prospects', id);
        await updateDoc(prospectRef, {
            ...updates,
            updatedAt: serverTimestamp()
        });
    } catch (error) {
        console.error('Error updating prospect:', error);
        throw error;
    }
};

// Delete a prospect
export const deleteProspect = async (id: string) => {
    try {
        const prospectRef = doc(db, 'prospects', id);
        await deleteDoc(prospectRef);
    } catch (error) {
        console.error('Error deleting prospect:', error);
        throw error;
    }
};

// Move prospect to a new stage
export const moveProspectToStage = async (id: string, newStage: string, currentHistory: Array<{ stage: string; date: Date; movedBy?: string }>) => {
    try {
        const user = auth.currentUser;
        const userId = user?.uid || 'anonymous';

        const prospectRef = doc(db, 'prospects', id);

        const newHistoryEntry = {
            stage: newStage,
            date: Timestamp.fromDate(new Date()),
            movedBy: userId
        };

        await updateDoc(prospectRef, {
            stage: newStage,
            history: [...currentHistory.map(h => ({
                ...h,
                date: h.date instanceof Date ? Timestamp.fromDate(h.date) : h.date
            })), newHistoryEntry],
            updatedAt: serverTimestamp()
        });
    } catch (error) {
        console.error('Error moving prospect:', error);
        throw error;
    }
};

// Subscribe to all prospects (real-time)
export const subscribeToProspects = (callback: (prospects: Prospect[]) => void) => {
    try {
        const q = query(
            collection(db, 'prospects'),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const prospects: Prospect[] = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    createdAt: data.createdAt?.toDate() || new Date(),
                    updatedAt: data.updatedAt?.toDate(),
                    history: data.history?.map((h: any) => ({
                        ...h,
                        date: h.date?.toDate() || new Date()
                    })) || []
                } as Prospect;
            });
            callback(prospects);
        }, (error) => {
            console.error('Error subscribing to prospects:', error);
        });

        return unsubscribe;
    } catch (error) {
        console.error('Error setting up subscription:', error);
        throw error;
    }
};

// Subscribe to prospects by stage
export const subscribeToProspectsByStage = (stage: string, callback: (prospects: Prospect[]) => void) => {
    try {
        const q = query(
            collection(db, 'prospects'),
            where('stage', '==', stage),
            orderBy('updatedAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const prospects: Prospect[] = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    createdAt: data.createdAt?.toDate() || new Date(),
                    updatedAt: data.updatedAt?.toDate(),
                    history: data.history?.map((h: any) => ({
                        ...h,
                        date: h.date?.toDate() || new Date()
                    })) || []
                } as Prospect;
            });
            callback(prospects);
        }, (error) => {
            console.error('Error subscribing to prospects by stage:', error);
        });

        return unsubscribe;
    } catch (error) {
        console.error('Error setting up stage subscription:', error);
        throw error;
    }
};

import {
    collection,
    addDoc,
    deleteDoc,
    deleteField,
    doc,
    query,
    where,
    orderBy,
    onSnapshot,
    Timestamp,
    serverTimestamp,
    getDocs,
    writeBatch
} from 'firebase/firestore';
import { getDbInstance, getAuthInstance } from '@/lib/firebase';

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
    leadSource?: string;
    history: Array<{
        stage: string;
        date: Date;
        movedBy?: string;
    }>;
    // Client data fields (post-sale)
    brandCount?: number;
    subscriptionStartDate?: Date;
    accountValue?: number; // Valor de cuenta en USD
    // Potential value (for "Demo realizada" stage)
    potentialValue?: number; // Valor potencial en USD
    // Follow-up date (for "Demo realizada" stage)
    nextContactDate?: Date;
    // Scheduled demo date/time (for "Cita Demo" stage)
    scheduledDemoDate?: Date;
    // Social media
    linkedinUrl?: string;
}

type FirestoreHistoryEntry = Record<string, unknown> & {
    date?: { toDate?: () => Date };
};

const TARGET_MIRRORED_FIELDS = new Set<keyof Prospect>([
    'company',
    'email',
    'phone',
    'stage',
    'leadSource',
    'brandCount',
    'subscriptionStartDate',
    'accountValue',
    'potentialValue',
    'nextContactDate',
    'scheduledDemoDate',
    'linkedinUrl'
]);

// Create a new prospect
export const createProspect = async (prospectData: Omit<Prospect, 'id' | 'createdAt' | 'stage' | 'history' | 'createdBy' | 'updatedAt'>) => {
    try {
        const auth = getAuthInstance();
        const db = getDbInstance();
        const user = auth.currentUser;
        const userId = user?.uid || 'anonymous';

        // Filter out undefined values (Firestore doesn't accept undefined)
        const filteredData = Object.fromEntries(
            Object.entries(prospectData).filter(([, value]) => value !== undefined)
        );

        const now = new Date();
        const newProspect = {
            ...filteredData,
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
        const auth = getAuthInstance();
        const db = getDbInstance();
        const userId = auth.currentUser?.uid || 'anonymous';
        const prospectRef = doc(db, 'prospects', id);
        const linkedTargets = await getDocs(query(
            collection(db, 'targets'),
            where('copiedFromProspectId', '==', id)
        ));
        
        // Convert undefined values to deleteField() for Firestore
        const processedUpdates: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(updates)) {
            if (value === undefined) {
                processedUpdates[key] = deleteField();
            } else {
                processedUpdates[key] = value;
            }
        }
        
        const mirroredUpdates = Object.fromEntries(
            Object.entries(updates).filter(([key, value]) =>
                TARGET_MIRRORED_FIELDS.has(key as keyof Prospect) && value !== undefined
            )
        );
        const batch = writeBatch(db);
        batch.update(prospectRef, {
            ...processedUpdates,
            updatedAt: serverTimestamp()
        });
        for (const targetDoc of linkedTargets.docs) {
            if (Object.keys(mirroredUpdates).length === 0) break;
            const targetData = targetDoc.data();
            const syncHistory = Array.isArray(targetData.crmSyncHistory) ? targetData.crmSyncHistory : [];
            batch.update(targetDoc.ref, {
                ...mirroredUpdates,
                crmSyncHistory: [...syncHistory, {
                    date: Timestamp.fromDate(new Date()),
                    actor: userId,
                    sourceProspectId: id,
                    changes: Object.entries(mirroredUpdates).map(([field, value]) => ({
                        field,
                        before: targetData[field] ?? null,
                        after: value
                    }))
                }],
                crmSyncedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
        }
        await batch.commit();
    } catch (error) {
        console.error('Error updating prospect:', error);
        throw error;
    }
};

// Delete a prospect
export const deleteProspect = async (id: string) => {
    try {
        const db = getDbInstance();
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
        const auth = getAuthInstance();
        const db = getDbInstance();
        const user = auth.currentUser;
        const userId = user?.uid || 'anonymous';

        const prospectRef = doc(db, 'prospects', id);
        const linkedTargets = await getDocs(query(
            collection(db, 'targets'),
            where('copiedFromProspectId', '==', id)
        ));

        const now = new Date();
        const newHistoryEntry = {
            stage: newStage,
            date: Timestamp.fromDate(now),
            movedBy: userId
        };

        const batch = writeBatch(db);
        batch.update(prospectRef, {
            stage: newStage,
            history: [...currentHistory.map(h => ({
                ...h,
                date: h.date instanceof Date ? Timestamp.fromDate(h.date) : h.date
            })), newHistoryEntry],
            updatedAt: serverTimestamp()
        });
        for (const targetDoc of linkedTargets.docs) {
            const targetData = targetDoc.data();
            const targetHistory = Array.isArray(targetData.history) ? targetData.history : [];
            const syncHistory = Array.isArray(targetData.crmSyncHistory) ? targetData.crmSyncHistory : [];
            batch.update(targetDoc.ref, {
                stage: newStage,
                history: [...targetHistory, newHistoryEntry],
                crmSyncHistory: [...syncHistory, {
                    date: Timestamp.fromDate(now),
                    actor: userId,
                    sourceProspectId: id,
                    changes: [{ field: 'stage', before: targetData.stage ?? null, after: newStage }]
                }],
                crmSyncedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
        }
        await batch.commit();
    } catch (error) {
        console.error('Error moving prospect:', error);
        throw error;
    }
};

// Subscribe to all prospects (real-time)
export const subscribeToProspects = (callback: (prospects: Prospect[]) => void) => {
    try {
        const db = getDbInstance();
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
                    history: data.history?.map((h: FirestoreHistoryEntry) => ({
                        ...h,
                        date: h.date?.toDate?.() || new Date()
                    })) || [],
                    subscriptionStartDate: data.subscriptionStartDate?.toDate(),
                    nextContactDate: data.nextContactDate?.toDate(),
                    scheduledDemoDate: data.scheduledDemoDate?.toDate()
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
        const db = getDbInstance();
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
                    history: data.history?.map((h: FirestoreHistoryEntry) => ({
                        ...h,
                        date: h.date?.toDate?.() || new Date()
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

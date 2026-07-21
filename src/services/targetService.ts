import { collection, addDoc, updateDoc, deleteDoc, deleteField, doc, query, where, orderBy, onSnapshot, Timestamp, serverTimestamp, getDoc, getDocs, writeBatch } from 'firebase/firestore';
import { getDbInstance, getAuthInstance } from '@/lib/firebase';
import { getRepresentativeActivityOverride } from '@/data/representativeActivityOverrides';
import type { RepresentativeActivityLevel, RepresentativeActivityVerificationStatus } from '@/lib/representativeActivity';

// Re-use the same Prospect interface
export interface Target {
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
  brandCount?: number;
  representativeActivityVerified?: boolean;
  representativeActivityLevel?: RepresentativeActivityLevel;
  representativeActivityVerificationStatus?: RepresentativeActivityVerificationStatus;
  representativeActivityCount?: number;
  activityClassificationBasis?: 'verified_unique_expedients' | 'verified_marcia_exact_agent_records' | 'historical_brand_count';
  impiProfileCount?: number;
  impiProfilesProcessed?: number;
  impiRawExpedientCount?: number;
  impiUniqueExpedientCount?: number;
  impiVerificationSource?: string;
  impiSourceIndexedAt?: string;
  impiExactAgentQuery?: string;
  representativeActivityVerifiedAt?: Date;
  impiCooldownUntil?: Date;
  subscriptionStartDate?: Date;
  accountValue?: number;
  potentialValue?: number;
  nextContactDate?: Date;
  scheduledDemoDate?: Date;
  linkedinUrl?: string;
    companyLogo?: string;
    photoUrl?: string;
    logoUrl?: string;
    city?: string;
    state?: string;
  // Field to track origin
  clientStatus?: string;
  copiedFromProspectId?: string;
  despachoId?: string;
}

const COLLECTION_NAME = 'targets';

// Create a new target
export const createTarget = async (targetData: Omit<Target, 'id' | 'createdAt' | 'stage' | 'history' | 'createdBy' | 'updatedAt'>) => {
  try {
    const auth = getAuthInstance();
    const db = getDbInstance();
    const user = auth.currentUser;
    const userId = user?.uid || 'anonymous';

    const filteredData = Object.fromEntries(
      Object.entries(targetData).filter(([, value]) => value !== undefined)
    );

    const now = new Date();
    const newTarget = {
      ...filteredData,
      stage: 'Detecci\u00f3n de prospecto',
      createdAt: Timestamp.fromDate(now),
      updatedAt: serverTimestamp(),
      createdBy: userId,
      history: [{
        stage: 'Detecci\u00f3n de prospecto',
        date: Timestamp.fromDate(now),
        movedBy: userId
      }]
    };

    const docRef = await addDoc(collection(db, COLLECTION_NAME), newTarget);
    return docRef.id;
  } catch (error) {
    console.error('Error creating target:', error);
    throw error;
  }
};

// Update a target
export const updateTarget = async (id: string, updates: Partial<Target>) => {
  try {
    const db = getDbInstance();
    const targetRef = doc(db, COLLECTION_NAME, id);

    const processedUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) {
        processedUpdates[key] = deleteField();
      } else {
        processedUpdates[key] = value;
      }
    }

    await updateDoc(targetRef, {
      ...processedUpdates,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error updating target:', error);
    throw error;
  }
};

// Delete a target
export const deleteTarget = async (id: string) => {
  try {
    const db = getDbInstance();
    const targetRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(targetRef);
  } catch (error) {
    console.error('Error deleting target:', error);
    throw error;
  }
};

// Move target to a new stage
export const moveTargetToStage = async (id: string, newStage: string, currentHistory: Array<{ stage: string; date: Date; movedBy?: string }>) => {
  try {
    const auth = getAuthInstance();
    const db = getDbInstance();
    const user = auth.currentUser;
    const userId = user?.uid || 'anonymous';

    const targetRef = doc(db, COLLECTION_NAME, id);
    const targetSnapshot = await getDoc(targetRef);
    const newHistoryEntry = {
      stage: newStage,
      date: Timestamp.fromDate(new Date()),
      movedBy: userId
    };

    const batch = writeBatch(db);
    batch.update(targetRef, {
      stage: newStage,
      history: [...currentHistory.map(h => ({
        ...h,
        date: h.date instanceof Date ? Timestamp.fromDate(h.date) : h.date
      })), newHistoryEntry],
      updatedAt: serverTimestamp()
    });
    const targetData = targetSnapshot.data();
    if (newStage === 'Venta' && targetData?.despachoId) {
      batch.update(doc(db, 'despachos', targetData.despachoId), {
        accountStage: 'Venta',
        clientStatus: 'Cliente activo',
        closedAt: serverTimestamp(),
        primaryContactName: targetData.name || '',
        primaryContactTargetId: id,
        primaryContactProspectId: targetData.copiedFromProspectId || '',
        updatedAt: serverTimestamp()
      });
    }
    await batch.commit();
  } catch (error) {
    console.error('Error moving target:', error);
    throw error;
  }
};

// Subscribe to all targets (real-time)
export const subscribeToTargets = (callback: (targets: Target[]) => void) => {
  try {
    const db = getDbInstance();
    const q = query(
      collection(db, COLLECTION_NAME),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const targets: Target[] = snapshot.docs.map(doc => {
        const data = doc.data();
        const override = getRepresentativeActivityOverride(data.name);
        return {
          id: doc.id,
          ...data,
          representativeActivityVerified: override?.representativeActivityVerified ?? data.representativeActivityVerified,
          representativeActivityLevel: override?.representativeActivityLevel ?? data.representativeActivityLevel,
          representativeActivityVerificationStatus: override?.representativeActivityVerificationStatus ?? data.representativeActivityVerificationStatus,
          representativeActivityCount: override?.representativeActivityCount ?? data.representativeActivityCount,
          activityClassificationBasis: override?.activityClassificationBasis ?? data.activityClassificationBasis,
          impiProfileCount: override?.impiProfileCount ?? data.impiProfileCount,
          impiProfilesProcessed: override?.impiProfilesProcessed ?? data.impiProfilesProcessed,
          impiRawExpedientCount: override?.impiRawExpedientCount ?? data.impiRawExpedientCount,
          impiUniqueExpedientCount: override?.impiUniqueExpedientCount ?? data.impiUniqueExpedientCount,
          impiVerificationSource: override?.impiVerificationSource ?? data.impiVerificationSource,
          impiSourceIndexedAt: override?.impiSourceIndexedAt ?? data.impiSourceIndexedAt,
          impiExactAgentQuery: override?.impiExactAgentQuery ?? data.impiExactAgentQuery,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate(),
          history: data.history?.map((h: Record<string, unknown> & { date?: Timestamp }) => ({
            ...h,
            date: h.date?.toDate() || new Date()
          })) || [],
          subscriptionStartDate: data.subscriptionStartDate?.toDate(),
          nextContactDate: data.nextContactDate?.toDate(),
          scheduledDemoDate: data.scheduledDemoDate?.toDate(),
          representativeActivityVerifiedAt: override?.representativeActivityVerifiedAt || data.representativeActivityVerifiedAt?.toDate(),
          impiCooldownUntil: data.impiCooldownUntil?.toDate()
        } as Target;
      });
      callback(targets);
    }, (error) => {
      console.error('Error subscribing to targets:', error);
    });

    return unsubscribe;
  } catch (error) {
    console.error('Error setting up targets subscription:', error);
    throw error;
  }
};

// Subscribe to targets by stage
export const subscribeToTargetsByStage = (stage: string, callback: (targets: Target[]) => void) => {
  try {
    const db = getDbInstance();
    const q = query(
      collection(db, COLLECTION_NAME),
      where('stage', '==', stage),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const targets: Target[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate(),
          history: data.history?.map((h: Record<string, unknown> & { date?: Timestamp }) => ({
            ...h,
            date: h.date?.toDate() || new Date()
          })) || []
        } as Target;
      });
      callback(targets);
    }, (error) => {
      console.error('Error subscribing to targets by stage:', error);
    });

    return unsubscribe;
  } catch (error) {
    console.error('Error setting up stage subscription:', error);
    throw error;
  }
};

// Copy all prospects to targets collection (one-time operation)
export const copyProspectsToTargets = async () => {
  try {
    const db = getDbInstance();
    
    // First check if targets already exist
    const existingTargets = await getDocs(collection(db, COLLECTION_NAME));
    if (!existingTargets.empty) {
      return { success: false, message: 'Targets collection already has data. Aborting to prevent duplicates.', count: 0 };
    }

    // Read all prospects
    const prospectsSnapshot = await getDocs(query(collection(db, 'prospects'), orderBy('createdAt', 'desc')));
    
    let count = 0;
    for (const prospectDoc of prospectsSnapshot.docs) {
      const data = prospectDoc.data();
      
      // Copy the document with a reference to the original prospect ID
      await addDoc(collection(db, COLLECTION_NAME), {
        ...data,
        copiedFromProspectId: prospectDoc.id,
        copiedAt: serverTimestamp()
      });
      count++;
    }

    return { success: true, message: `Successfully copied ${count} prospects to targets.`, count };
  } catch (error) {
    console.error('Error copying prospects to targets:', error);
    throw error;
  }
};

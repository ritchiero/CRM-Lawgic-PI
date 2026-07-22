import { collection, addDoc, doc, getDocs, query, orderBy, onSnapshot, Timestamp, writeBatch } from 'firebase/firestore';
import { getDbInstance } from '@/lib/firebase';
import { getRepresentativeActivityOverride } from '@/data/representativeActivityOverrides';
import { getRepresentativeActivityCorrection } from '@/data/representativeActivityCorrections';
import {
  getRepresentativeActivityLevel,
  RepresentativeActivityLevel,
  RepresentativeActivityVerificationStatus,
} from '@/lib/representativeActivity';

const COLLECTION_NAME = 'representatives';

export interface Representative {
  id: string;
  name: string;
  brandCount: number;
  rank: number;
  representativeActivityVerified: boolean;
  representativeActivityLevel: RepresentativeActivityLevel;
  representativeActivityVerificationStatus: RepresentativeActivityVerificationStatus;
  representativeActivityCount: number;
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
  createdAt?: Date;
}

// Subscribe to all representatives (real-time)
export const subscribeToRepresentatives = (callback: (reps: Representative[]) => void) => {
  try {
    const db = getDbInstance();
    const q = query(
      collection(db, COLLECTION_NAME),
      orderBy('rank', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const reps: Representative[] = snapshot.docs.map(doc => {
        const data = doc.data();
        const override = getRepresentativeActivityCorrection(data.name) || getRepresentativeActivityOverride(data.name);
        const verified = override?.representativeActivityVerified ?? (data.representativeActivityVerified === true);
        const activityCount = verified
          ? Number(override?.impiUniqueExpedientCount ?? data.impiUniqueExpedientCount ?? 0)
          : Number(data.representativeActivityCount ?? data.brandCount ?? 0);
        return {
          id: doc.id,
          name: data.name,
          brandCount: override?.representativeActivityCount ?? data.brandCount,
          rank: data.rank,
          representativeActivityVerified: verified,
          representativeActivityLevel: override?.representativeActivityLevel || data.representativeActivityLevel || getRepresentativeActivityLevel(activityCount),
          representativeActivityVerificationStatus: override?.representativeActivityVerificationStatus || data.representativeActivityVerificationStatus || 'pending',
          representativeActivityCount: override?.representativeActivityCount ?? activityCount,
          activityClassificationBasis: override?.activityClassificationBasis || data.activityClassificationBasis || (verified ? 'verified_unique_expedients' : 'historical_brand_count'),
          impiProfileCount: override?.impiProfileCount ?? data.impiProfileCount,
          impiProfilesProcessed: override?.impiProfilesProcessed ?? data.impiProfilesProcessed,
          impiRawExpedientCount: override?.impiRawExpedientCount ?? data.impiRawExpedientCount,
          impiUniqueExpedientCount: override?.impiUniqueExpedientCount ?? data.impiUniqueExpedientCount,
          impiVerificationSource: override?.impiVerificationSource ?? data.impiVerificationSource,
          impiSourceIndexedAt: override?.impiSourceIndexedAt ?? data.impiSourceIndexedAt,
          impiExactAgentQuery: override?.impiExactAgentQuery ?? data.impiExactAgentQuery,
          representativeActivityVerifiedAt: override?.representativeActivityVerifiedAt || data.representativeActivityVerifiedAt?.toDate(),
          impiCooldownUntil: data.impiCooldownUntil?.toDate(),
          createdAt: data.createdAt?.toDate()
        } as Representative;
      });
      callback(reps);
    }, (error) => {
      console.error('Error subscribing to representatives:', error);
    });

    return unsubscribe;
  } catch (error) {
    console.error('Error setting up representatives subscription:', error);
    throw error;
  }
};

// Check if the collection already has data
export const hasRepresentatives = async (): Promise<boolean> => {
  try {
    const db = getDbInstance();
    const snapshot = await getDocs(collection(db, COLLECTION_NAME));
    return !snapshot.empty;
  } catch (error) {
    console.error('Error checking representatives:', error);
    return false;
  }
};

// Seed representatives data (batch write for efficiency)
export const seedRepresentatives = async (data: { name: string; brandCount: number; rank: number }[]): Promise<void> => {
  try {
    const db = getDbInstance();
    const now = Timestamp.fromDate(new Date());
    
    // Firestore batches can only handle 500 operations at a time
    const batchSize = 499;
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = writeBatch(db);
      const chunk = data.slice(i, i + batchSize);
      
      for (const item of chunk) {
        const newDocRef = doc(collection(db, COLLECTION_NAME));
        batch.set(newDocRef, {
          name: item.name,
          brandCount: item.brandCount,
          rank: item.rank,
          representativeActivityVerified: false,
          representativeActivityLevel: getRepresentativeActivityLevel(item.brandCount),
          representativeActivityVerificationStatus: 'pending',
          representativeActivityCount: item.brandCount,
          activityClassificationBasis: 'historical_brand_count',
          createdAt: now
        });
      }
      await batch.commit();
    }
  } catch (error) {
    console.error('Error seeding representatives:', error);
    throw error;
  }
};

// Seed representatives using individual addDoc calls (more reliable for large datasets)
export const seedRepresentativesOneByOne = async (data: { name: string; brandCount: number; rank: number }[]): Promise<number> => {
  const db = getDbInstance();
  const now = Timestamp.fromDate(new Date());
  let count = 0;
  
  for (const item of data) {
    try {
      await addDoc(collection(db, COLLECTION_NAME), {
        name: item.name,
        brandCount: item.brandCount,
        rank: item.rank,
        representativeActivityVerified: false,
        representativeActivityLevel: getRepresentativeActivityLevel(item.brandCount),
        representativeActivityVerificationStatus: 'pending',
        representativeActivityCount: item.brandCount,
        activityClassificationBasis: 'historical_brand_count',
        createdAt: now
      });
      count++;
    } catch (error) {
      console.error('Error adding representative ' + item.name + ':', error);
    }
  }
  
  return count;
};

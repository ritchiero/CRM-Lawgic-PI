import { collection, addDoc, getDocs, query, orderBy, onSnapshot, Timestamp, writeBatch } from 'firebase/firestore';
import { getDbInstance } from '@/lib/firebase';

const COLLECTION_NAME = 'representatives';

export interface Representative {
  id: string;
  name: string;
  brandCount: number;
  rank: number;
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
        return {
          id: doc.id,
          name: data.name,
          brandCount: data.brandCount,
          rank: data.rank,
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
        const docRef = collection(db, COLLECTION_NAME);
        const newDocRef = addDoc(docRef, {
          name: item.name,
          brandCount: item.brandCount,
          rank: item.rank,
          createdAt: now
        });
        // We use addDoc directly since writeBatch.set needs a doc ref
      }
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
        createdAt: now
      });
      count++;
    } catch (error) {
      console.error('Error adding representative ' + item.name + ':', error);
    }
  }
  
  return count;
};

import { collection, addDoc, updateDoc, deleteDoc, doc, query, orderBy, onSnapshot, Timestamp, serverTimestamp, getDocs } from 'firebase/firestore';
import { getDbInstance } from '@/lib/firebase';

export interface Colaborador {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  puesto: string;
  notas: string;
}

export interface Despacho {
  id: string;
  nombre: string;
  color: string;
  initials: string;
  logo: string;
  logoUrl: string;
  direccion: string;
  telefono: string;
  email: string;
  sitioWeb: string;
  notas: string;
  colaboradores: Colaborador[];
  createdAt: Date;
  updatedAt?: Date;
}

const COLLECTION_NAME = 'despachos';

// Create a new despacho
export const createDespacho = async (data: Omit<Despacho, 'id' | 'createdAt' | 'updatedAt'>) => {
  try {
    const db = getDbInstance();
    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating despacho:', error);
    throw error;
  }
};

// Update a despacho
export const updateDespacho = async (id: string, updates: Partial<Despacho>) => {
  try {
    const db = getDbInstance();
    const ref = doc(db, COLLECTION_NAME, id);
    const { id: _, createdAt, ...rest } = updates as any;
    await updateDoc(ref, {
      ...rest,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating despacho:', error);
    throw error;
  }
};

// Delete a despacho
export const deleteDespacho = async (id: string) => {
  try {
    const db = getDbInstance();
    const ref = doc(db, COLLECTION_NAME, id);
    await deleteDoc(ref);
  } catch (error) {
    console.error('Error deleting despacho:', error);
    throw error;
  }
};

// Subscribe to all despachos (real-time)
export const subscribeToDespachos = (callback: (despachos: Despacho[]) => void) => {
  try {
    const db = getDbInstance();
    const q = query(
      collection(db, COLLECTION_NAME),
      orderBy('nombre', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const despachos: Despacho[] = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          nombre: data.nombre || '',
          color: data.color || '#6366f1',
          initials: data.initials || '',
          logo: data.logo || '',
          logoUrl: data.logoUrl || '',
          direccion: data.direccion || '',
          telefono: data.telefono || '',
          email: data.email || '',
          sitioWeb: data.sitioWeb || '',
          notas: data.notas || '',
          colaboradores: data.colaboradores || [],
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate(),
        } as Despacho;
      });
      callback(despachos);
    }, (error) => {
      console.error('Error subscribing to despachos:', error);
    });

    return unsubscribe;
  } catch (error) {
    console.error('Error setting up despachos subscription:', error);
    throw error;
  }
};

// Seed default despachos (one-time)
export const seedDefaultDespachos = async () => {
  try {
    const db = getDbInstance();
    const existing = await getDocs(collection(db, COLLECTION_NAME));
    if (!existing.empty) {
      return { success: false, message: 'Ya existen despachos.', count: 0 };
    }

    const defaults = [
      { nombre: 'T\u00f3pica Media, S.A. de C.V', color: '#6366f1', initials: 'TM' },
      { nombre: 'Baker McKenzie', color: '#ef4444', initials: 'BM' },
      { nombre: 'Hogan Lovells', color: '#f59e0b', initials: 'HL' },
      { nombre: 'Olivares', color: '#22c55e', initials: 'OL' },
      { nombre: 'Uhthoff, G\u00f3mez Vega & Uhthoff', color: '#3b82f6', initials: 'UG' },
      { nombre: 'Arochi & Lindner', color: '#ec4899', initials: 'AL' },
      { nombre: 'Basham, Ringe y Correa', color: '#8b5cf6', initials: 'BR' },
      { nombre: 'Goodrich Riquelme', color: '#14b8a6', initials: 'GR' },
      { nombre: 'Becerril, Coca & Becerril', color: '#f97316', initials: 'BC' },
      { nombre: 'Dumont Bergman Bider', color: '#06b6d4', initials: 'DB' },
    ];

    let count = 0;
    for (const d of defaults) {
      await addDoc(collection(db, COLLECTION_NAME), {
        ...d,
        logo: '',
        logoUrl: '',
        direccion: '',
        telefono: '',
        email: '',
        sitioWeb: '',
        notas: '',
        colaboradores: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      count++;
    }

    return { success: true, message: `${count} despachos creados.`, count };
  } catch (error) {
    console.error('Error seeding despachos:', error);
    throw error;
  }
};

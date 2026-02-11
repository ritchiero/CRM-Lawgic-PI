// /src/app/api/scrape-impi/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { scrapeIMPIBatch } from '@/services/impiScraperService';
import { collection, getDocs, doc, updateDoc, writeBatch, Timestamp } from 'firebase/firestore';
import { getDbInstance } from '@/lib/firebase';

export async function POST(request: NextRequest) {
  try {
    const db = getDbInstance();

    // Obtener todos los representantes
    const repsSnapshot = await getDocs(collection(db, 'representatives'));
    const representatives = repsSnapshot.docs.map(d => ({
      id: d.id,
      name: d.data().name,
    }));

    console.log('Iniciando scraping de ' + representatives.length + ' representantes...');

    // Ejecutar scraper
    const results = await scrapeIMPIBatch(representatives, (current, total) => {
      console.log('Progreso: ' + current + '/' + total);
    });

    // Actualizar Firebase en lotes
    const batchSize = 499;
    for (let i = 0; i < results.length; i += batchSize) {
      const batch = writeBatch(db);
      const chunk = results.slice(i, i + batchSize);

      for (const result of chunk) {
        const docRef = doc(db, 'representatives', result.id);
        batch.update(docRef, {
          brandCount: result.brandCount,
          lastScraped: Timestamp.now(),
        });
      }

      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      message: 'Se actualizaron ' + results.length + ' representantes',
    });
  } catch (error) {
    console.error('Error en scrape-impi:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
}

// /src/app/api/scrape-impi/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { scrapeIMPIBatch } from '@/services/impiScraperService';
import { collection, getDocs, doc, writeBatch, Timestamp, query, orderBy } from 'firebase/firestore';
import { getDbInstance } from '@/lib/firebase';

const BATCH_SIZE = 15; // Procesar 15 representantes por request (~48s con 3s delay)

export async function POST(request: NextRequest) {
    try {
          const db = getDbInstance();
          const body = await request.json().catch(() => ({}));
          const offset = body.offset || 0;

      // Obtener todos los representantes ordenados por nombre
      const repsSnapshot = await getDocs(
              query(collection(db, 'representatives'), orderBy('name', 'asc'))
            );
          const allReps = repsSnapshot.docs.map(d => ({
                  id: d.id,
                  name: d.data().name,
          }));

      const total = allReps.length;
          const slice = allReps.slice(offset, offset + BATCH_SIZE);

      if (slice.length === 0) {
              return NextResponse.json({
                        success: true,
                        processed: 0,
                        total,
                        done: true,
                        message: 'No hay mas representantes por procesar',
              });
      }

      console.log('Procesando lote: ' + offset + '-' + (offset + slice.length) + ' de ' + total);

      // Ejecutar scraper solo para este lote
      const results = await scrapeIMPIBatch(slice);

      // Actualizar Firebase
      const fbBatch = writeBatch(db);
          for (const result of results) {
                  const docRef = doc(db, 'representatives', result.id);
                  fbBatch.update(docRef, {
                            brandCount: result.brandCount,
                            lastScraped: Timestamp.now(),
                  });
          }
          await fbBatch.commit();

      const nextOffset = offset + slice.length;
          const done = nextOffset >= total;

      return NextResponse.json({
              success: true,
              processed: slice.length,
              total,
              offset,
              nextOffset: done ? null : nextOffset,
              done,
              message: 'Lote procesado: ' + slice.length + ' representantes (' + nextOffset + '/' + total + ')',
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

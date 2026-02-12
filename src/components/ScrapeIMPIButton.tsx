// /src/components/ScrapeIMPIButton.tsx

'use client';

import { useState } from 'react';
import { collection, getDocs, doc, writeBatch, Timestamp, query, orderBy } from 'firebase/firestore';
import { getDbInstance } from '@/lib/firebase';

const BATCH_SIZE = 15;

export default function ScrapeIMPIButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const handleScrape = async () => {
    if (!confirm('Deseas actualizar los datos de marcas del IMPI? Esto puede tardar varios minutos.')) {
      return;
    }

    setLoading(true);
    setMessage('Leyendo representantes...');
    setProgress({ current: 0, total: 0 });

    try {
      const db = getDbInstance();
      const repsSnapshot = await getDocs(
        query(collection(db, 'representatives'), orderBy('name', 'asc'))
      );
      const allReps = repsSnapshot.docs.map(d => ({
        id: d.id,
        name: d.data().name,
      }));

      const total = allReps.length;
      setProgress({ current: 0, total });
      setMessage('Procesando 0 de ' + total + '...');

      let totalProcessed = 0;

      for (let offset = 0; offset < total; offset += BATCH_SIZE) {
        const slice = allReps.slice(offset, offset + BATCH_SIZE);

        const response = await fetch('/api/scrape-impi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ representatives: slice }),
        });

        const data = await response.json();

        if (!data.success) {
          setMessage('Error en lote ' + offset + ': ' + data.error);
          break;
        }

        const fbBatch = writeBatch(db);
        for (const result of data.results) {
          const docRef = doc(db, 'representatives', result.id);
          fbBatch.update(docRef, {
            brandCount: result.brandCount,
            lastScraped: Timestamp.now(),
          });
        }
        await fbBatch.commit();

        totalProcessed += slice.length;
        setProgress({ current: totalProcessed, total });
        setMessage('Procesados ' + totalProcessed + ' de ' + total + '...');
      }

      if (totalProcessed >= total) {
        setMessage('Completado: ' + totalProcessed + ' representantes actualizados');
      }
    } catch (error) {
      setMessage('Error: ' + (error instanceof Error ? error.message : 'desconocido'));
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <button
        onClick={handleScrape}
        disabled={loading}
        style={{
          padding: '0.75rem 1.5rem',
          backgroundColor: loading ? '#94a3b8' : '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: '0.5rem',
          fontWeight: '600',
          cursor: loading ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s',
          fontSize: '0.875rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          whiteSpace: 'nowrap' as const,
          height: '48px',
        }}
      >
        {loading ? 'Actualizando... ' + pct + '%' : 'Actualizar Marcas IMPI'}
      </button>
      {loading && progress.total > 0 && (
        <div style={{
          width: '100%',
          height: '4px',
          backgroundColor: '#e2e8f0',
          borderRadius: '2px',
          overflow: 'hidden',
        }}>
          <div style={{
            width: pct + '%',
            height: '100%',
            backgroundColor: '#3b82f6',
            transition: 'width 0.3s ease',
          }} />
        </div>
      )}
      {message && (
        <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>
          {message}
        </p>
      )}
    </div>
  );
}

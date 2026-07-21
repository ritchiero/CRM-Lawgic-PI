// /src/components/ScrapeIMPIButton.tsx
// MT-P4: Handles Firestore updates on client side, with BATCHING support
'use client';
import { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, Timestamp, query, orderBy } from 'firebase/firestore';
import { getDbInstance } from '@/lib/firebase';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

const BATCH_SIZE = 50;

interface ScrapeResult {
  id: string;
  name: string;
  brandCount: number;
  success: boolean;
  error?: string;
}

interface ScrapeIMPIButtonProps {
  variant?: 'default' | 'toolbar';
}

export default function ScrapeIMPIButton({ variant = 'default' }: ScrapeIMPIButtonProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [proxyStatus, setProxyStatus] = useState<string | null>(null);
  const [results, setResults] = useState<ScrapeResult[]>([]);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    checkProxy();
  }, []);

  const checkProxy = async () => {
    try {
      const response = await fetch('/api/scrape-impi');
      const data = await response.json();
      if (data.proxyHealth) {
        setProxyStatus(data.proxyHealth.status);
      }
    } catch {
      setProxyStatus('unreachable');
    }
  };

  const handleScrape = async () => {
    if (!confirm('Deseas actualizar los datos de marcas del IMPI para todos los targets? Esto puede tardar varios minutos.')) {
      return;
    }

    setLoading(true);
    setMessage('Verificando proxy MARCIA...');
    setProgress({ current: 0, total: 0 });
    setResults([]);
    setShowDetails(false);

    try {
      const db = getDbInstance();

      setMessage('Leyendo targets...');
      const targetsSnapshot = await getDocs(
        query(collection(db, 'targets'), orderBy('name', 'asc'))
      );
      const allTargets = targetsSnapshot.docs.map(d => ({
        id: d.id,
        name: d.data().name,
      }));

      if (allTargets.length === 0) {
        setMessage('No se encontraron targets para procesar.');
        setLoading(false);
        return;
      }

      const total = allTargets.length;
      setProgress({ current: 0, total });

      // Split into batches
      const batches: Array<Array<{ id: string; name: string }>> = [];
      for (let i = 0; i < allTargets.length; i += BATCH_SIZE) {
        batches.push(allTargets.slice(i, i + BATCH_SIZE));
      }

      const allResults: ScrapeResult[] = [];
      let totalProcessed = 0;
      let totalSaved = 0;
      let totalSuccessful = 0;
      let totalFailed = 0;

      for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
        const batch = batches[batchIdx];
        const batchNum = batchIdx + 1;
        setMessage('Lote ' + batchNum + '/' + batches.length + ': Enviando ' + batch.length + ' targets al proxy (' + totalProcessed + '/' + total + ' procesados)...');

        try {
          const response = await fetch('/api/scrape-impi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ representatives: batch }),
          });

          const data = await response.json();

          if (!data.success) {
            setMessage('Error en lote ' + batchNum + ': ' + data.error);
            if (data.proxyStatus) {
              setProxyStatus(data.proxyStatus.status);
            }
            totalFailed += batch.length;
            totalProcessed += batch.length;
            setProgress({ current: totalProcessed, total });
            continue;
          }

          const batchResults: ScrapeResult[] = data.results || [];
          totalSuccessful += data.summary.successful;
          totalFailed += data.summary.failed;

          // Save results to Firestore from client side
          setMessage('Lote ' + batchNum + '/' + batches.length + ': Guardando en Firestore...');
          for (const result of batchResults) {
            if (result.success && result.id) {
              try {
                const targetRef = doc(db, 'targets', result.id);
                await updateDoc(targetRef, {
                  brandCount: result.brandCount,
                  lastScraped: Timestamp.now(),
                });
                totalSaved++;
              } catch (fbErr) {
                console.error('Error saving to Firestore for ' + result.id + ':', fbErr);
              }
            }
          }

          allResults.push(...batchResults);
          totalProcessed += batch.length;
          setProgress({ current: totalProcessed, total });
          setResults([...allResults]);

        } catch (batchError) {
          console.error('Error en lote ' + batchNum + ':', batchError);
          totalFailed += batch.length;
          totalProcessed += batch.length;
          setProgress({ current: totalProcessed, total });
          setMessage('Error en lote ' + batchNum + ': ' + (batchError instanceof Error ? batchError.message : 'desconocido') + '. Continuando...');
        }
      }

      setMessage(
        'Completado: ' + totalSuccessful + ' exitosos, ' + totalFailed + ' con error de ' + total + ' targets. ' + totalSaved + ' guardados en Firestore. (' + batches.length + ' lotes)'
      );
      setResults(allResults);
      checkProxy();

    } catch (error) {
      setMessage('Error: ' + (error instanceof Error ? error.message : 'desconocido'));
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const proxyBadgeBg = proxyStatus === 'ok' ? '#dcfce7' : '#fef2f2';
  const proxyBadgeColor = proxyStatus === 'ok' ? '#166534' : '#991b1b';
  const proxyLabel = proxyStatus === 'ok' ? 'Proxy: Conectado' : 'Proxy: Desconectado';
  const toolbar = variant === 'toolbar';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: toolbar ? '0.35rem' : '0.5rem', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: toolbar ? '0.6rem' : '0.75rem', flexWrap: toolbar ? 'wrap' : 'nowrap' }}>
        <button
          onClick={handleScrape}
          disabled={loading}
          style={{
            padding: toolbar ? '0.62rem 1rem' : '0.75rem 1.5rem',
            background: loading ? '#94a3b8' : toolbar ? 'linear-gradient(135deg, #2563eb, #3155d9)' : '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: toolbar ? '0.65rem' : '0.5rem',
            fontWeight: '600',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            whiteSpace: 'nowrap' as const,
            height: toolbar ? '42px' : '48px',
            boxShadow: toolbar && !loading ? '0 8px 18px rgba(37, 99, 235, 0.18)' : 'none',
          }}
        >
          <ArrowPathIcon style={{ width: '1rem', height: '1rem' }} aria-hidden="true" />
          {loading ? 'Actualizando... ' + pct + '%' : toolbar ? 'Actualizar marcas IMPI' : 'Actualizar Marcas IMPI'}
        </button>
        {proxyStatus && (
          <span style={{
            fontSize: '0.7rem',
            padding: toolbar ? '0.22rem 0.48rem' : '0.25rem 0.5rem',
            borderRadius: '9999px',
            backgroundColor: proxyBadgeBg,
            color: proxyBadgeColor,
            fontWeight: '500',
          }}>
            {proxyLabel}
          </span>
        )}
      </div>

      {loading && progress.total > 0 && (
        <div style={{
          width: '100%',
          height: '6px',
          backgroundColor: '#e2e8f0',
          borderRadius: '3px',
          overflow: 'hidden',
        }}>
          <div style={{
            width: pct + '%',
            height: '100%',
            backgroundColor: '#3b82f6',
            transition: 'width 0.5s ease',
          }} />
        </div>
      )}

      {message && (
        <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>
          {message}
        </p>
      )}

      {results.length > 0 && !loading && (
        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
          <button
            onClick={() => setShowDetails(!showDetails)}
            style={{ cursor: 'pointer', fontWeight: '500', background: 'none', border: 'none', color: '#3b82f6', padding: 0, fontSize: '0.75rem' }}
          >
            {showDetails ? 'Ocultar detalles' : 'Ver detalles (' + results.length + ' resultados)'}
          </button>
          {showDetails && (
            <div style={{ maxHeight: '200px', overflowY: 'auto', marginTop: '0.5rem' }}>
              {results.map((r, i) => (
                <div key={r.id || i} style={{
                  padding: '0.25rem 0',
                  borderBottom: '1px solid #f1f5f9',
                  color: r.success ? '#166534' : '#991b1b',
                }}>
                  {r.name + ': ' + (r.success ? r.brandCount + ' marcas' : 'Error - ' + r.error)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

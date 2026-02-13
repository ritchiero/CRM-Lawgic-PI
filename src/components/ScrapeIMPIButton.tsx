// /src/components/ScrapeIMPIButton.tsx
// MT-P4: Handles Firestore updates on client side after receiving API results

'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, Timestamp, query, orderBy } from 'firebase/firestore';
import { getDbInstance } from '@/lib/firebase';

interface ScrapeResult {
  id: string;
  name: string;
  brandCount: number;
  success: boolean;
  error?: string;
}

export default function ScrapeIMPIButton() {
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
      setMessage('Enviando ' + total + ' targets al proxy MARCIA...');

      const response = await fetch('/api/scrape-impi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ representatives: allTargets }),
      });

      const data = await response.json();

      if (!data.success) {
        setMessage('Error: ' + data.error);
        if (data.proxyStatus) {
          setProxyStatus(data.proxyStatus.status);
        }
        return;
      }

      // Save results to Firestore from the client side
      setMessage('Guardando resultados en Firestore...');
      const apiResults: ScrapeResult[] = data.results || [];
      let savedCount = 0;

      for (const result of apiResults) {
        if (result.success && result.id) {
          try {
            const targetRef = doc(db, 'targets', result.id);
            await updateDoc(targetRef, {
              brandCount: result.brandCount,
              lastScraped: Timestamp.now(),
            });
            savedCount++;
          } catch (fbErr) {
            console.error('Error saving to Firestore for ' + result.id + ':', fbErr);
          }
        }
        setProgress({ current: savedCount, total: apiResults.filter(r => r.success).length });
      }

      const summary = data.summary;
      setMessage(
        'Completado: ' + summary.successful + ' exitosos, ' + summary.failed + ' con error de ' + summary.total + ' targets. ' + savedCount + ' guardados en Firestore.'
      );
      setResults(apiResults);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
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
        {proxyStatus && (
          <span
            style={{
              fontSize: '0.7rem',
              padding: '0.25rem 0.5rem',
              borderRadius: '9999px',
              backgroundColor: proxyBadgeBg,
              color: proxyBadgeColor,
              fontWeight: '500',
            }}
          >
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

// /src/components/ScrapeIMPIButton.tsx
// MT-P3: Enhanced with progress polling, proxy health check, and target-based scraping

'use client';

import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { getDbInstance } from '@/lib/firebase';

interface ScrapeJob {
    jobId: string;
    total: number;
    completed: number;
    failed: number;
    inProgress: boolean;
    startedAt: string;
    elapsed: number;
    results: Array<{ id: string; name: string; brandCount: number; success: boolean; error?: string }>;
}

interface ProxyHealth {
    status: string;
    sessionActive: boolean;
    queryCount: number;
}

export default function ScrapeIMPIButton() {
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [proxyStatus, setProxyStatus] = useState<string | null>(null);
    const [jobResults, setJobResults] = useState<ScrapeJob | null>(null);
    const [polling, setPolling] = useState(false);

  // Check proxy health on mount
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

  // Poll for progress while loading
  useEffect(() => {
        if (!polling) return;
        const interval = setInterval(async () => {
                try {
                          const response = await fetch('/api/scrape-impi');
                          const data = await response.json();
                          if (data.job) {
                                      setProgress({ current: data.job.completed + data.job.failed, total: data.job.total });
                                      setJobResults(data.job);
                                      if (!data.job.inProgress) {
                                                    setPolling(false);
                                      }
                          }
                } catch {
                          // ignore polling errors
                }
        }, 3000);
        return () => clearInterval(interval);
  }, [polling]);

  const handleScrape = async () => {
        if (!confirm('Deseas actualizar los datos de marcas del IMPI para todos los targets? Esto puede tardar varios minutos.')) {
                return;
        }

        setLoading(true);
        setMessage('Verificando proxy MARCIA...');
        setProgress({ current: 0, total: 0 });
        setJobResults(null);

        try {
                // Read targets from Firestore
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
                setMessage(`Enviando ${total} targets al proxy MARCIA...`);

          // Start polling for progress
          setPolling(true);

          // Send all targets to the API route (it handles them one by one with Firestore updates)
          const response = await fetch('/api/scrape-impi', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ representatives: allTargets }),
          });

          const data = await response.json();
                setPolling(false);

          if (!data.success) {
                    setMessage('Error: ' + data.error);
                    if (data.proxyStatus) {
                                setProxyStatus(data.proxyStatus.status);
                    }
                    return;
          }

          // Show final summary
          const { summary } = data;
                setProgress({ current: summary.successful + summary.failed, total: summary.total });
                setMessage(
                          `Completado: ${summary.successful} exitosos, ${summary.failed} con error de ${summary.total} targets.`
                        );
                setJobResults(data);

          // Refresh proxy status
          checkProxy();

        } catch (error) {
                setPolling(false);
                setMessage('Error: ' + (error instanceof Error ? error.message : 'desconocido'));
                console.error(error);
        } finally {
                setLoading(false);
        }
  };

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

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
                            {loading ? `Actualizando... ${pct}%` : 'Actualizar Marcas IMPI'}
                          </button>button>
                  {proxyStatus && (
                    <span
                                  style={{
                                                  fontSize: '0.7rem',
                                                  padding: '0.25rem 0.5rem',
                                                  borderRadius: '9999px',
                                                  backgroundColor: proxyStatus === 'ok' ? '#dcfce7' : '#fef2f2',
                                                  color: proxyStatus === 'ok' ? '#166534' : '#991b1b',
                                                  fontWeight: '500',
                                  }}
                                >
                                Proxy: {proxyStatus === 'ok' ? 'Conectado' : 'Desconectado'}
                    </span>span>
                        )}
                </div>div>
        
          {loading && progress.total > 0 && (
                  <div style={{
                              width: '100%',
                              height: '6px',
                              backgroundColor: '#e2e8f0',
                              borderRadius: '3px',
                              overflow: 'hidden',
                  }}>
                            <div style={{
                                width: `${pct}%`,
                                height: '100%',
                                backgroundColor: '#3b82f6',
                                transition: 'width 0.5s ease',
                  }} />
                  </div>div>
              )}
        
          {message && (
                  <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>
                    {message}
                  </p>p>
              )}
        
          {jobResults && !loading && jobResults.results && (
                  <details style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            <summary style={{ cursor: 'pointer', fontWeight: '500' }}>
                                        Ver detalles ({jobResults.results?.length || 0} resultados)
                            </summary>summary>
                            <div style={{ maxHeight: '200px', overflowY: 'auto', marginTop: '0.5rem' }}>
                              {(jobResults.results || []).map((r: { id: string; name: string; brandCount: number; success: boolean; error?: string }, i: number) => (
                                  <div key={r.id || i} style={{
                                                    padding: '0.25rem 0',
                                                    borderBottom: '1px solid #f1f5f9',
                                                    color: r.success ? '#166534' : '#991b1b',
                                  }}>
                                    {r.name}: {r.success ? `${r.brandCount} marcas` : `Error - ${r.error}`}
                                  </div>div>
                                ))}
                            </div>div>
                  </details>details>
              )}
        </div>div>
      );
}</button>

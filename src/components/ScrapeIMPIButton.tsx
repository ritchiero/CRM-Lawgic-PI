// /src/components/ScrapeIMPIButton.tsx

'use client';

import { useState } from 'react';

export default function ScrapeIMPIButton() {
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [progress, setProgress] = useState({ current: 0, total: 0 });

  const handleScrape = async () => {
        if (!confirm('Deseas actualizar los datos de marcas del IMPI? Esto puede tardar varios minutos.')) {
                return;
        }

        setLoading(true);
        setMessage('Iniciando...');
        setProgress({ current: 0, total: 0 });

        try {
                let offset = 0;
                let totalProcessed = 0;
                let done = false;

          while (!done) {
                    const response = await fetch('/api/scrape-impi', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ offset }),
                    });

                  const data = await response.json();

                  if (!data.success) {
          setMessage('Error en lote ' + offset + ': ' + data.error);
                              break;
                  }

                  totalProcessed += data.processed;
                    done = data.done;
                    offset = data.nextOffset || 0;

                  setProgress({ current: totalProcessed, total: data.total });
                    setMessage('Procesados ' + totalProcessed + ' de ' + data.total + '...');
          }

          if (done) {
                    setMessage('Completado: ' + totalProcessed + ' representantes actualizados');
          }
        } catch (error) {
                setMessage('Error de conexion');
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

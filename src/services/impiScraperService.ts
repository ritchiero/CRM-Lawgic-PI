// /src/services/impiScraperService.ts
// Uses EC2 proxy to query MARCIA (maintains authenticated browser session)

const MARCIA_PROXY_URL = process.env.MARCIA_PROXY_URL || 'http://3.15.181.124:8080';
const MARCIA_API_KEY = process.env.MARCIA_API_KEY || 'marcia-proxy-secret-key-2026';

interface ScraperResult {
    name: string;
    brandCount: number;
    success: boolean;
    error?: string;
}

/**
 * Consulta el numero de marcas de un apoderado via proxy EC2
 * El proxy mantiene sesion autenticada con MARCIA
 */
export async function scrapeIMPIForRepresentative(
    name: string
  ): Promise<ScraperResult> {
    try {
          const response = await fetch(MARCIA_PROXY_URL + '/count', {
                  method: 'POST',
                  headers: {
                            'Content-Type': 'application/json',
                            'X-API-Key': MARCIA_API_KEY,
                  },
                  body: JSON.stringify({ name }),
                  signal: AbortSignal.timeout(30000), // 30s timeout
          });

      if (!response.ok) {
              const errorText = await response.text().catch(() => '');
              throw new Error(`Proxy HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      if (data.success) {
              return {
                        name,
                        brandCount: data.count || 0,
                        success: true,
              };
      } else {
              return {
                        name,
                        brandCount: 0,
                        success: false,
                        error: data.error || 'Proxy returned unsuccessful',
              };
      }
    } catch (error) {
          console.error('Error scraping ' + name + ':', error);
          return {
                  name,
                  brandCount: 0,
                  success: false,
                  error: error instanceof Error ? error.message : 'Unknown error',
          };
    }
}

/**
 * Procesa multiples representantes usando el proxy batch endpoint
 */
export async function scrapeIMPIBatch(
    representatives: Array<{ id: string; name: string }>,
    onProgress?: (current: number, total: number) => void
  ): Promise<Array<{ id: string; brandCount: number }>> {
    const results: Array<{ id: string; brandCount: number }> = [];
    const BATCH_SIZE = 50; // Max per proxy batch call

  for (let batchStart = 0; batchStart < representatives.length; batchStart += BATCH_SIZE) {
        const batch = representatives.slice(batchStart, batchStart + BATCH_SIZE);

      try {
              const response = await fetch(MARCIA_PROXY_URL + '/batch', {
                        method: 'POST',
                        headers: {
                                    'Content-Type': 'application/json',
                                    'X-API-Key': MARCIA_API_KEY,
                        },
                        body: JSON.stringify({
                                    names: batch.map(r => ({ id: r.id, name: r.name })),
                        }),
                        signal: AbortSignal.timeout(300000), // 5 min timeout for batch
              });

          if (!response.ok) {
                    throw new Error(`Batch proxy HTTP ${response.status}`);
          }

          const data = await response.json();

          if (data.results) {
                    for (const item of data.results) {
                                results.push({
                                              id: item.id,
                                              brandCount: item.count || 0,
                                });
                    }
          }

          // Report progress
          if (onProgress) {
                    onProgress(Math.min(batchStart + BATCH_SIZE, representatives.length), representatives.length);
          }

          console.log(`Batch processed: ${batchStart + batch.length}/${representatives.length} (${data.successful || 0} successful)`);

      } catch (error) {
              console.error(`Batch error at index ${batchStart}:`, error);
              // On batch failure, fall back to individual queries
          for (const rep of batch) {
                    const result = await scrapeIMPIForRepresentative(rep.name);
                    results.push({
                                id: rep.id,
                                brandCount: result.brandCount,
                    });
                    if (onProgress) {
                                onProgress(results.length, representatives.length);
                    }
          }
      }
  }

  return results;
}

/**
 * Check if the MARCIA proxy is healthy
 */
export async function checkProxyHealth(): Promise<{
    status: string;
    sessionActive: boolean;
    queryCount: number;
}> {
    try {
          const response = await fetch(MARCIA_PROXY_URL + '/health', {
                  signal: AbortSignal.timeout(5000),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.json();
          return {
                  status: data.status || 'unknown',
                  sessionActive: data.session_active || false,
                  queryCount: data.query_count || 0,
          };
    } catch {
          return { status: 'unreachable', sessionActive: false, queryCount: 0 };
    }
}

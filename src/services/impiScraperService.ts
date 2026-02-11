// /src/services/impiScraperService.ts

const IMPI_BASE_URL = 'https://marcia.impi.gob.mx';

interface ScraperResult {
  name: string;
  brandCount: number;
  success: boolean;
  error?: string;
}

/**
 * Consulta el numero de marcas de un apoderado en IMPI
 * Usa la API interna de MARCIA para buscar por nombre de apoderado
 */
export async function scrapeIMPIForRepresentative(
  name: string
): Promise<ScraperResult> {
  try {
    const searchBody = {
      _type: 'Search$Structured',
      query: {
        number: null,
        classes: null,
        codes: null,
        title: null,
        titleOption: null,
        goodsAndServices: null,
        name: {
          name: name,
          types: ['AGENT']
        },
        date: null,
        indicators: null,
        status: null,
        markType: null,
        appType: null,
        wordSet: null
      },
      images: []
    };

    // Paso 1: Obtener el conteo de resultados
    const countResponse = await fetch(
      IMPI_BASE_URL + '/marcas/search/internal/result/count',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(searchBody),
      }
    );

    if (!countResponse.ok) {
      throw new Error('HTTP ' + countResponse.status);
    }

    const countData = await countResponse.json();
    const totalResults = typeof countData === 'number' ? countData : (countData?.count || countData?.total || 0);

    return {
      name,
      brandCount: totalResults,
      success: true,
    };
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
 * Procesa multiples representantes en lotes
 */
export async function scrapeIMPIBatch(
  representatives: Array<{ id: string; name: string }>,
  onProgress?: (current: number, total: number) => void
): Promise<Array<{ id: string; brandCount: number }>> {
  const results: Array<{ id: string; brandCount: number }> = [];
  const DELAY_MS = 3000; // 3 segundos entre consultas

  for (let i = 0; i < representatives.length; i++) {
    const rep = representatives[i];

    // Consultar IMPI
    const result = await scrapeIMPIForRepresentative(rep.name);

    results.push({
      id: rep.id,
      brandCount: result.brandCount,
    });

    // Reportar progreso
    if (onProgress) {
      onProgress(i + 1, representatives.length);
    }

    // Pausa entre consultas (excepto la ultima)
    if (i < representatives.length - 1) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }

    // Log de progreso cada 50
    if ((i + 1) % 50 === 0 || i === representatives.length - 1) {
      console.log('Procesados ' + (i + 1) + '/' + representatives.length);
    }
  }

  return results;
}

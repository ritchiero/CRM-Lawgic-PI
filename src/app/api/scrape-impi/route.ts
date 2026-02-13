// /src/app/api/scrape-impi/route.ts
// MT-P4: Removed server-side Firestore writes (permission-denied on Vercel)
// Results are returned to the frontend which handles Firestore updates
import { NextRequest, NextResponse } from 'next/server';
import { scrapeIMPIForRepresentative, checkProxyHealth } from '@/services/impiScraperService';

export const maxDuration = 300; // 5 minutes for Vercel Pro

/**
 * POST /api/scrape-impi
 * Scrapes IMPI for a list of representatives via EC2 proxy
 * Returns results - frontend handles Firestore updates
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const representatives: Array<{ id: string; name: string }> = body.representatives || [];

    if (representatives.length === 0) {
      return NextResponse.json({ success: false, error: 'No representatives provided' }, { status: 400 });
    }

    // Check proxy health first
    const health = await checkProxyHealth();
    if (health.status === 'unreachable') {
      return NextResponse.json({
        success: false,
        error: 'MARCIA proxy is unreachable. Please check EC2 instance.',
        proxyStatus: health
      }, { status: 503 });
    }

    const results: Array<{ id: string; name: string; brandCount: number; success: boolean; error?: string }> = [];

    // Process each representative individually
    for (const rep of representatives) {
      try {
        const result = await scrapeIMPIForRepresentative(rep.name);
        results.push({ id: rep.id, ...result });
      } catch (repError) {
        const errorMsg = repError instanceof Error ? repError.message : 'Unknown error';
        console.error('Error scraping ' + rep.name + ':', repError);
        results.push({
          id: rep.id,
          name: rep.name,
          brandCount: 0,
          success: false,
          error: errorMsg,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: true,
      summary: {
        total: representatives.length,
        successful: successCount,
        failed: failCount,
      },
      results,
    });

  } catch (error) {
    console.error('Error en scrape-impi:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/scrape-impi
 * Returns proxy health status
 */
export async function GET() {
  try {
    const health = await checkProxyHealth();
    return NextResponse.json({
      success: true,
      proxyHealth: health,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}

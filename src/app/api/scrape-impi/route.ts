// /src/app/api/scrape-impi/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { scrapeIMPIBatch } from '@/services/impiScraperService';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
      try {
              const body = await request.json();
              const representatives: Array<{ id: string; name: string }> = body.representatives || [];

        if (representatives.length === 0) {
                  return NextResponse.json({ success: false, error: 'No representatives provided' }, { status: 400 });
        }

        const results = await scrapeIMPIBatch(representatives);

        return NextResponse.json({
                  success: true,
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

// /src/app/api/scrape-impi/route.ts
// MT-P2: Enhanced route with Firestore integration, progress tracking, and resumption
import { NextRequest, NextResponse } from 'next/server';
import { scrapeIMPIForRepresentative, scrapeIMPIBatch, checkProxyHealth } from '@/services/impiScraperService';
import { doc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { getDbInstance } from '@/lib/firebase';

export const maxDuration = 300; // 5 minutes for Vercel Pro

// In-memory progress tracking for current scrape job
let currentJob: {
        jobId: string;
        total: number;
        completed: number;
        failed: number;
        inProgress: boolean;
        results: Array<{ id: string; name: string; brandCount: number; success: boolean; error?: string }>;
        startedAt: Date;
} | null = null;

/**
 * POST /api/scrape-impi
 * Starts scraping IMPI for a list of representatives
 * Saves results to Firestore immediately per target
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

          // Initialize job tracking
          const jobId = `scrape-${Date.now()}`;
                  currentJob = {
                              jobId,
                              total: representatives.length,
                              completed: 0,
                              failed: 0,
                              inProgress: true,
                              results: [],
                              startedAt: new Date(),
                  };

          const db = getDbInstance();
                  const results: Array<{ id: string; name: string; brandCount: number; success: boolean; error?: string }> = [];

          // Process each representative individually for immediate Firestore updates
          for (const rep of representatives) {
                      try {
                                    // Mark target as in_progress in Firestore
                        const targetRef = doc(db, 'targets', rep.id);
                                    await updateDoc(targetRef, {
                                                    scrapeStatus: 'in_progress',
                                                    updatedAt: serverTimestamp(),
                                    });

                        // Call proxy to get brand count
                        const result = await scrapeIMPIForRepresentative(rep.name);

                        // Save result to Firestore immediately
                        await updateDoc(targetRef, {
                                        brandCount: result.brandCount,
                                        scrapeStatus: result.success ? 'completed' : 'error',
                                        scrapeError: result.success ? null : (result.error || 'Unknown error'),
                                        scrapeLastRun: serverTimestamp(),
                                        updatedAt: serverTimestamp(),
                        });

                        results.push({ id: rep.id, ...result });

                        if (currentJob) {
                                        if (result.success) {
                                                          currentJob.completed++;
                                        } else {
                                                          currentJob.failed++;
                                        }
                                        currentJob.results.push({ id: rep.id, ...result });
                        }

                      } catch (repError) {
                                    const errorMsg = repError instanceof Error ? repError.message : 'Unknown error';
                                    console.error(`Error scraping ${rep.name}:`, repError);

                        // Save error to Firestore
                        try {
                                        const targetRef = doc(db, 'targets', rep.id);
                                        await updateDoc(targetRef, {
                                                          scrapeStatus: 'error',
                                                          scrapeError: errorMsg,
                                                          scrapeLastRun: serverTimestamp(),
                                                          updatedAt: serverTimestamp(),
                                        });
                        } catch (fbError) {
                                        console.error(`Error updating Firestore for ${rep.id}:`, fbError);
                        }

                        results.push({
                                        id: rep.id,
                                        name: rep.name,
                                        brandCount: 0,
                                        success: false,
                                        error: errorMsg,
                        });

                        if (currentJob) {
                                        currentJob.failed++;
                                        currentJob.results.push({
                                                          id: rep.id,
                                                          name: rep.name,
                                                          brandCount: 0,
                                                          success: false,
                                                          error: errorMsg,
                                        });
                        }
                      }
          }

          // Mark job as complete
          if (currentJob) {
                      currentJob.inProgress = false;
          }

          const successCount = results.filter(r => r.success).length;
                  const failCount = results.filter(r => !r.success).length;

          return NextResponse.json({
                      success: true,
                      jobId,
                      summary: {
                                    total: representatives.length,
                                    successful: successCount,
                                    failed: failCount,
                      },
                      results,
          });

        } catch (error) {
                  console.error('Error en scrape-impi:', error);
                  if (currentJob) {
                              currentJob.inProgress = false;
                  }
                  return NextResponse.json(
                        { success: false, error: error instanceof Error ? error.message : 'Error desconocido' },
                        { status: 500 }
                            );
        }
}

/**
 * GET /api/scrape-impi
 * Returns current scrape job progress and proxy health
 */
export async function GET() {
        try {
                  const health = await checkProxyHealth();

          if (!currentJob) {
                      return NextResponse.json({
                                    success: true,
                                    job: null,
                                    message: 'No active or recent scrape job',
                                    proxyHealth: health,
                      });
          }

          return NextResponse.json({
                      success: true,
                      job: {
                                    jobId: currentJob.jobId,
                                    total: currentJob.total,
                                    completed: currentJob.completed,
                                    failed: currentJob.failed,
                                    inProgress: currentJob.inProgress,
                                    startedAt: currentJob.startedAt.toISOString(),
                                    elapsed: Math.round((Date.now() - currentJob.startedAt.getTime()) / 1000),
                                    results: currentJob.results,
                      },
                      proxyHealth: health,
          });

        } catch (error) {
                  return NextResponse.json(
                        { success: false, error: error instanceof Error ? error.message : 'Error desconocido' },
                        { status: 500 }
                            );
        }
}

"use client";

import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

export default function TargetPage() {
        const router = useRouter();

    return (
                <ProtectedRoute>
                            <div style={{
                                    minHeight: '100vh',
                                    backgroundColor: 'var(--background)',
                                    fontFamily: 'var(--font-plus-jakarta)',
                                    padding: '2rem'
                }}>
                                            <div style={{
                                        maxWidth: '1400px',
                                        margin: '0 auto'
                }}>
                                                {/* Header */}
                                                                <div style={{ marginBottom: '2rem' }}>
                                                                                        <button
                                                                                                                        onClick={() => router.back()}
                                                                                                                        style={{
                                                                                                                                                            display: 'flex',
                                                                                                                                                            alignItems: 'center',
                                                                                                                                                            gap: '0.5rem',
                                                                                                                                                            background: 'none',
                                                                                                                                                            border: 'none',
                                                                                                                                                            color: 'var(--secondary)',
                                                                                                                                                            cursor: 'pointer',
                                                                                                                                                            marginBottom: '1rem',
                                                                                                                                                            fontSize: '0.875rem'
                                                                                                                            }}
                                                                                                                    >
                                                                                                                    <ArrowLeftIcon style={{ width: '1rem', height: '1rem' }} />
                                                                                                                    Volver
                                                                                            </button>
                                                                                        <h1 style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--foreground)', margin: 0 }}>
                                                                                                                    Targets
                                                                                            </h1>
                                                                </div>
                                            </div>
                            </div>
                </ProtectedRoute>
            );
}</ProtectedRoute>

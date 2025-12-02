"use client";

import { useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { 
    ProspectCard, 
    type Prospect,
    getDaysSinceLastMovement,
    getAgingLevel,
    getAgingStyles,
    AgingCracks,
    AgingBorder
} from '../components';

// Component wrappers (using imported components directly)
function AgingBorderWrapper({ irregular, gaps, borderColor }: { irregular: boolean; gaps: number; borderColor: string }) {
    if (!irregular) return null;
    
    const width = 280;
    const height = 200;
    const radius = 8;
    const borderWidth = 2 + (gaps * 0.3); // Thicker border with more gaps
    
    // Predefined irregular border paths for consistency based on gaps
    const getBorderPath = (): string => {
        const variation = Math.min(gaps * 1.5, 8); // Max variation of 8px
        
        // Create irregular rectangle with controlled variations
        // Top edge
        const topVariations = [
            { x: width * 0.15, y: -variation * 0.3 },
            { x: width * 0.35, y: variation * 0.2 },
            { x: width * 0.55, y: -variation * 0.4 },
            { x: width * 0.75, y: variation * 0.3 },
            { x: width * 0.9, y: -variation * 0.2 }
        ];
        
        // Right edge
        const rightVariations = [
            { y: height * 0.2, x: variation * 0.3 },
            { y: height * 0.5, x: -variation * 0.2 },
            { y: height * 0.8, x: variation * 0.4 }
        ];
        
        // Bottom edge
        const bottomVariations = [
            { x: width * 0.85, y: variation * 0.3 },
            { x: width * 0.65, y: -variation * 0.2 },
            { x: width * 0.45, y: variation * 0.4 },
            { x: width * 0.25, y: -variation * 0.3 },
            { x: width * 0.1, y: variation * 0.2 }
        ];
        
        // Left edge
        const leftVariations = [
            { y: height * 0.75, x: -variation * 0.3 },
            { y: height * 0.45, x: variation * 0.2 },
            { y: height * 0.2, x: -variation * 0.4 }
        ];
        
        let path = `M ${radius} 0`;
        
        // Top edge with variations
        topVariations.forEach(v => {
            path += ` L ${v.x} ${Math.max(0, v.y)}`;
        });
        path += ` L ${width - radius} 0`;
        
        // Right edge
        path += ` L ${width} ${radius}`;
        rightVariations.forEach(v => {
            path += ` L ${Math.min(width, width + v.x)} ${v.y}`;
        });
        path += ` L ${width} ${height - radius}`;
        
        // Bottom edge
        path += ` L ${width - radius} ${height}`;
        bottomVariations.forEach(v => {
            path += ` L ${v.x} ${Math.min(height, height + v.y)}`;
        });
        path += ` L ${radius} ${height}`;
        
        // Left edge
        path += ` L 0 ${height - radius}`;
        leftVariations.forEach(v => {
            path += ` L ${Math.max(0, v.x)} ${v.y}`;
        });
        path += ` L 0 ${radius} Z`;
        
        return path;
    };
    
    // Calculate stroke-dasharray for gaps (interruptions in border)
    const dashLength = Math.max(15 - gaps * 1.5, 5);
    const gapLength = 1 + gaps * 0.5;
    const dashArray = gaps > 0 ? `${dashLength} ${gapLength}` : 'none';
    
    return (
        <svg
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 11
            }}
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
        >
            {/* Main irregular border */}
            <path
                d={getBorderPath()}
                stroke={borderColor}
                strokeWidth={borderWidth}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={dashArray}
                opacity={0.85}
            />
            
            {/* Additional border cracks extending inward from edges */}
            {gaps >= 2 && Array.from({ length: Math.min(gaps, 6) }).map((_, i) => {
                const positions = [
                    { x: width * 0.15, y: 0, angle: 90, length: 8 + gaps },
                    { x: width, y: height * 0.25, angle: 180, length: 8 + gaps },
                    { x: width * 0.8, y: height, angle: 270, length: 8 + gaps },
                    { x: 0, y: height * 0.7, angle: 0, length: 8 + gaps },
                    { x: width * 0.5, y: 0, angle: 90, length: 6 + gaps },
                    { x: width, y: height * 0.75, angle: 180, length: 6 + gaps }
                ];
                const pos = positions[i % positions.length];
                const endX = pos.x + Math.cos((pos.angle * Math.PI) / 180) * pos.length;
                const endY = pos.y + Math.sin((pos.angle * Math.PI) / 180) * pos.length;
                
                return (
                    <path
                        key={`border-crack-${i}`}
                        d={`M ${pos.x} ${pos.y} Q ${pos.x + (endX - pos.x) * 0.5} ${pos.y + (endY - pos.y) * 0.5 + (Math.random() - 0.5) * 2} ${endX} ${endY}`}
                        stroke={borderColor}
                        strokeWidth={1}
                        fill="none"
                        strokeLinecap="round"
                        opacity={0.5 + (i * 0.1)}
                    />
                );
            })}
        </svg>
    );
    return <AgingBorder irregular={irregular} gaps={gaps} borderColor={borderColor} />;
}

function AgingCracksWrapper({ count, opacity }: { count: number; opacity: number }) {
    if (count === 0) return null;
    
    // Predefined crack patterns for consistency
    const crackPatterns = [
        // Small cracks
        "M 50 30 Q 60 40 70 35 T 85 45",
        "M 200 50 Q 210 60 220 55 T 235 65",
        // Medium cracks
        "M 30 100 Q 40 110 50 105 Q 60 115 70 110 T 85 120",
        "M 150 80 Q 160 90 170 85 Q 180 95 190 90 T 205 100",
        "M 220 150 Q 230 160 240 155 Q 250 165 260 160",
        // Large cracks
        "M 20 40 Q 30 50 40 45 Q 50 55 60 50 Q 70 60 80 55 T 100 65",
        "M 180 120 Q 190 130 200 125 Q 210 135 220 130 Q 230 140 240 135",
        "M 100 160 Q 110 170 120 165 Q 130 175 140 170 Q 150 180 160 175",
        // Very large cracks
        "M 10 60 Q 20 70 30 65 Q 40 75 50 70 Q 60 80 70 75 Q 80 85 90 80 T 110 90",
        "M 160 40 Q 170 50 180 45 Q 190 55 200 50 Q 210 60 220 55 Q 230 65 240 60",
    ];
    
    // Select patterns based on count
    const selectedPatterns = crackPatterns.slice(0, Math.min(count, crackPatterns.length));
    
    return (
        <svg
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                opacity: opacity,
                zIndex: 10
            }}
            viewBox="0 0 280 200"
            preserveAspectRatio="none"
        >
            {selectedPatterns.map((path, i) => (
                <path
                    key={i}
                    d={path}
                    stroke="#5D4037"
                    strokeWidth={count <= 2 ? 0.8 : count <= 4 ? 1 : 1.2}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.5 + (i * 0.1)}
                />
            ))}
            {/* Add some random small cracks for more realism */}
            {count >= 3 && Array.from({ length: Math.floor(count / 2) }).map((_, i) => {
                const startX = 20 + (i * 40) % 240;
                const startY = 30 + (i * 30) % 150;
                return (
                    <path
                        key={`random-${i}`}
                        d={`M ${startX} ${startY} Q ${startX + 10} ${startY + 10} ${startX + 20} ${startY + 5}`}
                        stroke="#6D4C41"
                        strokeWidth={0.6}
                        fill="none"
                        strokeLinecap="round"
                        opacity={0.3}
                    />
                );
            })}
        </svg>
    );
    return <AgingCracks count={count} opacity={opacity} />;
}

// Create test prospects with simulated dates
function createTestProspects(): Prospect[] {
    const now = new Date();
    const testProspects: Prospect[] = [];
    
    // Helper to create a date X days ago
    const daysAgo = (days: number) => {
        const date = new Date(now);
        date.setDate(date.getDate() - days);
        return date;
    };
    
    const testCases = [
        { days: 0, name: 'Tarjeta Fresca', company: 'Empresa Nueva' },
        { days: 1, name: 'Tarjeta 1 Día', company: 'Empresa Reciente' },
        { days: 3, name: 'Tarjeta 3 Días', company: 'Empresa Semana' },
        { days: 5, name: 'Tarjeta 5 Días', company: 'Empresa Semana' },
        { days: 10, name: 'Tarjeta 10 Días', company: 'Empresa Antigua' },
        { days: 15, name: 'Tarjeta 15 Días', company: 'Empresa Antigua' },
        { days: 20, name: 'Tarjeta 20 Días', company: 'Empresa Muy Antigua' },
        { days: 30, name: 'Tarjeta 30 Días', company: 'Empresa Muy Antigua' },
        { days: 45, name: 'Tarjeta 45 Días', company: 'Empresa Crítica' }
    ];
    
    testCases.forEach((testCase, index) => {
        const lastMovementDate = daysAgo(testCase.days);
        const prospect: Prospect = {
            id: `test-${index}`,
            name: testCase.name,
            company: testCase.company,
            email: `test${index}@example.com`,
            phone: `555-000${index}`,
            notes: `Tarjeta de prueba con ${testCase.days} días sin movimiento`,
            stage: 'Detección de prospecto',
            createdAt: daysAgo(testCase.days + 5), // Created a bit earlier
            createdBy: 'test-user',
            history: [{
                stage: 'Detección de prospecto',
                date: lastMovementDate,
                movedBy: 'test-user'
            }]
        };
        testProspects.push(prospect);
    });
    
    return testProspects;
}

export default function TestAgingPage() {
    return (
        <ProtectedRoute>
            <TestAgingContent />
        </ProtectedRoute>
    );
}

function TestAgingContent() {
    const [testProspects] = useState<Prospect[]>(createTestProspects());
    const [userMap] = useState<Record<string, { displayName: string; avatarColor?: string }>>({ 
        'test-user': { displayName: 'Usuario Prueba', avatarColor: 'blue' }
    });
    
    return (
        <div style={{
            minHeight: '100vh',
            backgroundColor: 'var(--background)',
            fontFamily: 'var(--font-plus-jakarta)',
            padding: '2rem'
        }}>
            <div style={{
                maxWidth: '1200px',
                margin: '0 auto'
            }}>
                {/* Header */}
                <div style={{
                    marginBottom: '2rem',
                    paddingBottom: '1rem',
                    borderBottom: '2px solid var(--border)'
                }}>
                    <h1 style={{
                        fontSize: '2rem',
                        fontWeight: '700',
                        color: 'var(--foreground)',
                        marginBottom: '0.5rem'
                    }}>
                        Pruebas de Envejecimiento Visual
                    </h1>
                    <p style={{
                        fontSize: '1rem',
                        color: 'var(--secondary)',
                        margin: 0
                    }}>
                        Esta página muestra tarjetas con diferentes niveles de antigüedad simulados para ajustar los efectos visuales.
                    </p>
                    <a
                        href="/seguimiento"
                        style={{
                            display: 'inline-block',
                            marginTop: '1rem',
                            padding: '0.5rem 1rem',
                            backgroundColor: 'var(--primary)',
                            color: 'white',
                            textDecoration: 'none',
                            borderRadius: '0.5rem',
                            fontSize: '0.875rem',
                            fontWeight: '600'
                        }}
                    >
                        ← Volver al Dashboard
                    </a>
                </div>
                
                {/* Test Cards Grid */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: '1.5rem',
                    marginBottom: '2rem'
                }}>
                    {testProspects.map((prospect) => {
                        const days = getDaysSinceLastMovement(prospect);
                        const level = getAgingLevel(days);
                        const agingData = getAgingStyles(level);
                        
                        return (
                            <div key={prospect.id} style={{
                                backgroundColor: 'var(--surface)',
                                borderRadius: '0.75rem',
                                padding: '1rem',
                                border: '1px solid var(--border)'
                            }}>
                                {/* Card with aging effects */}
                                <div style={{
                                    position: 'relative',
                                    borderRadius: '0.5rem',
                                    overflow: 'hidden',
                                    border: agingData.borderIrregular ? 'none' : (agingData.container.borderWidth || '1px'),
                                    borderStyle: agingData.borderIrregular ? 'none' : 'solid',
                                    borderColor: agingData.container.borderColor || 'var(--border)',
                                    ...agingData.container
                                }}>
                                    {/* Aging border overlay (irregular and cracked) */}
                                    {agingData.borderIrregular && (
                                        <AgingBorderWrapper 
                                            irregular={agingData.borderIrregular}
                                            gaps={agingData.borderGaps}
                                            borderColor={agingData.container.borderColor || '#9B8A75'}
                                        />
                                    )}
                                    
                                    {/* Aging cracks overlay */}
                                    <AgingCracksWrapper count={agingData.cracks} opacity={agingData.cracksOpacity} />
                                    
                                    {/* Card content */}
                                    <div style={{
                                        position: 'relative',
                                        zIndex: 1
                                    }}>
                                        <ProspectCard
                                            prospect={prospect}
                                            onDragStart={() => {}}
                                            onClick={() => {}}
                                            userMap={userMap}
                                            zoomLevel={1.0}
                                        />
                                    </div>
                                </div>
                                
                                {/* Debug Info */}
                                <div style={{
                                    marginTop: '1rem',
                                    padding: '0.75rem',
                                    backgroundColor: 'var(--background)',
                                    borderRadius: '0.5rem',
                                    fontSize: '0.75rem',
                                    color: 'var(--secondary)',
                                    border: '1px solid var(--border)'
                                }}>
                                    <div style={{ marginBottom: '0.25rem' }}>
                                        <strong>Días sin movimiento:</strong> {days}
                                    </div>
                                    <div style={{ marginBottom: '0.25rem' }}>
                                        <strong>Nivel:</strong> {level}
                                    </div>
                                    <div style={{ marginBottom: '0.25rem' }}>
                                        <strong>Color fondo:</strong> {agingData.container.backgroundColor || 'transparent'}
                                    </div>
                                    <div style={{ marginBottom: '0.25rem' }}>
                                        <strong>Filtro:</strong> {agingData.container.filter}
                                    </div>
                                    <div style={{ marginBottom: '0.25rem' }}>
                                        <strong>Grietas:</strong> {agingData.cracks}
                                    </div>
                                    <div style={{ marginBottom: '0.25rem' }}>
                                        <strong>Opacidad grietas:</strong> {agingData.cracksOpacity}
                                    </div>
                                    <div style={{ marginBottom: '0.25rem' }}>
                                        <strong>Borde irregular:</strong> {agingData.borderIrregular ? 'Sí' : 'No'}
                                    </div>
                                    <div>
                                        <strong>Gaps en borde:</strong> {agingData.borderGaps}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
                
                {/* Legend */}
                <div style={{
                    backgroundColor: 'var(--surface)',
                    borderRadius: '0.75rem',
                    padding: '1.5rem',
                    border: '1px solid var(--border)'
                }}>
                    <h2 style={{
                        fontSize: '1.25rem',
                        fontWeight: '600',
                        color: 'var(--foreground)',
                        marginBottom: '1rem'
                    }}>
                        Leyenda de Niveles
                    </h2>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '1rem'
                    }}>
                        {[
                            { level: 'fresh', days: '0-1 días', desc: 'Sin envejecimiento' },
                            { level: 'slight', days: '2-3 días', desc: 'Ligero' },
                            { level: 'moderate', days: '4-5 días', desc: 'Moderado' },
                            { level: 'noticeable', days: '6-10 días', desc: 'Notable' },
                            { level: 'significant', days: '11-15 días', desc: 'Significativo' },
                            { level: 'severe', days: '16-20 días', desc: 'Severo' },
                            { level: 'critical', days: '21+ días', desc: 'Crítico' }
                        ].map((item) => {
                            const agingData = getAgingStyles(item.level);
                            return (
                                <div key={item.level} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                    padding: '0.75rem',
                                    backgroundColor: 'var(--background)',
                                    borderRadius: '0.5rem',
                                    border: '1px solid var(--border)'
                                }}>
                                    <div style={{
                                        position: 'relative',
                                        width: '3rem',
                                        height: '3rem',
                                        borderRadius: '0.5rem',
                                        border: agingData.container.borderWidth || '1px',
                                        borderStyle: 'solid',
                                        borderColor: agingData.container.borderColor || 'var(--border)',
                                        backgroundColor: agingData.container.backgroundColor || 'var(--primary)',
                                        backgroundImage: agingData.container.backgroundImage,
                                        filter: agingData.container.filter,
                                        overflow: 'hidden'
                                    }}>
                                        <AgingCracksWrapper count={agingData.cracks} opacity={agingData.cracksOpacity} />
                                    </div>
                                    <div>
                                        <div style={{
                                            fontWeight: '600',
                                            color: 'var(--foreground)',
                                            fontSize: '0.875rem'
                                        }}>
                                            {item.level}
                                        </div>
                                        <div style={{
                                            fontSize: '0.75rem',
                                            color: 'var(--secondary)'
                                        }}>
                                            {item.days} - {item.desc}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}


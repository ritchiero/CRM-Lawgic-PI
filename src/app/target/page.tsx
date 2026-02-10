"use client";

import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeToProspects, Prospect } from '@/services/prospectService';
import { ArrowLeftIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';

export default function TargetPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!user) return;

    const unsubscribe = subscribeToProspects((data) => {
      setProspects(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const filteredProspects = useMemo(() => {
    if (!searchTerm.trim()) return prospects;
    const term = searchTerm.toLowerCase().trim();
    return prospects.filter((p) =>
      p.name.toLowerCase().includes(term)
    );
  }, [prospects, searchTerm]);

  return (
    <ProtectedRoute>
      <div style={{
        minHeight: '100vh',
        backgroundColor: 'var(--background)',
        fontFamily: 'var(--font-plus-jakarta)',
        padding: '2rem'
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
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
            <h1 style={{
              fontSize: '2rem',
              fontWeight: '700',
              color: 'var(--foreground)',
              margin: 0
            }}>
              Targets
            </h1>
            <p style={{
              fontSize: '0.875rem',
              color: 'var(--secondary)',
              marginTop: '0.5rem'
            }}>
              Lista de clientes potenciales
            </p>
          </div>

          {/* Search Bar */}
          <div style={{
            marginBottom: '1rem',
            position: 'relative'
          }}>
            <MagnifyingGlassIcon style={{
              width: '1.25rem',
              height: '1.25rem',
              position: 'absolute',
              left: '1rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--secondary)',
              pointerEvents: 'none'
            }} />
            <input
              type="text"
              placeholder="Buscar cliente por nombre..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem 1rem 0.75rem 3rem',
                fontSize: '0.9375rem',
                border: '1px solid var(--border)',
                borderRadius: '0.75rem',
                backgroundColor: 'var(--surface)',
                color: 'var(--foreground)',
                outline: 'none',
                fontFamily: 'inherit',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Client List Table */}
          <div style={{
            backgroundColor: 'var(--surface)',
            borderRadius: '0.75rem',
            border: '1px solid var(--border)',
            overflow: 'hidden'
          }}>
            {/* Table Header */}
            <div style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: 'var(--surface)',
              borderBottom: '2px solid var(--border)',
              fontWeight: '600',
              fontSize: '0.75rem',
              color: 'var(--secondary)',
              textTransform: 'uppercase' as const,
              letterSpacing: '0.05em'
            }}>
              Nombre del Cliente
            </div>

            {/* Loading State */}
            {loading && (
              <div style={{
                padding: '3rem',
                textAlign: 'center',
                color: 'var(--secondary)',
                fontSize: '0.875rem'
              }}>
                Cargando clientes...
              </div>
            )}

            {/* Empty State */}
            {!loading && filteredProspects.length === 0 && (
              <div style={{
                padding: '3rem',
                textAlign: 'center',
                color: 'var(--secondary)',
                fontSize: '0.875rem'
              }}>
                {searchTerm.trim() ? 'No se encontraron clientes con ese nombre' : 'No hay clientes registrados'}
              </div>
            )}

            {/* Client Rows */}
            {!loading && filteredProspects.map((prospect) => (
              <div
                key={prospect.id}
                style={{
                  padding: '0.875rem 1.5rem',
                  borderBottom: '1px solid var(--border)',
                  fontSize: '0.9375rem',
                  color: 'var(--foreground)',
                  transition: 'background-color 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--border)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                {prospect.name}
              </div>
            ))}
          </div>

          {/* Footer count */}
          {!loading && (
            <div style={{
              marginTop: '1rem',
              fontSize: '0.75rem',
              color: 'var(--secondary)',
              textAlign: 'right'
            }}>
              {filteredProspects.length}{searchTerm.trim() ? ` de ${prospects.length}` : ''} cliente{filteredProspects.length !== 1 ? 's' : ''} en total
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

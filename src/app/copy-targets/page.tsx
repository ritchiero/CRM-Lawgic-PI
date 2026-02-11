"use client";

import { useState } from 'react';
import { copyProspectsToTargets } from '@/services/targetService';
import ProtectedRoute from '@/components/ProtectedRoute';

export default function CopyTargetsPage() {
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleCopy = async () => {
    setLoading(true);
    setStatus('Copiando prospectos a la colecci\u00f3n targets...');
    
    try {
      const result = await copyProspectsToTargets();
      if (result.success) {
        setStatus(`\u2705 ${result.message}`);
        setDone(true);
      } else {
        setStatus(`\u26a0\ufe0f ${result.message}`);
      }
    } catch (error) {
      setStatus(`\u274c Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute>
      <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto', fontFamily: 'var(--font-sans, sans-serif)' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem' }}>
          Copiar Prospectos a Targets
        </h1>
        <p style={{ color: '#666', marginBottom: '1.5rem', lineHeight: 1.6 }}>
          Esta acci\u00f3n copiar\u00e1 todos los prospectos del Kanban (colecci\u00f3n &quot;prospects&quot;) 
          a una nueva colecci\u00f3n independiente llamada &quot;targets&quot;. 
          Los datos originales del Kanban NO ser\u00e1n modificados.
        </p>
        <p style={{ color: '#999', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          Nota: Esta operaci\u00f3n solo se puede ejecutar una vez. Si la colecci\u00f3n targets 
          ya tiene datos, se abortar\u00e1 para evitar duplicados.
        </p>
        
        {!done && (
          <button
            onClick={handleCopy}
            disabled={loading}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: loading ? '#ccc' : '#6C5CE7',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '1rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: 600
            }}
          >
            {loading ? 'Copiando...' : 'Iniciar Copia'}
          </button>
        )}

        {status && (
          <div style={{
            marginTop: '1.5rem',
            padding: '1rem',
            backgroundColor: done ? '#f0fff4' : '#fff',
            border: '1px solid ' + (done ? '#c6f6d5' : '#e2e8f0'),
            borderRadius: '0.5rem',
            fontSize: '0.95rem'
          }}>
            {status}
          </div>
        )}

        {done && (
          <a
            href="/target"
            style={{
              display: 'inline-block',
              marginTop: '1rem',
              padding: '0.75rem 1.5rem',
              backgroundColor: '#6C5CE7',
              color: 'white',
              borderRadius: '0.5rem',
              textDecoration: 'none',
              fontWeight: 600
            }}
          >
            Ir a Targets
          </a>
        )}
      </div>
    </ProtectedRoute>
  );
}

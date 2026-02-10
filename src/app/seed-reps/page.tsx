"use client";

import { useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { representativesData } from '@/data/representativesData';
import { hasRepresentatives, seedRepresentativesOneByOne } from '@/services/representativeService';

export default function SeedRepsPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');

  const handleSeed = async () => {
    if (!user) {
      setMessage('Debes iniciar sesion primero.');
      return;
    }

    setStatus('checking');
    setMessage('Verificando si ya existen datos...');

    const exists = await hasRepresentatives();
    if (exists) {
      setStatus('exists');
      setMessage('La coleccion "representatives" ya tiene datos. No se agregaran duplicados.');
      return;
    }

    setStatus('seeding');
    setMessage('Iniciando carga de ' + representativesData.length + ' representantes...');

    try {
      const count = await seedRepresentativesOneByOne(representativesData);
      setProgress(100);
      setStatus('done');
      setMessage('Listo! Se cargaron ' + count + ' de ' + representativesData.length + ' representantes exitosamente.');
    } catch (error) {
      setStatus('error');
      setMessage('Error al cargar datos: ' + String(error));
    }
  };

  return (
    <ProtectedRoute>
      <div style={{
        minHeight: '100vh',
        backgroundColor: 'var(--background)',
        fontFamily: 'var(--font-plus-jakarta)',
        padding: '2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          maxWidth: '600px',
          width: '100%',
          backgroundColor: 'var(--surface)',
          borderRadius: '1rem',
          border: '1px solid var(--border)',
          padding: '2rem',
          textAlign: 'center'
        }}>
          <h1 style={{
            fontSize: '1.5rem',
            fontWeight: '700',
            color: 'var(--foreground)',
            marginBottom: '1rem'
          }}>
            Seed Representatives
          </h1>
          <p style={{
            fontSize: '0.875rem',
            color: 'var(--secondary)',
            marginBottom: '2rem'
          }}>
            Esta pagina carga los {representativesData.length} representantes en una coleccion
            separada de Firebase llamada &quot;representatives&quot;. No modifica la base de datos actual.
          </p>

          <button
            onClick={handleSeed}
            disabled={status === 'seeding' || status === 'done'}
            style={{
              padding: '0.75rem 2rem',
              fontSize: '1rem',
              fontWeight: '600',
              color: '#fff',
              backgroundColor: status === 'done' ? '#22c55e' : status === 'seeding' ? '#6b7280' : '#3b82f6',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: status === 'seeding' || status === 'done' ? 'not-allowed' : 'pointer',
              marginBottom: '1.5rem'
            }}
          >
            {status === 'idle' ? 'Cargar Representantes' :
             status === 'checking' ? 'Verificando...' :
             status === 'seeding' ? 'Cargando...' :
             status === 'done' ? 'Completado' :
             status === 'exists' ? 'Ya existen datos' :
             'Reintentar'}
          </button>

          {message && (
            <p style={{
              fontSize: '0.875rem',
              color: status === 'error' ? '#ef4444' : status === 'done' ? '#22c55e' : 'var(--secondary)',
              marginTop: '1rem'
            }}>
              {message}
            </p>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

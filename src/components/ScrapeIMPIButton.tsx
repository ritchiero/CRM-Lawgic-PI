// /src/components/ScrapeIMPIButton.tsx

'use client';

import { useState } from 'react';

export default function ScrapeIMPIButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleScrape = async () => {
    if (!confirm('Deseas actualizar los datos de marcas del IMPI? Esto puede tardar varios minutos.')) {
      return;
    }

    setLoading(true);
    setMessage('Procesando...');

    try {
      const response = await fetch('/api/scrape-impi', {
        method: 'POST',
      });

      const data = await response.json();

      if (data.success) {
        setMessage('OK ' + data.message);
      } else {
        setMessage('Error: ' + data.error);
      }
    } catch (error) {
      setMessage('Error de conexion');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <button
        onClick={handleScrape}
        disabled={loading}
        style={{
          padding: '0.75rem 1.5rem',
          backgroundColor: loading ? '#94a3b8' : '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: '0.5rem',
          fontWeight: '600',
          cursor: loading ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s',
          fontSize: '0.875rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          whiteSpace: 'nowrap' as const,
          height: '48px'
        }}
      >
        {loading ? 'Actualizando...' : 'Actualizar Marcas IMPI'}
      </button>
      {message && (
        <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>
          {message}
        </p>
      )}
    </div>
  );
}

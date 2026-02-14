'use client';

import { useState, useCallback, useRef } from 'react';
import { getFirestore, collection, doc, setDoc, getDoc, Timestamp } from 'firebase/firestore';
import { app } from '../../lib/firebase';

const db = getFirestore(app);

interface ExpedienteData {
  status: string;
  expediente_query: string;
  datos_generales?: Record<string, string>;
  titular?: Record<string, string>;
  apoderado?: Record<string, string>;
  establecimiento?: Record<string, string>;
  productos_servicios?: Array<{ clase: string; descripcion: string }>;
  tramite?: Array<Record<string, string>>;
}

interface ScrapingState {
  isRunning: boolean;
  currentExp: number;
  totalProcessed: number;
  totalFound: number;
  totalNotFound: number;
  totalErrors: number;
  startTime: Date | null;
  lastSaved: string;
}

export default function ExpedientesPage() {
  const [startExp, setStartExp] = useState(3548715);
  const [endExp, setEndExp] = useState(3548700);
  const [state, setState] = useState<ScrapingState>({
    isRunning: false, currentExp: 0, totalProcessed: 0,
    totalFound: 0, totalNotFound: 0, totalErrors: 0,
    startTime: null, lastSaved: '',
  });
  const [proxyHealth, setProxyHealth] = useState<string>('');
  const [log, setLog] = useState<string[]>([]);
  const stopRef = useRef(false);

  const addLog = (msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setLog(prev => [`[${ts}] ${msg}`, ...prev].slice(0, 200));
  };

  const checkHealth = async () => {
    try {
      const res = await fetch('/api/acervo-expedientes');
      const data = await res.json();
      setProxyHealth(JSON.stringify(data, null, 2));
      addLog(`Health: ${data.status}, queries: ${data.queryCount}`);
    } catch (e) {
      setProxyHealth('Error: ' + String(e));
      addLog('Health check failed');
    }
  };

  const saveToFirestore = async (data: ExpedienteData) => {
    const exp = data.expediente_query || data.datos_generales?.numero_expediente || '';
    if (!exp) return;

    // Save expediente
    await setDoc(doc(db, 'expedientes', exp), {
      ...data,
      scraped_at: Timestamp.now(),
    });

    // Save apoderado if exists
    if (data.apoderado?.nombre) {
      const apoId = data.apoderado.nombre.replace(/[\s]+/g, '_').toUpperCase();
      const apoRef = doc(db, 'apoderados', apoId);
      const existing = await getDoc(apoRef);
      const expedientes_list = existing.exists()
        ? [...(existing.data().expedientes || []), exp]
        : [exp];

      await setDoc(apoRef, {
        nombre: data.apoderado.nombre,
        direccion: data.apoderado.direccion,
        poblacion: data.apoderado.poblacion,
        codigo_postal: data.apoderado.codigo_postal,
        pais: data.apoderado.pais,
        telefono: data.apoderado.telefono,
        email: data.apoderado.email,
        rfc: data.apoderado.rfc,
        expedientes: expedientes_list,
        last_seen: Timestamp.now(),
      }, { merge: true });
    }
  };

  const startScraping = useCallback(async () => {
    stopRef.current = false;
    setState(prev => ({ ...prev, isRunning: true, startTime: new Date() }));
    addLog(`Iniciando scraping: ${startExp} -> ${endExp}`);

    let processed = 0, found = 0, notFound = 0, errors = 0;

    for (let exp = startExp; exp >= endExp; exp--) {
      if (stopRef.current) {
        addLog('Scraping detenido por usuario');
        break;
      }

      setState(prev => ({ ...prev, currentExp: exp }));

      try {
        const res = await fetch('/api/acervo-expedientes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expediente: String(exp) }),
        });
        const data: ExpedienteData = await res.json();

        processed++;

        if (data.status === 'found') {
          found++;
          await saveToFirestore(data);
          const denom = data.datos_generales?.denominacion || 'N/A';
          const apo = data.apoderado?.nombre || 'Sin apoderado';
          addLog(`${exp}: ${denom} | Apo: ${apo}`);
          setState(prev => ({
            ...prev, totalProcessed: processed, totalFound: found,
            lastSaved: `${exp} - ${denom}`,
          }));
        } else if (data.status === 'not_found') {
          notFound++;
          addLog(`${exp}: No encontrado`);
          setState(prev => ({ ...prev, totalProcessed: processed, totalNotFound: notFound }));
        } else {
          errors++;
          addLog(`${exp}: Error - ${data.status}`);
          setState(prev => ({ ...prev, totalProcessed: processed, totalErrors: errors }));
        }
      } catch (e) {
        errors++;
        addLog(`${exp}: Error de red - ${String(e).slice(0, 100)}`);
        setState(prev => ({ ...prev, totalProcessed: processed, totalErrors: errors }));
        // Wait before retrying on network error
        await new Promise(r => setTimeout(r, 10000));
      }
    }

    setState(prev => ({ ...prev, isRunning: false }));
    addLog(`Scraping finalizado. Procesados: ${processed}, Encontrados: ${found}, No encontrados: ${notFound}, Errores: ${errors}`);
  }, [startExp, endExp]);

  const stopScraping = () => {
    stopRef.current = true;
    addLog('Deteniendo scraping...');
  };

  const totalRange = startExp - endExp + 1;
  const progress = state.totalProcessed > 0
    ? ((state.totalProcessed / totalRange) * 100).toFixed(1)
    : '0';

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
        Descarga Masiva de Expedientes - Acervo Marcas
      </h1>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', alignItems: 'end', flexWrap: 'wrap' }}>
        <div>
          <label style={{ display: 'block', fontSize: '14px', marginBottom: '4px' }}>Desde (mayor):</label>
          <input type="number" value={startExp} onChange={e => setStartExp(Number(e.target.value))}
            style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', width: '150px' }}
            disabled={state.isRunning} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '14px', marginBottom: '4px' }}>Hasta (menor):</label>
          <input type="number" value={endExp} onChange={e => setEndExp(Number(e.target.value))}
            style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', width: '150px' }}
            disabled={state.isRunning} />
        </div>
        <div style={{ fontSize: '14px', color: '#666' }}>
          Rango: {totalRange.toLocaleString()} expedientes
        </div>
        <button onClick={checkHealth}
          style={{ padding: '8px 16px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Health Check
        </button>
        {!state.isRunning ? (
          <button onClick={startScraping}
            style={{ padding: '8px 16px', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            Iniciar Scraping
          </button>
        ) : (
          <button onClick={stopScraping}
            style={{ padding: '8px 16px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            Detener
          </button>
        )}
      </div>

      {/* Progress */}
      <div style={{ background: '#f3f4f6', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span>Progreso: {progress}% ({state.totalProcessed}/{totalRange})</span>
          <span>Actual: {state.currentExp || '-'}</span>
        </div>
        <div style={{ width: '100%', height: '8px', background: '#e5e7eb', borderRadius: '4px' }}>
          <div style={{ width: `${progress}%`, height: '100%', background: '#10b981', borderRadius: '4px', transition: 'width 0.3s' }} />
        </div>
        <div style={{ display: 'flex', gap: '24px', marginTop: '8px', fontSize: '14px' }}>
          <span style={{ color: '#10b981' }}>Encontrados: {state.totalFound}</span>
          <span style={{ color: '#f59e0b' }}>No encontrados: {state.totalNotFound}</span>
          <span style={{ color: '#ef4444' }}>Errores: {state.totalErrors}</span>
          {state.lastSaved && <span style={{ color: '#6b7280' }}>Ultimo: {state.lastSaved}</span>}
        </div>
      </div>

      {/* Health */}
      {proxyHealth && (
        <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '13px' }}>
          <strong>Proxy Health:</strong>
          <pre style={{ margin: '4px 0 0 0', whiteSpace: 'pre-wrap' }}>{proxyHealth}</pre>
        </div>
      )}

      {/* Log */}
      <div style={{ background: '#1f2937', color: '#d1d5db', padding: '16px', borderRadius: '8px', maxHeight: '400px', overflow: 'auto', fontFamily: 'monospace', fontSize: '13px' }}>
        <div style={{ marginBottom: '8px', color: '#9ca3af' }}>Log de actividad:</div>
        {log.map((entry, i) => (
          <div key={i} style={{ marginBottom: '2px' }}>{entry}</div>
        ))}
        {log.length === 0 && <div style={{ color: '#6b7280' }}>Sin actividad</div>}
      </div>
    </div>
  );
}
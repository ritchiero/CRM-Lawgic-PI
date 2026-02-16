'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { collection, doc, setDoc, getDoc, getDocs, query, orderBy, limit, Timestamp } from 'firebase/firestore';
import { getDbInstance } from '../../lib/firebase';

const db = getDbInstance();

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
  isPaused: boolean;
  retryCount: number;
}

interface JobCheckpoint {
  rangoInicio: number;
  rangoFin: number;
  ultimoProcesado: number;
  estado: string;
  totalProcesados: number;
  totalExitosos: number;
  totalNoEncontrados: number;
  totalFallidos: number;
  fechaInicio: string;
  fechaUltimaActividad: string;
}

export default function ExpedientesPage() {
  const [startExp, setStartExp] = useState(3548715);
  const [endExp, setEndExp] = useState(3548700);
  const [state, setState] = useState<ScrapingState>({
    isRunning: false, currentExp: 0, totalProcessed: 0,
    totalFound: 0, totalNotFound: 0, totalErrors: 0,
    startTime: null, lastSaved: '', isPaused: false, retryCount: 0,
  });
  const [proxyHealth, setProxyHealth] = useState<string>('');
  const [log, setLog] = useState<string[]>([]);
  const [lastCheckpoint, setLastCheckpoint] = useState<JobCheckpoint | null>(null);
  const stopRef = useRef(false);
  const BATCH_SIZE = 50;
  const MAX_RETRIES = 5;

  const addLog = (msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setLog(prev => [`[${ts}] ${msg}`, ...prev].slice(0, 300));
  };

  useEffect(() => {
    loadLastCheckpoint();
  }, []);

  const loadLastCheckpoint = async () => {
    try {
      const jobsRef = collection(db, 'scraping-jobs');
      const q = query(jobsRef, orderBy('fechaUltimaActividad', 'desc'), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const data = snap.docs[0].data() as JobCheckpoint;
        setLastCheckpoint(data);
        addLog(`Checkpoint encontrado: ultimo procesado ${data.ultimoProcesado}, estado: ${data.estado}`);
        if (data.estado === 'running' || data.estado === 'paused') {
          addLog(`Job anterior interrumpido. Puedes retomar desde expediente ${data.ultimoProcesado}`);
        }
      } else {
        addLog('Firestore conectado. Sin checkpoints previos.');
      }
    } catch (e) {
      addLog('Error cargando checkpoints: ' + String(e));
    }
  };

  const saveCheckpoint = async (jobId: string, data: Partial<JobCheckpoint>) => {
    try {
      await setDoc(doc(db, 'scraping-jobs', jobId), {
        ...data,
        fechaUltimaActividad: new Date().toISOString(),
      }, { merge: true });
    } catch (e) {
      addLog('Error guardando checkpoint: ' + String(e));
    }
  };

  const checkHealth = async () => {
    try {
      const res = await fetch('/api/acervo-expedientes');
      const data = await res.json();
      setProxyHealth(JSON.stringify(data, null, 2));
      addLog(`Health: ${data.status}, queries: ${data.queryCount}`);
      return data.status === 'ok';
    } catch (e) {
      setProxyHealth('Error: ' + String(e));
      addLog('Health check failed');
      return false;
    }
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const scrapeOne = async (expediente: number): Promise<ExpedienteData | null> => {
    const res = await fetch('/api/acervo-expedientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expedientes: [expediente.toString()] }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.results && data.results.length > 0) return data.results[0];
    return null;
  };

  const handleResume = () => {
    if (lastCheckpoint && (lastCheckpoint.estado === 'running' || lastCheckpoint.estado === 'paused')) {
      setStartExp(lastCheckpoint.ultimoProcesado);
      setEndExp(lastCheckpoint.rangoFin);
      addLog(`Configurado para retomar desde ${lastCheckpoint.ultimoProcesado} hasta ${lastCheckpoint.rangoFin}`);
    }
  };

  const startScraping = useCallback(async () => {
    stopRef.current = false;
    const jobId = `job_${startExp}_${endExp}_${Date.now()}`;
    setState(prev => ({
      ...prev, isRunning: true, totalProcessed: 0, totalFound: 0,
      totalNotFound: 0, totalErrors: 0, startTime: new Date(),
      currentExp: startExp, isPaused: false, retryCount: 0,
    }));
    addLog(`Iniciando scraping: ${startExp} -> ${endExp}`);
    await saveCheckpoint(jobId, {
      rangoInicio: startExp, rangoFin: endExp,
      ultimoProcesado: startExp, estado: 'running',
      totalProcesados: 0, totalExitosos: 0,
      totalNoEncontrados: 0, totalFallidos: 0,
      fechaInicio: new Date().toISOString(),
    });
    let processed = 0, found = 0, notFound = 0, errors = 0;
    let consecutiveErrors = 0;

    for (let exp = startExp; exp >= endExp; exp--) {
      if (stopRef.current) {
        addLog('Scraping detenido por usuario');
        await saveCheckpoint(jobId, { ultimoProcesado: exp, estado: 'paused', totalProcesados: processed, totalExitosos: found, totalNoEncontrados: notFound, totalFallidos: errors });
        break;
      }
      setState(prev => ({ ...prev, currentExp: exp }));
      try {
        const result = await scrapeOne(exp);
        processed++;
        consecutiveErrors = 0;
        if (result && result.status === 'found') {
          found++;
          const apoName = result.apoderado?.nombre || 'N/A';
          await setDoc(doc(db, 'expedientes', exp.toString()), {
            ...result, savedAt: Timestamp.now(), expediente_number: exp,
          });
          setState(prev => ({ ...prev, totalProcessed: processed, totalFound: found, lastSaved: `${exp} - ${apoName}` }));
          addLog(`${exp}: ${result.datos_generales?.denominacion || 'N/A'} | Apo: ${apoName}`);
        } else {
          notFound++;
          setState(prev => ({ ...prev, totalProcessed: processed, totalNotFound: notFound, lastSaved: `${exp} - no encontrado` }));
          addLog(`${exp}: no encontrado`);
        }
        if (processed % 10 === 0) {
          await saveCheckpoint(jobId, { ultimoProcesado: exp, totalProcesados: processed, totalExitosos: found, totalNoEncontrados: notFound, totalFallidos: errors });
          addLog(`Checkpoint guardado en expediente ${exp}`);
        }
        const delay = 1000 + Math.random() * 2000;
        await sleep(delay);
      } catch (e) {
        errors++;
        consecutiveErrors++;
        setState(prev => ({ ...prev, totalProcessed: processed, totalErrors: errors }));
        addLog(`ERROR ${exp}: ${String(e)}`);
        if (consecutiveErrors >= MAX_RETRIES) {
          addLog(`${MAX_RETRIES} errores consecutivos. Pausando 60s...`);
          await saveCheckpoint(jobId, { ultimoProcesado: exp + 1, estado: 'paused', totalProcesados: processed, totalExitosos: found, totalNoEncontrados: notFound, totalFallidos: errors });
          for (let retry = 0; retry < 3; retry++) {
            await sleep(60000);
            const healthy = await checkHealth();
            if (healthy) {
              addLog('Proxy recuperado, continuando...');
              consecutiveErrors = 0;
              break;
            }
            addLog(`Proxy aun no disponible, reintento ${retry + 1}/3...`);
          }
          if (consecutiveErrors >= MAX_RETRIES) {
            addLog('Proxy no se recupero. Deteniendo scraping.');
            await saveCheckpoint(jobId, { estado: 'error' });
            break;
          }
        } else {
          await sleep(10000);
        }
      }
    }
    if (!stopRef.current) {
      await saveCheckpoint(jobId, { estado: 'completed', totalProcesados: processed, totalExitosos: found, totalNoEncontrados: notFound, totalFallidos: errors });
    }
    setState(prev => ({ ...prev, isRunning: false }));
    addLog(`Scraping finalizado. Procesados: ${processed}, Encontrados: ${found}, No encontrados: ${notFound}, Errores: ${errors}`);
  }, [startExp, endExp]);

  const totalRange = startExp - endExp + 1;
  const progress = totalRange > 0 ? (state.totalProcessed / totalRange) * 100 : 0;
  const elapsed = state.startTime ? Math.floor((Date.now() - state.startTime.getTime()) / 1000) : 0;
  const rate = elapsed > 0 ? (state.totalProcessed / elapsed * 60).toFixed(1) : '0';

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
        Descarga Masiva de Expedientes &ndash; Acervo Marcas
      </h1>
      <div style={{ display: 'flex', gap: '15px', alignItems: 'end', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '14px', marginBottom: '4px' }}>Desde (mayor):</label>
          <input type="number" value={startExp} onChange={e => setStartExp(Number(e.target.value))}
            disabled={state.isRunning} style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', width: '130px' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '14px', marginBottom: '4px' }}>Hasta (menor):</label>
          <input type="number" value={endExp} onChange={e => setEndExp(Number(e.target.value))}
            disabled={state.isRunning} style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', width: '130px' }} />
        </div>
        <span style={{ fontSize: '14px', color: '#666' }}>Rango: {totalRange} expedientes</span>
        <button onClick={checkHealth}
          style={{ padding: '8px 16px', backgroundColor: '#4a5568', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Health Check
        </button>
        {!state.isRunning ? (
          <button onClick={startScraping}
            style={{ padding: '8px 16px', backgroundColor: '#38a169', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Iniciar Scraping
          </button>
        ) : (
          <button onClick={() => { stopRef.current = true; }}
            style={{ padding: '8px 16px', backgroundColor: '#e53e3e', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Detener
          </button>
        )}
        {lastCheckpoint && !state.isRunning && (lastCheckpoint.estado === 'running' || lastCheckpoint.estado === 'paused') && (
          <button onClick={handleResume}
            style={{ padding: '8px 16px', backgroundColor: '#d69e2e', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Retomar (desde {lastCheckpoint.ultimoProcesado})
          </button>
        )}
      </div>
      <div style={{ backgroundColor: '#f7fafc', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
          <span>Progreso: {progress.toFixed(1)}% ({state.totalProcessed}/{totalRange})</span>
          <span>Actual: {state.currentExp || '-'}</span>
        </div>
        <div style={{ height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: progress + '%', backgroundColor: '#38a169', transition: 'width 0.3s' }}></div>
        </div>
        <div style={{ display: 'flex', gap: '20px', marginTop: '8px', fontSize: '14px', flexWrap: 'wrap' }}>
          <span style={{ color: '#38a169' }}>Encontrados: {state.totalFound}</span>
          <span style={{ color: '#d69e2e' }}>No encontrados: {state.totalNotFound}</span>
          <span style={{ color: '#e53e3e' }}>Errores: {state.totalErrors}</span>
          <span style={{ color: '#718096' }}>Ultimo: {state.lastSaved || '-'}</span>
          {elapsed > 0 && <span style={{ color: '#4a5568' }}>Vel: {rate}/min | Tiempo: {Math.floor(elapsed/60)}m{elapsed%60}s</span>}
        </div>
      </div>
      {proxyHealth && (
        <div style={{ backgroundColor: '#f0fff4', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
          <strong>Proxy Health:</strong>
          <pre style={{ fontSize: '13px', marginTop: '5px', whiteSpace: 'pre-wrap' }}>{proxyHealth}</pre>
        </div>
      )}
      <div style={{ backgroundColor: '#1a202c', color: '#a0aec0', padding: '15px', borderRadius: '8px', maxHeight: '400px', overflowY: 'auto' }}>
        <div style={{ color: '#718096', marginBottom: '5px' }}>Log de actividad:</div>
        {log.length === 0 ? (
          <div style={{ color: '#4a5568' }}>Sin actividad</div>
        ) : (
          log.map((entry, i) => (
            <div key={i} style={{ fontSize: '13px', fontFamily: 'monospace', color: entry.includes('ERROR') ? '#fc8181' : entry.includes('Checkpoint') ? '#68d391' : '#a0aec0' }}>
              {entry}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeToProspects, Prospect, updateProspect, deleteProspect } from '@/services/prospectService';
import { ArrowLeftIcon, MagnifyingGlassIcon, ExclamationTriangleIcon, CheckCircleIcon, TrashIcon, ArrowsRightLeftIcon } from '@heroicons/react/24/outline';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { getDbInstance } from '@/lib/firebase';

function normalizeName(name: string): string {
      return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function similarity(s1: string, s2: string): number {
      const longer = s1.length > s2.length ? s1 : s2;
      const shorter = s1.length > s2.length ? s2 : s1;
      if (longer.length === 0) return 1.0;
      const costs: number[] = [];
      for (let i = 0; i <= longer.length; i++) {
              let lastValue = i;
              for (let j = 0; j <= shorter.length; j++) {
                        if (i === 0) { costs[j] = j; }
                        else if (j > 0) {
                                    let newValue = costs[j - 1];
                                    if (longer.charAt(i - 1) !== shorter.charAt(j - 1)) {
                                                  newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                                    }
                                    costs[j - 1] = lastValue;
                                    lastValue = newValue;
                        }
              }
              if (i > 0) costs[shorter.length] = lastValue;
      }
      return (longer.length - costs[shorter.length]) / longer.length;
}

function isNameSubset(n1: string, n2: string): boolean {
      const parts1 = n1.split(' ').filter(p => p.length > 2);
      const parts2 = n2.split(' ').filter(p => p.length > 2);
      if (parts1.length === parts2.length) return false;
      const shorter = parts1.length < parts2.length ? parts1 : parts2;
      const longer = parts1.length < parts2.length ? parts2 : parts1;
      return shorter.every(part => longer.some(lp => lp === part || similarity(part, lp) > 0.85));
}

interface DuplicateGroup {
      key: string;
      prospects: Prospect[];
      matchType: 'exact' | 'case-insensitive' | 'accent-insensitive' | 'partial-name' | 'fuzzy';
      similarity: number;
}

export default function DuplicatesPage() {
      const router = useRouter();
      const { user } = useAuth();
      const [prospects, setProspects] = useState<Prospect[]>([]);
      const [loading, setLoading] = useState(true);
      const [searchTerm, setSearchTerm] = useState('');
      const [merging, setMerging] = useState<string | null>(null);
      const [mergeResults, setMergeResults] = useState<{group: string; success: boolean; message: string}[]>([]);
      const [sensitivityLevel, setSensitivityLevel] = useState<'strict' | 'moderate' | 'aggressive'>('moderate');
      const [confirmDelete, setConfirmDelete] = useState<{groupKey: string; keepId: string; deleteIds: string[]} | null>(null);

  useEffect(() => {
          if (!user) return;
          const unsubscribe = subscribeToProspects((data) => { setProspects(data); setLoading(false); });
          return () => unsubscribe();
  }, [user]);

  const duplicateGroups = useMemo(() => {
          const groups: DuplicateGroup[] = [];
          const processed = new Set<string>();
          const thresholds = { strict: 0.95, moderate: 0.85, aggressive: 0.75 };
          const threshold = thresholds[sensitivityLevel];

                                      for (let i = 0; i < prospects.length; i++) {
                                                if (processed.has(prospects[i].id)) continue;
                                                const norm1 = normalizeName(prospects[i].name);
                                                if (!norm1) continue;
                                                const group: Prospect[] = [prospects[i]];
                                                let matchType: DuplicateGroup['matchType'] = 'exact';
                                                let maxSim = 1;

            for (let j = i + 1; j < prospects.length; j++) {
                        if (processed.has(prospects[j].id)) continue;
                        const norm2 = normalizeName(prospects[j].name);
                        if (!norm2) continue;
                        if (prospects[i].name === prospects[j].name) {
                                      group.push(prospects[j]); processed.add(prospects[j].id); matchType = 'exact'; continue;
                        }
                        if (norm1 === norm2) {
                                      group.push(prospects[j]); processed.add(prospects[j].id);
                                      matchType = matchType === 'exact' ? 'case-insensitive' : matchType; continue;
                        }
                        if (isNameSubset(norm1, norm2)) {
                                      group.push(prospects[j]); processed.add(prospects[j].id);
                                      matchType = 'partial-name'; maxSim = Math.min(maxSim, similarity(norm1, norm2)); continue;
                        }
                        const sim = similarity(norm1, norm2);
                        if (sim >= threshold && sim < 1) {
                                      group.push(prospects[j]); processed.add(prospects[j].id);
                                      matchType = 'fuzzy'; maxSim = Math.min(maxSim, sim);
                        }
            }
                                                if (group.length > 1) {
                                                            processed.add(prospects[i].id);
                                                            groups.push({ key: norm1, prospects: group, matchType, similarity: maxSim });
                                                }
                                      }
          return groups.sort((a, b) => {
                    const typeOrder = { exact: 0, 'case-insensitive': 1, 'accent-insensitive': 2, 'partial-name': 3, fuzzy: 4 };
                    return (typeOrder[a.matchType] - typeOrder[b.matchType]) || (b.prospects.length - a.prospects.length);
          });
  }, [prospects, sensitivityLevel]);

  const filteredGroups = useMemo(() => {
          if (!searchTerm.trim()) return duplicateGroups;
          const term = searchTerm.toLowerCase();
          return duplicateGroups.filter(g => g.prospects.some(p =>
                    p.name.toLowerCase().includes(term) || p.email?.toLowerCase().includes(term) || p.company?.toLowerCase().includes(term)
                                                                  ));
  }, [duplicateGroups, searchTerm]);

  const handleMerge = useCallback(async (groupKey: string, keepId: string, deleteIds: string[]) => {
          setMerging(groupKey);
          try {
                    const db = getDbInstance();
                    const keeper = prospects.find(p => p.id === keepId);
                    if (!keeper) throw new Error('Not found');
                    const toDelete = deleteIds.map(id => prospects.find(p => p.id === id)).filter(Boolean) as Prospect[];
                    const mergedData: Partial<Prospect> = {};
                    for (const dup of toDelete) {
                                if (!keeper.email && dup.email) mergedData.email = dup.email;
                                if (!keeper.phone && dup.phone) mergedData.phone = dup.phone;
                                if (!keeper.company && dup.company) mergedData.company = dup.company;
                                if (!keeper.notes && dup.notes) mergedData.notes = dup.notes;
                                if (!keeper.leadSource && dup.leadSource) mergedData.leadSource = dup.leadSource;
                                if (!keeper.linkedinUrl && dup.linkedinUrl) mergedData.linkedinUrl = dup.linkedinUrl;
                                if (keeper.potentialValue == null && dup.potentialValue != null) mergedData.potentialValue = dup.potentialValue;
                                if (keeper.accountValue == null && dup.accountValue != null) mergedData.accountValue = dup.accountValue;
                                if (keeper.brandCount == null && dup.brandCount != null) mergedData.brandCount = dup.brandCount;
                                if (keeper.notes && dup.notes && keeper.notes !== dup.notes) mergedData.notes = keeper.notes + '\n---\n' + dup.notes;
                    }
                    if (Object.keys(mergedData).length > 0) await updateProspect(keepId, mergedData);
                    for (const delId of deleteIds) {
                                const targetsQuery = query(collection(db, 'targets'), where('copiedFromProspectId', '==', delId));
                                const targetsSnapshot = await getDocs(targetsQuery);
                                for (const targetDoc of targetsSnapshot.docs) {
                                              await updateDoc(doc(db, 'targets', targetDoc.id), { copiedFromProspectId: keepId });
                                }
                    }
                    for (const delId of deleteIds) { await deleteProspect(delId); }
                    setMergeResults(prev => [...prev, { group: groupKey, success: true, message: 'OK' }]);
          } catch (error) {
                    setMergeResults(prev => [...prev, { group: groupKey, success: false, message: String(error) }]);
          } finally { setMerging(null); setConfirmDelete(null); }
  }, [prospects]);

  const getMatchBadge = (type: DuplicateGroup['matchType']) => {
          const badges: Record<string, {label:string;color:string;bg:string}> = {
                    exact: { label: 'Exacto', color: '#ef4444', bg: '#fef2f2' },
                    'case-insensitive': { label: 'May\u00fasculas', color: '#f59e0b', bg: '#fffbeb' },
                    'accent-insensitive': { label: 'Acentos', color: '#f97316', bg: '#fff7ed' },
                    'partial-name': { label: 'Nombre parcial', color: '#8b5cf6', bg: '#f5f3ff' },
                    fuzzy: { label: 'Similar', color: '#3b82f6', bg: '#eff6ff' },
          };
          return badges[type];
  };

  const getStageLabel = (stage: string) => {
          const labels: Record<string, string> = {
                    'Detecci\u00f3n de prospecto': 'Detecci\u00f3n', '1er Contacto': '1er Cont.', 'Contacto efectivo': 'Efectivo',
                    'Muestra de inter\u00e9s': 'Inter\u00e9s', 'Cita para demo': 'Cita Demo', 'Demo realizada': 'Realizada',
                    'Venta': 'Venta', 'En Pausa': 'Pausa', 'Basura': 'Basura', 'Cliente Perdido': 'Perdido',
          };
          return labels[stage] || stage;
  };

  const getMostComplete = (group: Prospect[]): string => {
          let bestId = group[0].id; let bestScore = 0;
          for (const p of group) {
                    let score = 0;
                    if (p.email) score += 2; if (p.phone) score += 2; if (p.company) score += 1;
                    if (p.notes) score += 1; if (p.linkedinUrl) score += 1;
                    if (p.potentialValue) score += 1; if (p.accountValue) score += 1; if (p.brandCount) score += 1;
                    const stageOrder = ['Detecci\u00f3n de prospecto','1er Contacto','Contacto efectivo','Muestra de inter\u00e9s','Cita para demo','Demo realizada','Venta'];
                    const stageIdx = stageOrder.indexOf(p.stage);
                    if (stageIdx >= 0) score += stageIdx;
                    score += (p.history?.length || 0) * 0.5;
                    if (score > bestScore) { bestScore = score; bestId = p.id; }
          }
          return bestId;
  };

  return (
          <ProtectedRoute>
                <div style={{ minHeight: '100vh', backgroundColor: 'var(--background)', fontFamily: 'var(--font-sans)', padding: '2rem' }}>
                        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                                  <div style={{ marginBottom: '2rem' }}>
                                              <button onClick={() => router.back()} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', color: 'var(--secondary)', cursor: 'pointer', marginBottom: '1rem', fontSize: '0.875rem' }}>
                                                            <ArrowLeftIcon style={{ width: '1rem', height: '1rem' }} /> Volver
                                              </button>button>
                                              <h1 style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--foreground)', margin: 0 }}>
                                                  {"Gesti\u00f3n de Duplicados"}
                                              </h1>h1>
                                              <p style={{ fontSize: '0.875rem', color: 'var(--secondary)', marginTop: '0.5rem' }}>
                                                  {"Detecta y fusiona prospectos duplicados de forma segura. Los targets se actualizan autom\u00e1ticamente."}
                                              </p>p>
                                  </div>div>
                        
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                                      {[
              { label: 'Total prospectos', value: prospects.length, color: 'var(--foreground)' },
              { label: 'Grupos duplicados', value: duplicateGroups.length, color: '#ef4444' },
              { label: 'Registros duplicados', value: duplicateGroups.reduce((acc, g) => acc + g.prospects.length - 1, 0), color: '#f59e0b' },
              { label: 'Fusiones realizadas', value: mergeResults.filter(r => r.success).length, color: '#22c55e' },
                          ].map((stat, i) => (
                                            <div key={i} style={{ padding: '1rem 1.25rem', backgroundColor: 'var(--surface)', borderRadius: '0.75rem', border: '1px solid var(--border)' }}>
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--secondary)', marginBottom: '0.25rem' }}>{stat.label}</div>div>
                                                            <div style={{ fontSize: '1.5rem', fontWeight: '700', color: stat.color }}>{stat.value}</div>div>
                                            </div>div>
                                          ))}
                                  </div>div>
                        
                                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1.5rem' }}>
                                              <div style={{ position: 'relative', flex: 1 }}>
                                                            <MagnifyingGlassIcon style={{ width: '1.25rem', height: '1.25rem', position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--secondary)', pointerEvents: 'none' }} />
                                                            <input type="text" placeholder="Buscar por nombre, email o empresa..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                                                                                style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 3rem', fontSize: '0.9375rem', border: '1px solid var(--border)', borderRadius: '0.75rem', backgroundColor: 'var(--surface)', color: 'var(--foreground)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                                              </div>div>
                                              <div style={{ display: 'flex', gap: '0.25rem', backgroundColor: 'var(--surface)', borderRadius: '0.75rem', border: '1px solid var(--border)', padding: '0.25rem' }}>
                                                  {(['strict', 'moderate', 'aggressive'] as const).map(level => (
                              <button key={level} onClick={() => setSensitivityLevel(level)}
                                                    style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', fontWeight: sensitivityLevel === level ? '600' : '400', color: sensitivityLevel === level ? '#fff' : 'var(--secondary)', backgroundColor: sensitivityLevel === level ? '#6366f1' : 'transparent', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                                  {level === 'strict' ? 'Estricto' : level === 'moderate' ? 'Moderado' : 'Agresivo'}
                              </button>button>
                            ))}
                                              </div>div>
                                  </div>div>
                        
                            {loading && <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--secondary)' }}>Cargando prospectos...</div>div>}
                        
                            {!loading && filteredGroups.length === 0 && (
                          <div style={{ padding: '3rem', textAlign: 'center', backgroundColor: 'var(--surface)', borderRadius: '0.75rem', border: '1px solid var(--border)' }}>
                                        <CheckCircleIcon style={{ width: '3rem', height: '3rem', color: '#22c55e', margin: '0 auto 1rem' }} />
                                        <p style={{ fontWeight: '600', color: 'var(--foreground)', fontSize: '1.1rem' }}>
                                            {searchTerm ? 'No se encontraron duplicados con ese filtro' : '\u00a1No se encontraron duplicados!'}
                                        </p>p>
                          </div>div>
                                  )}
                        
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                      {filteredGroups.map((group) => {
                            const badge = getMatchBadge(group.matchType);
                            const suggestedKeep = getMostComplete(group.prospects);
                            const lastResult = mergeResults.find(r => r.group === group.key);
                            if (lastResult?.success) return null;
                            return (
                                                <div key={group.key} style={{ backgroundColor: 'var(--surface)', borderRadius: '0.75rem', border: '1px solid var(--border)', overflow: 'hidden' }}>
                                                                  <div style={{ padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', backgroundColor: badge.bg }}>
                                                                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                                                                            <ExclamationTriangleIcon style={{ width: '1.25rem', height: '1.25rem', color: badge.color }} />
                                                                                                            <span style={{ fontWeight: '600', fontSize: '0.9rem', color: 'var(--foreground)' }}>{group.prospects.length} registros similares</span>span>
                                                                                                            <span style={{ padding: '0.15rem 0.5rem', borderRadius: '1rem', fontSize: '0.7rem', fontWeight: '600', color: badge.color, backgroundColor: badge.bg, border: '1px solid ' + badge.color + '40' }}>{badge.label}</span>span>
                                                                                          {group.matchType === 'fuzzy' && <span style={{ fontSize: '0.75rem', color: 'var(--secondary)' }}>({Math.round(group.similarity * 100)}% similar)</span>span>}
                                                                                          </div>div>
                                                                                      <button onClick={() => { const deleteIds = group.prospects.filter(p => p.id !== suggestedKeep).map(p => p.id); setConfirmDelete({ groupKey: group.key, keepId: suggestedKeep, deleteIds }); }} disabled={merging === group.key}
                                                                                                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', fontWeight: '600', color: '#fff', backgroundColor: merging === group.key ? '#9ca3af' : '#6366f1', border: 'none', borderRadius: '0.5rem', cursor: merging === group.key ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                                                                            <ArrowsRightLeftIcon style={{ width: '0.9rem', height: '0.9rem' }} />
                                                                                          {merging === group.key ? 'Fusionando...' : 'Fusionar'}
                                                                                          </button>button>
                                                                  </div>div>
                                                    {group.prospects.map((prospect) => {
                                                                        const isKeeper = prospect.id === suggestedKeep;
                                                                        return (
                                                                                                  <div key={prospect.id} style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '2fr 1.5fr 2fr 1fr 0.5fr', gap: '0.75rem', alignItems: 'center', backgroundColor: isKeeper ? '#f0fdf4' : 'transparent' }}>
                                                                                                                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                                                                              {isKeeper && <CheckCircleIcon style={{ width: '1rem', height: '1rem', color: '#22c55e', flexShrink: 0 }} />}
                                                                                                                                                    <span style={{ fontSize: '0.875rem', fontWeight: isKeeper ? '600' : '400', color: 'var(--foreground)' }}>{prospect.name}</span>span>
                                                                                                                              {isKeeper && <span style={{ fontSize: '0.65rem', fontWeight: '600', color: '#22c55e', padding: '0.1rem 0.4rem', backgroundColor: '#dcfce7', borderRadius: '0.25rem' }}>CONSERVAR</span>span>}
                                                                                                                              </div>div>
                                                                                                                          <div style={{ fontSize: '0.8rem', color: 'var(--secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prospect.company || 'Sin empresa'}</div>div>
                                                                                                                          <div style={{ fontSize: '0.8rem', color: 'var(--secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prospect.email || 'Sin email'}</div>div>
                                                                                                                          <div><span style={{ padding: '0.15rem 0.45rem', borderRadius: '0.25rem', fontSize: '0.7rem', fontWeight: '500', color: '#6366f1', backgroundColor: '#6366f110' }}>{getStageLabel(prospect.stage)}</span>span></div>div>
                                                                                                                          <div style={{ textAlign: 'right' }}>{!isKeeper && <TrashIcon style={{ width: '0.9rem', height: '0.9rem', color: '#ef4444', opacity: 0.6 }} />}</div>div>
                                                                                                      </div>div>
                                                                                                );
                                                })}
                                                    {lastResult && !lastResult.success && <div style={{ padding: '0.5rem 1.25rem', backgroundColor: '#fef2f2', fontSize: '0.8rem', color: '#ef4444' }}>{lastResult.message}</div>div>}
                                                </div>div>
                                              );
          })}
                                  </div>div>
                        </div>div>
                </div>div>
          
              {confirmDelete && (
                      <>
                                <div onClick={() => setConfirmDelete(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000 }} />
                                <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: 'var(--surface)', borderRadius: '1rem', padding: '2rem', maxWidth: '500px', width: '90%', boxShadow: '0 25px 50px rgba(0,0,0,0.25)', zIndex: 1001 }}>
                                            <ExclamationTriangleIcon style={{ width: '2.5rem', height: '2.5rem', color: '#f59e0b', margin: '0 auto 1rem', display: 'block' }} />
                                            <h3 style={{ textAlign: 'center', fontSize: '1.1rem', fontWeight: '700', color: 'var(--foreground)', marginBottom: '0.5rem' }}>
                                                {"Confirmar fusi\u00f3n de duplicados"}
                                            </h3>h3>
                                            <p style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--secondary)', marginBottom: '1.5rem' }}>
                                                {"Se conservar\u00e1 el registro principal y se eliminar\u00e1n "}{confirmDelete.deleteIds.length}{" duplicado(s). Los datos faltantes se copiar\u00e1n al registro principal y los targets se actualizar\u00e1n autom\u00e1ticamente."}
                                            </p>p>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem', padding: '0.75rem', backgroundColor: 'var(--background)', borderRadius: '0.5rem' }}>
                                                          <div style={{ fontSize: '0.8rem', color: '#22c55e', fontWeight: '600' }}>
                                                              {"Conservar: "}{prospects.find(p => p.id === confirmDelete.keepId)?.name}
                                                          </div>div>
                                                {confirmDelete.deleteIds.map(id => (
                                          <div key={id} style={{ fontSize: '0.8rem', color: '#ef4444' }}>
                                              {"Eliminar: "}{prospects.find(p => p.id === id)?.name}
                                          </div>div>
                                        ))}
                                            </div>div>
                                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                                                          <button onClick={() => setConfirmDelete(null)} style={{ padding: '0.6rem 1.5rem', fontSize: '0.875rem', border: '1px solid var(--border)', borderRadius: '0.5rem', backgroundColor: 'var(--surface)', color: 'var(--foreground)', cursor: 'pointer', fontFamily: 'inherit' }}>
                                                                          Cancelar
                                                          </button>button>
                                                          <button onClick={() => handleMerge(confirmDelete.groupKey, confirmDelete.keepId, confirmDelete.deleteIds)}
                                                                              style={{ padding: '0.6rem 1.5rem', fontSize: '0.875rem', border: 'none', borderRadius: '0.5rem', backgroundColor: '#ef4444', color: '#fff', cursor: 'pointer', fontWeight: '600', fontFamily: 'inherit' }}>
                                                              {"Confirmar fusi\u00f3n"}
                                                          </button>button>
                                            </div>div>
                                </div>div>
                      </>>
                    )}
          </ProtectedRoute>ProtectedRoute>
        );
}</></ProtectedRoute>

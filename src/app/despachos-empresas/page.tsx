"use client";
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { subscribeToDespachos, createDespacho, updateDespacho, deleteDespacho, seedDefaultDespachos, Despacho, Colaborador } from '@/services/despachoService';
import {
  ArrowLeftIcon, MagnifyingGlassIcon, PlusIcon, XMarkIcon,
  BuildingOfficeIcon, PencilIcon, TrashIcon, UserPlusIcon,
  EnvelopeIcon, PhoneIcon, GlobeAltIcon, MapPinIcon,
  UserGroupIcon, CheckIcon, ChevronDownIcon, ChevronUpIcon
} from '@heroicons/react/24/outline';

const COLOR_OPTIONS = [
  '#6366f1', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6',
  '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#06b6d4',
  '#84cc16', '#e11d48', '#7c3aed', '#0891b2', '#d97706',
];

function generateInitials(name: string): string {
  const words = name.trim().split(' ').filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.trim().substring(0, 2).toUpperCase();
}

function generateColabId(): string {
  return 'col_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
}

export default function DespachosEmpresasPage() {
  const router = useRouter();
  const [despachos, setDespachos] = useState<Despacho[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDespacho, setSelectedDespacho] = useState<Despacho | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [expandedColabs, setExpandedColabs] = useState(true);
  const [editForm, setEditForm] = useState({
    nombre: '', color: '#6366f1', initials: '', logo: '',
    direccion: '', telefono: '', email: '', sitioWeb: '', notas: '',
  });
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [newColab, setNewColab] = useState({ nombre: '', email: '', telefono: '', puesto: '', notas: '' });
  const [showNewColabForm, setShowNewColabForm] = useState(false);
  const [editingColabId, setEditingColabId] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = subscribeToDespachos((data) => {
      setDespachos(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (selectedDespacho) {
      setEditForm({
        nombre: selectedDespacho.nombre,
        color: selectedDespacho.color,
        initials: selectedDespacho.initials,
        logo: selectedDespacho.logo,
        direccion: selectedDespacho.direccion,
        telefono: selectedDespacho.telefono,
        email: selectedDespacho.email,
        sitioWeb: selectedDespacho.sitioWeb,
        notas: selectedDespacho.notas,
      });
      setColaboradores(selectedDespacho.colaboradores || []);
      setIsEditing(false);
      setShowNewColabForm(false);
      setEditingColabId(null);
    }
  }, [selectedDespacho]);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return despachos;
    const t = searchTerm.toLowerCase();
    return despachos.filter(d =>
      d.nombre.toLowerCase().includes(t) ||
      d.colaboradores?.some(c => c.nombre.toLowerCase().includes(t))
    );
  }, [despachos, searchTerm]);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const result = await seedDefaultDespachos();
      alert(result.message);
    } catch { alert('Error al cargar despachos predeterminados.'); }
    setSeeding(false);
  };

  const handleCreate = async () => {
    if (!editForm.nombre.trim()) return;
    setSaving(true);
    try {
      const initials = editForm.initials || generateInitials(editForm.nombre);
      await createDespacho({
        nombre: editForm.nombre, color: editForm.color, initials,
        logo: editForm.logo, direccion: editForm.direccion,
        telefono: editForm.telefono, email: editForm.email,
        sitioWeb: editForm.sitioWeb, notas: editForm.notas,
        colaboradores,
      });
      setIsCreating(false);
      resetForm();
    } catch { alert('Error al crear despacho.'); }
    setSaving(false);
  };

  const handleUpdate = async () => {
    if (!selectedDespacho || !editForm.nombre.trim()) return;
    setSaving(true);
    try {
      const initials = editForm.initials || generateInitials(editForm.nombre);
      await updateDespacho(selectedDespacho.id, {
        nombre: editForm.nombre, color: editForm.color, initials,
        logo: editForm.logo, direccion: editForm.direccion,
        telefono: editForm.telefono, email: editForm.email,
        sitioWeb: editForm.sitioWeb, notas: editForm.notas,
        colaboradores,
      });
      setIsEditing(false);
    } catch { alert('Error al actualizar despacho.'); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!selectedDespacho) return;
    if (!confirm('\u00bfEliminar este despacho? Esta acci\u00f3n no se puede deshacer.')) return;
    try {
      await deleteDespacho(selectedDespacho.id);
      setSelectedDespacho(null);
    } catch { alert('Error al eliminar.'); }
  };

  const resetForm = () => {
    setEditForm({ nombre: '', color: '#6366f1', initials: '', logo: '', direccion: '', telefono: '', email: '', sitioWeb: '', notas: '' });
    setColaboradores([]);
  };

  const addColaborador = () => {
    if (!newColab.nombre.trim()) return;
    const c: Colaborador = { id: generateColabId(), ...newColab };
    setColaboradores([...colaboradores, c]);
    setNewColab({ nombre: '', email: '', telefono: '', puesto: '', notas: '' });
    setShowNewColabForm(false);
  };

  const removeColaborador = (id: string) => {
    setColaboradores(colaboradores.filter(c => c.id !== id));
  };

  const updateColaborador = (id: string, updates: Partial<Colaborador>) => {
    setColaboradores(colaboradores.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const startCreating = () => {
    resetForm();
    setColaboradores([]);
    setSelectedDespacho(null);
    setIsCreating(true);
    setIsEditing(true);
  };

  const inputStyle = {
    width: '100%', padding: '0.6rem 0.75rem', fontSize: '0.875rem',
    border: '1px solid var(--border)', borderRadius: '0.5rem',
    backgroundColor: 'var(--background)', color: 'var(--foreground)',
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const,
  };

  const labelStyle = {
    fontSize: '0.75rem', fontWeight: '600' as const, color: 'var(--secondary)',
    marginBottom: '0.35rem', display: 'block' as const,
  };

  return (
    <ProtectedRoute>
      <div style={{ minHeight: '100vh', backgroundColor: 'var(--background)', fontFamily: 'var(--font-sans)', display: 'flex' }}>
        {/* LEFT PANEL - List */}
        <div style={{ width: '380px', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          {/* Header */}
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
            <button onClick={() => router.push('/seguimiento')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', color: 'var(--secondary)', cursor: 'pointer', marginBottom: '0.75rem', fontSize: '0.8rem', fontFamily: 'inherit', padding: 0 }}>
              <ArrowLeftIcon style={{ width: '0.9rem', height: '0.9rem' }} /> Volver
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--foreground)', margin: 0 }}>Despachos</h1>
                <p style={{ fontSize: '0.8rem', color: 'var(--secondary)', margin: '0.25rem 0 0' }}>Firmas y empresas</p>
              </div>
              <button onClick={startCreating} style={{ padding: '0.5rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <PlusIcon style={{ width: '1.25rem', height: '1.25rem' }} />
              </button>
            </div>
          </div>

          {/* Search */}
          <div style={{ padding: '0.75rem 1.5rem' }}>
            <div style={{ position: 'relative' }}>
              <MagnifyingGlassIcon style={{ width: '1rem', height: '1rem', position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--secondary)', pointerEvents: 'none' }} />
              <input type="text" placeholder="Buscar despacho o colaborador..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                style={{ ...inputStyle, paddingLeft: '2.25rem', fontSize: '0.8rem' }} />
            </div>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 0.75rem 0.75rem' }}>
            {loading && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--secondary)', fontSize: '0.85rem' }}>Cargando...</div>}
            {!loading && despachos.length === 0 && (
              <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
                <BuildingOfficeIcon style={{ width: '2.5rem', height: '2.5rem', color: 'var(--border)', margin: '0 auto 0.75rem' }} />
                <p style={{ fontSize: '0.85rem', color: 'var(--secondary)', marginBottom: '1rem' }}>No hay despachos registrados</p>
                <button onClick={handleSeed} disabled={seeding} style={{ padding: '0.6rem 1.25rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '0.5rem', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', opacity: seeding ? 0.6 : 1 }}>
                  {seeding ? 'Cargando...' : 'Cargar 10 despachos predeterminados'}
                </button>
              </div>
            )}
            {!loading && filtered.map((d) => (
              <div key={d.id} onClick={() => { setIsCreating(false); setSelectedDespacho(d); }}
                style={{ padding: '0.85rem 1rem', marginBottom: '0.35rem', borderRadius: '0.6rem', cursor: 'pointer', backgroundColor: selectedDespacho?.id === d.id ? d.color + '12' : 'transparent', border: selectedDespacho?.id === d.id ? '1px solid ' + d.color + '30' : '1px solid transparent', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '2.5rem', height: '2.5rem', borderRadius: '0.5rem', backgroundColor: d.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.75rem', fontWeight: '700', flexShrink: 0 }}>{d.initials}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.nombre}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--secondary)', marginTop: '0.15rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <UserGroupIcon style={{ width: '0.8rem', height: '0.8rem' }} />
                    {d.colaboradores?.length || 0} colaborador{(d.colaboradores?.length || 0) !== 1 ? 'es' : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT PANEL - Detail / Editor */}
        <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--background)' }}>
          {!selectedDespacho && !isCreating ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--secondary)' }}>
              <div style={{ textAlign: 'center' }}>
                <BuildingOfficeIcon style={{ width: '3rem', height: '3rem', color: 'var(--border)', margin: '0 auto 1rem' }} />
                <p style={{ fontSize: '1rem', fontWeight: '500' }}>Selecciona un despacho</p>
                <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>o crea uno nuevo con el bot\u00f3n +</p>
              </div>
            </div>
          ) : (
            <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
              {/* Top bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--foreground)', margin: 0 }}>
                  {isCreating ? 'Nuevo Despacho' : 'Editar Despacho'}
                </h2>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {!isCreating && !isEditing && (
                    <>
                      <button onClick={() => setIsEditing(true)} style={{ padding: '0.5rem 1rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '0.5rem', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <PencilIcon style={{ width: '0.9rem', height: '0.9rem' }} /> Editar
                      </button>
                      <button onClick={handleDelete} style={{ padding: '0.5rem 1rem', backgroundColor: 'transparent', color: '#ef4444', border: '1px solid #ef444440', borderRadius: '0.5rem', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <TrashIcon style={{ width: '0.9rem', height: '0.9rem' }} /> Eliminar
                      </button>
                    </>
                  )}
                  {(isEditing || isCreating) && (
                    <>
                      <button onClick={() => { isCreating ? setIsCreating(false) : setIsEditing(false); }} style={{ padding: '0.5rem 1rem', backgroundColor: 'transparent', color: 'var(--secondary)', border: '1px solid var(--border)', borderRadius: '0.5rem', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
                      <button onClick={isCreating ? handleCreate : handleUpdate} disabled={saving || !editForm.nombre.trim()} style={{ padding: '0.5rem 1rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '0.5rem', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.35rem', opacity: saving || !editForm.nombre.trim() ? 0.6 : 1 }}>
                        <CheckIcon style={{ width: '0.9rem', height: '0.9rem' }} /> {saving ? 'Guardando...' : 'Guardar'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Avatar + Name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '2rem', padding: '1.5rem', backgroundColor: 'var(--surface)', borderRadius: '1rem', border: '1px solid var(--border)' }}>
                <div style={{ width: '4.5rem', height: '4.5rem', borderRadius: '0.75rem', backgroundColor: editForm.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1.5rem', fontWeight: '700', flexShrink: 0 }}>
                  {editForm.initials || (editForm.nombre ? generateInitials(editForm.nombre) : '??')}
                </div>
                <div style={{ flex: 1 }}>
                  {isEditing || isCreating ? (
                    <input type="text" value={editForm.nombre} onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value, initials: generateInitials(e.target.value) })} placeholder="Nombre del despacho..." style={{ ...inputStyle, fontSize: '1.15rem', fontWeight: '700', border: 'none', backgroundColor: 'transparent', padding: '0.25rem 0' }} />
                  ) : (
                    <div style={{ fontSize: '1.15rem', fontWeight: '700', color: 'var(--foreground)' }}>{editForm.nombre}</div>
                  )}
                  <div style={{ fontSize: '0.8rem', color: 'var(--secondary)', marginTop: '0.25rem' }}>
                    {colaboradores.length} colaborador{colaboradores.length !== 1 ? 'es' : ''} registrado{colaboradores.length !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>

              {/* Color Picker (only in edit mode) */}
              {(isEditing || isCreating) && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={labelStyle}>Color del despacho</label>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {COLOR_OPTIONS.map(c => (
                      <button key={c} onClick={() => setEditForm({ ...editForm, color: c })}
                        style={{ width: '2rem', height: '2rem', borderRadius: '0.375rem', backgroundColor: c, border: editForm.color === c ? '3px solid var(--foreground)' : '2px solid transparent', cursor: 'pointer', transition: 'all 0.15s' }} />
                    ))}
                  </div>
                </div>
              )}

              {/* Details Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <FieldBlock icon={<EnvelopeIcon style={{ width: '1rem', height: '1rem' }} />} label="Email" value={editForm.email} editing={isEditing || isCreating} onChange={(v) => setEditForm({ ...editForm, email: v })} inputStyle={inputStyle} labelStyle={labelStyle} />
                <FieldBlock icon={<PhoneIcon style={{ width: '1rem', height: '1rem' }} />} label="Tel\u00e9fono" value={editForm.telefono} editing={isEditing || isCreating} onChange={(v) => setEditForm({ ...editForm, telefono: v })} inputStyle={inputStyle} labelStyle={labelStyle} />
                <FieldBlock icon={<GlobeAltIcon style={{ width: '1rem', height: '1rem' }} />} label="Sitio Web" value={editForm.sitioWeb} editing={isEditing || isCreating} onChange={(v) => setEditForm({ ...editForm, sitioWeb: v })} inputStyle={inputStyle} labelStyle={labelStyle} />
                <FieldBlock icon={<MapPinIcon style={{ width: '1rem', height: '1rem' }} />} label="Direcci\u00f3n" value={editForm.direccion} editing={isEditing || isCreating} onChange={(v) => setEditForm({ ...editForm, direccion: v })} inputStyle={inputStyle} labelStyle={labelStyle} />
              </div>

              {/* Notas */}
              {(isEditing || isCreating || editForm.notas) && (
                <div style={{ marginBottom: '2rem' }}>
                  <label style={labelStyle}>Notas</label>
                  {isEditing || isCreating ? (
                    <textarea value={editForm.notas} onChange={(e) => setEditForm({ ...editForm, notas: e.target.value })} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Notas sobre el despacho..." />
                  ) : (
                    <p style={{ fontSize: '0.875rem', color: 'var(--foreground)', backgroundColor: 'var(--surface)', padding: '0.75rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--border)', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>{editForm.notas}</p>
                  )}
                </div>
              )}

              {/* COLABORADORES Section */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <button onClick={() => setExpandedColabs(!expandedColabs)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                    <UserGroupIcon style={{ width: '1.15rem', height: '1.15rem', color: 'var(--primary)' }} />
                    <span style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--foreground)' }}>Colaboradores ({colaboradores.length})</span>
                    {expandedColabs ? <ChevronUpIcon style={{ width: '0.9rem', height: '0.9rem', color: 'var(--secondary)' }} /> : <ChevronDownIcon style={{ width: '0.9rem', height: '0.9rem', color: 'var(--secondary)' }} />}
                  </button>
                  {(isEditing || isCreating) && (
                    <button onClick={() => setShowNewColabForm(true)} style={{ padding: '0.4rem 0.75rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '0.5rem', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <UserPlusIcon style={{ width: '0.85rem', height: '0.85rem' }} /> Agregar
                    </button>
                  )}
                </div>

                {expandedColabs && (
                  <>
                    {/* New Colaborador Form */}
                    {showNewColabForm && (isEditing || isCreating) && (
                      <div style={{ padding: '1rem', backgroundColor: 'var(--surface)', borderRadius: '0.75rem', border: '1px solid var(--primary)', marginBottom: '0.75rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                          <div><label style={labelStyle}>Nombre *</label><input type="text" value={newColab.nombre} onChange={(e) => setNewColab({ ...newColab, nombre: e.target.value })} style={inputStyle} placeholder="Nombre completo" /></div>
                          <div><label style={labelStyle}>Puesto</label><input type="text" value={newColab.puesto} onChange={(e) => setNewColab({ ...newColab, puesto: e.target.value })} style={inputStyle} placeholder="Ej: Socio, Asociado" /></div>
                          <div><label style={labelStyle}>Email</label><input type="email" value={newColab.email} onChange={(e) => setNewColab({ ...newColab, email: e.target.value })} style={inputStyle} placeholder="correo@ejemplo.com" /></div>
                          <div><label style={labelStyle}>Tel\u00e9fono</label><input type="text" value={newColab.telefono} onChange={(e) => setNewColab({ ...newColab, telefono: e.target.value })} style={inputStyle} placeholder="+52 55 1234 5678" /></div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          <button onClick={() => { setShowNewColabForm(false); setNewColab({ nombre: '', email: '', telefono: '', puesto: '', notas: '' }); }} style={{ padding: '0.4rem 0.75rem', background: 'none', border: '1px solid var(--border)', borderRadius: '0.375rem', color: 'var(--secondary)', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
                          <button onClick={addColaborador} disabled={!newColab.nombre.trim()} style={{ padding: '0.4rem 0.75rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '0.375rem', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', opacity: !newColab.nombre.trim() ? 0.5 : 1 }}>A\u00f1adir</button>
                        </div>
                      </div>
                    )}

                    {/* Colaboradores list */}
                    {colaboradores.length === 0 && (
                      <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--secondary)', fontSize: '0.85rem', backgroundColor: 'var(--surface)', borderRadius: '0.75rem', border: '1px solid var(--border)' }}>
                        No hay colaboradores registrados
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {colaboradores.map((c) => (
                        <div key={c.id} style={{ padding: '1rem', backgroundColor: 'var(--surface)', borderRadius: '0.75rem', border: '1px solid var(--border)', transition: 'all 0.15s' }}>
                          {editingColabId === c.id && (isEditing || isCreating) ? (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                              <input type="text" value={c.nombre} onChange={(e) => updateColaborador(c.id, { nombre: e.target.value })} style={inputStyle} placeholder="Nombre" />
                              <input type="text" value={c.puesto} onChange={(e) => updateColaborador(c.id, { puesto: e.target.value })} style={inputStyle} placeholder="Puesto" />
                              <input type="email" value={c.email} onChange={(e) => updateColaborador(c.id, { email: e.target.value })} style={inputStyle} placeholder="Email" />
                              <input type="text" value={c.telefono} onChange={(e) => updateColaborador(c.id, { telefono: e.target.value })} style={inputStyle} placeholder="Tel\u00e9fono" />
                              <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end' }}>
                                <button onClick={() => setEditingColabId(null)} style={{ padding: '0.35rem 0.65rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '0.375rem', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit' }}>Listo</button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <div style={{ width: '2.25rem', height: '2.25rem', borderRadius: '50%', backgroundColor: editForm.color + '20', color: editForm.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: '700', flexShrink: 0 }}>
                                {c.nombre ? c.nombre.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() : '?'}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--foreground)' }}>{c.nombre}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--secondary)', display: 'flex', gap: '0.75rem', marginTop: '0.15rem', flexWrap: 'wrap' }}>
                                  {c.puesto && <span>{c.puesto}</span>}
                                  {c.email && <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}><EnvelopeIcon style={{ width: '0.7rem', height: '0.7rem' }} />{c.email}</span>}
                                  {c.telefono && <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}><PhoneIcon style={{ width: '0.7rem', height: '0.7rem' }} />{c.telefono}</span>}
                                </div>
                              </div>
                              {(isEditing || isCreating) && (
                                <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                                  <button onClick={() => setEditingColabId(c.id)} style={{ padding: '0.3rem', background: 'none', border: '1px solid var(--border)', borderRadius: '0.25rem', color: 'var(--secondary)', cursor: 'pointer', display: 'flex' }}><PencilIcon style={{ width: '0.8rem', height: '0.8rem' }} /></button>
                                  <button onClick={() => removeColaborador(c.id)} style={{ padding: '0.3rem', background: 'none', border: '1px solid #ef444440', borderRadius: '0.25rem', color: '#ef4444', cursor: 'pointer', display: 'flex' }}><XMarkIcon style={{ width: '0.8rem', height: '0.8rem' }} /></button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

function FieldBlock({ icon, label, value, editing, onChange, inputStyle, labelStyle }: {
  icon: React.ReactNode; label: string; value: string; editing: boolean;
  onChange: (v: string) => void; inputStyle: React.CSSProperties; labelStyle: React.CSSProperties;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {editing ? (
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--secondary)', display: 'flex' }}>{icon}</span>
          <input type="text" value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, paddingLeft: '2rem' }} placeholder={label} />
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: value ? 'var(--foreground)' : 'var(--secondary)', padding: '0.5rem 0' }}>
          <span style={{ color: 'var(--secondary)', display: 'flex' }}>{icon}</span>
          {value || 'Sin datos'}
        </div>
      )}
    </div>
  );
}

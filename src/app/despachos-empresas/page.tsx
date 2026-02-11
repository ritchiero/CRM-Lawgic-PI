"use client";
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo, useRef } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { subscribeToDespachos, createDespacho, updateDespacho, deleteDespacho, seedDefaultDespachos, Despacho } from '@/services/despachoService';
import { subscribeToTargets, Target, updateTarget } from '@/services/targetService';
import { subscribeToRepresentatives, Representative } from '@/services/representativeService';
import {
  ArrowLeftIcon, MagnifyingGlassIcon, PlusIcon, XMarkIcon,
  BuildingOfficeIcon, PencilIcon, TrashIcon,
  EnvelopeIcon, PhoneIcon, GlobeAltIcon, MapPinIcon,
  UserGroupIcon, CheckIcon, ChevronDownIcon, ChevronUpIcon,
  LinkIcon, UserMinusIcon, PhotoIcon
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

function LogoAvatar({ src, initials, color, size, fontSize, borderRadius }: { src?: string; initials: string; color: string; size?: string; fontSize?: string; borderRadius?: string }) {
  const [imgError, setImgError] = useState(false);
  const showImg = src && !imgError;
  useEffect(() => { setImgError(false); }, [src]);
  return (
    <div style={{ width: size || '2.5rem', height: size || '2.5rem', borderRadius: borderRadius || '0.5rem', backgroundColor: showImg ? 'transparent' : color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: fontSize || '0.75rem', fontWeight: '700', flexShrink: 0, overflow: 'hidden', position: 'relative' }}>
      {showImg && <img src={src} alt={initials} style={{ width: '100%', height: '100%', objectFit: 'contain', position: 'absolute', inset: 0 }} onError={() => setImgError(true)} />}
      {!showImg && initials}
    </div>
  );
}

type PersonItem = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  brandCount?: number;
  source: 'target' | 'representative';
  stage?: string;
};

export default function DespachosEmpresasPage() {
  const router = useRouter();
  const [despachos, setDespachos] = useState<Despacho[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [representatives, setRepresentatives] = useState<Representative[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDespacho, setSelectedDespacho] = useState<Despacho | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [expandedColabs, setExpandedColabs] = useState(true);
  const [editForm, setEditForm] = useState({
    nombre: '', color: '#6366f1', initials: '', logo: '', logoUrl: '',
    direccion: '', telefono: '', email: '', sitioWeb: '', notas: '',
  });
  const [seeding, setSeeding] = useState(false);
  const [saving, setSaving] = useState(false);

  // For the person search dropdown
  const [personSearch, setPersonSearch] = useState('');
  const [showPersonDropdown, setShowPersonDropdown] = useState(false);
  const personDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub1 = subscribeToDespachos((data) => { setDespachos(data); setLoading(false); });
    const unsub2 = subscribeToTargets((data) => { setTargets(data); });
    const unsub3 = subscribeToRepresentatives((data) => { setRepresentatives(data); });
    return () => { unsub1(); unsub2(); unsub3(); };
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (personDropdownRef.current && !personDropdownRef.current.contains(e.target as Node)) {
        setShowPersonDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (selectedDespacho) {
      setEditForm({
        nombre: selectedDespacho.nombre, color: selectedDespacho.color,
        initials: selectedDespacho.initials, logo: selectedDespacho.logo,
        logoUrl: selectedDespacho.logoUrl,
        direccion: selectedDespacho.direccion, telefono: selectedDespacho.telefono,
        email: selectedDespacho.email, sitioWeb: selectedDespacho.sitioWeb,
        notas: selectedDespacho.notas,
      });
      setIsEditing(false);
      setShowPersonDropdown(false);
      setPersonSearch('');
    }
  }, [selectedDespacho]);

  // People linked to the current despacho (by company field matching despacho name)
  const linkedTargets = useMemo(() => {
    const name = selectedDespacho?.nombre || editForm.nombre;
    if (!name) return [];
    return targets.filter(t => t.company?.toLowerCase() === name.toLowerCase());
  }, [targets, selectedDespacho, editForm.nombre]);

  // People available to add (not yet linked)
  const availablePeople = useMemo(() => {
    const name = selectedDespacho?.nombre || editForm.nombre;
    if (!name) return [];
    const all: PersonItem[] = [
      ...targets.filter(t => t.company?.toLowerCase() !== name.toLowerCase()).map(t => ({
        id: t.id, name: t.name, email: t.email, phone: t.phone,
        company: t.company, brandCount: t.brandCount, source: 'target' as const, stage: t.stage,
      })),
      ...representatives.map(r => ({
        id: r.id, name: r.name, brandCount: r.brandCount, source: 'representative' as const,
      })),
    ];
    if (!personSearch.trim()) return all.slice(0, 30);
    const q = personSearch.toLowerCase();
    return all.filter(p => p.name.toLowerCase().includes(q)).slice(0, 30);
  }, [targets, representatives, selectedDespacho, editForm.nombre, personSearch]);

  // Count linked people (targets only since reps don't have company)
  const linkedCount = linkedTargets.length;

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return despachos;
    const t = searchTerm.toLowerCase();
    return despachos.filter(d => d.nombre.toLowerCase().includes(t));
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
      await createDespacho({ nombre: editForm.nombre, color: editForm.color, initials, logo: editForm.logo, logoUrl: editForm.logoUrl, direccion: editForm.direccion, telefono: editForm.telefono, email: editForm.email, sitioWeb: editForm.sitioWeb, notas: editForm.notas, colaboradores: [] });
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
      await updateDespacho(selectedDespacho.id, { nombre: editForm.nombre, color: editForm.color, initials, logo: editForm.logo, logoUrl: editForm.logoUrl, direccion: editForm.direccion, telefono: editForm.telefono, email: editForm.email, sitioWeb: editForm.sitioWeb, notas: editForm.notas });
      setIsEditing(false);
    } catch { alert('Error al actualizar despacho.'); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!selectedDespacho) return;
    if (!confirm('¿Eliminar este despacho? Esta acción no se puede deshacer.')) return;
    try {
      await deleteDespacho(selectedDespacho.id);
      setSelectedDespacho(null);
    } catch { alert('Error al eliminar.'); }
  };

  const resetForm = () => {
    setEditForm({ nombre: '', color: '#6366f1', initials: '', logo: '', logoUrl: '', direccion: '', telefono: '', email: '', sitioWeb: '', notas: '' });
  };

  // Link a target to this despacho by setting its company field
  const linkPerson = async (person: PersonItem) => {
    if (person.source !== 'target') return;
    const despachoName = selectedDespacho?.nombre || editForm.nombre;
    if (!despachoName) return;
    try {
      await updateTarget(person.id, { company: despachoName });
      setShowPersonDropdown(false);
      setPersonSearch('');
    } catch { alert('Error al vincular persona.'); }
  };

  // Unlink a target from this despacho
  const unlinkPerson = async (targetId: string) => {
    try {
      await updateTarget(targetId, { company: '' });
    } catch { alert('Error al desvincular persona.'); }
  };

  const startCreating = () => {
    resetForm();
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
  const labelStyle = { fontSize: '0.75rem', fontWeight: '600' as const, color: 'var(--secondary)', marginBottom: '0.35rem', display: 'block' as const };

  return (
    <ProtectedRoute>
      <div style={{ minHeight: '100vh', backgroundColor: 'var(--background)', fontFamily: 'var(--font-sans)', display: 'flex' }}>
        {/* LEFT PANEL */}
        <div style={{ width: '380px', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
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
          <div style={{ padding: '0.75rem 1.5rem' }}>
            <div style={{ position: 'relative' }}>
              <MagnifyingGlassIcon style={{ width: '1rem', height: '1rem', position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--secondary)', pointerEvents: 'none' }} />
              <input type="text" placeholder="Buscar despacho..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ ...inputStyle, paddingLeft: '2.25rem', fontSize: '0.8rem' }} />
            </div>
          </div>
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
            {!loading && filtered.map((d) => {
              const dLinked = targets.filter(t => t.company?.toLowerCase() === d.nombre.toLowerCase()).length;
              return (
                <div key={d.id} onClick={() => { setIsCreating(false); setSelectedDespacho(d); }}
                  style={{ padding: '0.85rem 1rem', marginBottom: '0.35rem', borderRadius: '0.6rem', cursor: 'pointer', backgroundColor: selectedDespacho?.id === d.id ? d.color + '12' : 'transparent', border: selectedDespacho?.id === d.id ? '1px solid ' + d.color + '30' : '1px solid transparent', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <LogoAvatar src={d.logoUrl} initials={d.initials} color={d.color} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.nombre}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--secondary)', marginTop: '0.15rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <UserGroupIcon style={{ width: '0.8rem', height: '0.8rem' }} />
                      {dLinked} persona{dLinked !== 1 ? 's' : ''} vinculada{dLinked !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--background)' }}>
          {!selectedDespacho && !isCreating ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--secondary)' }}>
              <div style={{ textAlign: 'center' }}>
                <BuildingOfficeIcon style={{ width: '3rem', height: '3rem', color: 'var(--border)', margin: '0 auto 1rem' }} />
                <p style={{ fontSize: '1rem', fontWeight: '500' }}>Selecciona un despacho</p>
                <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>o crea uno nuevo con el botón +</p>
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
                <LogoAvatar src={editForm.logoUrl} initials={editForm.initials || (editForm.nombre ? generateInitials(editForm.nombre) : '??')} color={editForm.color} size="4.5rem" fontSize="1.5rem" borderRadius="0.75rem" />
                <div style={{ flex: 1 }}>
                  {isEditing || isCreating ? (
                    <input type="text" value={editForm.nombre} onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value, initials: generateInitials(e.target.value) })} placeholder="Nombre del despacho..." style={{ ...inputStyle, fontSize: '1.15rem', fontWeight: '700', border: 'none', backgroundColor: 'transparent', padding: '0.25rem 0' }} />
                  ) : (
                    <div style={{ fontSize: '1.15rem', fontWeight: '700', color: 'var(--foreground)' }}>{editForm.nombre}</div>
                  )}
                  <div style={{ fontSize: '0.8rem', color: 'var(--secondary)', marginTop: '0.25rem' }}>
                    {linkedCount} persona{linkedCount !== 1 ? 's' : ''} vinculada{linkedCount !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>

  
            {/* Logo URL display (view mode) */}
            {!isEditing && !isCreating && editForm.logoUrl && (
              <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <PhotoIcon style={{ width: '0.9rem', height: '0.9rem', color: 'var(--secondary)' }} />
                <a href={editForm.logoUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: 'var(--primary)', textDecoration: 'none' }}>Ver logo original</a>
              </div>
            )}

            {/* Color Picker */}
              {(isEditing || isCreating) && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={labelStyle}>Color del despacho</label>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {COLOR_OPTIONS.map(clr => (
                      <button key={clr} onClick={() => setEditForm({ ...editForm, color: clr })}
                        style={{ width: '2rem', height: '2rem', borderRadius: '0.375rem', backgroundColor: clr, border: editForm.color === clr ? '3px solid var(--foreground)' : '2px solid transparent', cursor: 'pointer', transition: 'all 0.15s' }} />
                    ))}
                  </div>
                </div>
              )}

  
            {/* Logo URL */}
            {(isEditing || isCreating) && (
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={labelStyle}>Logo URL (imagen externa)</label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <PhotoIcon style={{ width: '1rem', height: '1rem', position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--secondary)' }} />
                    <input
                      type="text"
                      value={editForm.logoUrl}
                      onChange={(e) => setEditForm({ ...editForm, logoUrl: e.target.value })}
                      style={{ ...inputStyle, paddingLeft: '2rem' }}
                      placeholder="https://ejemplo.com/logo.png"
                    />
                  </div>
                  {editForm.logoUrl && (
                    <div style={{ width: '2.5rem', height: '2.5rem', borderRadius: '0.5rem', border: '1px solid var(--border)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--background)' }}>
                      <img src={editForm.logoUrl} alt="preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Details Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <FieldBlock icon={<EnvelopeIcon style={{ width: '1rem', height: '1rem' }} />} label="Email" value={editForm.email} editing={isEditing || isCreating} onChange={(v) => setEditForm({ ...editForm, email: v })} inputStyle={inputStyle} labelStyle={labelStyle} />
                <FieldBlock icon={<PhoneIcon style={{ width: '1rem', height: '1rem' }} />} label="Teléfono" value={editForm.telefono} editing={isEditing || isCreating} onChange={(v) => setEditForm({ ...editForm, telefono: v })} inputStyle={inputStyle} labelStyle={labelStyle} />
                <FieldBlock icon={<GlobeAltIcon style={{ width: '1rem', height: '1rem' }} />} label="Sitio Web" value={editForm.sitioWeb} editing={isEditing || isCreating} onChange={(v) => setEditForm({ ...editForm, sitioWeb: v })} inputStyle={inputStyle} labelStyle={labelStyle} />
                <FieldBlock icon={<MapPinIcon style={{ width: '1rem', height: '1rem' }} />} label="Dirección" value={editForm.direccion} editing={isEditing || isCreating} onChange={(v) => setEditForm({ ...editForm, direccion: v })} inputStyle={inputStyle} labelStyle={labelStyle} />
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

              {/* PERSONAS VINCULADAS Section */}
              {!isCreating && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <button onClick={() => setExpandedColabs(!expandedColabs)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                    <UserGroupIcon style={{ width: '1.15rem', height: '1.15rem', color: 'var(--primary)' }} />
                    <span style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--foreground)' }}>Personas vinculadas ({linkedCount})</span>
                    {expandedColabs ? <ChevronUpIcon style={{ width: '0.9rem', height: '0.9rem', color: 'var(--secondary)' }} /> : <ChevronDownIcon style={{ width: '0.9rem', height: '0.9rem', color: 'var(--secondary)' }} />}
                  </button>
                </div>

                {expandedColabs && (
                  <>
                    {/* Search to add person */}
                    <div ref={personDropdownRef} style={{ position: 'relative', marginBottom: '1rem' }}>
                      <div style={{ position: 'relative' }}>
                        <LinkIcon style={{ width: '1rem', height: '1rem', position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--secondary)', pointerEvents: 'none' }} />
                        <input type="text" placeholder="Buscar persona para vincular..." value={personSearch}
                          onFocus={() => setShowPersonDropdown(true)}
                          onChange={(e) => { setPersonSearch(e.target.value); setShowPersonDropdown(true); }}
                          style={{ ...inputStyle, paddingLeft: '2.25rem', fontSize: '0.85rem' }} />
                      </div>

                      {showPersonDropdown && (
                        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, maxHeight: '260px', overflowY: 'auto', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.75rem', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', zIndex: 100 }}>
                          {availablePeople.length === 0 && (
                            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--secondary)', fontSize: '0.8rem' }}>No se encontraron personas</div>
                          )}
                          {availablePeople.map((p) => (
                            <button key={p.source + '-' + p.id} onClick={() => linkPerson(p)} disabled={p.source !== 'target'}
                              style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', width: '100%', padding: '0.65rem 0.85rem', border: 'none', background: 'transparent', cursor: p.source === 'target' ? 'pointer' : 'default', fontSize: '0.85rem', color: 'var(--foreground)', fontFamily: 'inherit', textAlign: 'left', transition: 'background 0.1s', opacity: p.source !== 'target' ? 0.5 : 1 }}
                              onMouseEnter={(e) => { if (p.source === 'target') e.currentTarget.style.background = 'var(--background)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                              <div style={{ width: '2rem', height: '2rem', borderRadius: '50%', backgroundColor: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.6rem', fontWeight: '700', flexShrink: 0 }}>
                                {p.name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--secondary)', display: 'flex', gap: '0.5rem' }}>
                                  <span style={{ padding: '0.1rem 0.35rem', borderRadius: '0.25rem', backgroundColor: p.source === 'target' ? '#6366f120' : '#f59e0b20', color: p.source === 'target' ? '#6366f1' : '#f59e0b', fontSize: '0.65rem', fontWeight: '600' }}>
                                    {p.source === 'target' ? 'Target' : 'Representante'}
                                  </span>
                                  {p.company && <span>{p.company}</span>}
                                  {p.stage && <span>{p.stage}</span>}
                                  {p.brandCount != null && <span>{p.brandCount} marcas</span>}
                                </div>
                              </div>
                              {p.source === 'target' && <LinkIcon style={{ width: '0.9rem', height: '0.9rem', color: 'var(--primary)', flexShrink: 0 }} />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Linked people list */}
                    {linkedTargets.length === 0 && (
                      <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--secondary)', fontSize: '0.85rem', backgroundColor: 'var(--surface)', borderRadius: '0.75rem', border: '1px solid var(--border)' }}>
                        No hay personas vinculadas a este despacho
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {linkedTargets.map((t) => (
                        <div key={t.id} style={{ padding: '0.85rem 1rem', backgroundColor: 'var(--surface)', borderRadius: '0.75rem', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{ width: '2.25rem', height: '2.25rem', borderRadius: '50%', backgroundColor: editForm.color + '20', color: editForm.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: '700', flexShrink: 0 }}>
                            {t.name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--foreground)' }}>{t.name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--secondary)', display: 'flex', gap: '0.75rem', marginTop: '0.15rem', flexWrap: 'wrap' }}>
                              {t.stage && <span style={{ padding: '0.1rem 0.4rem', borderRadius: '0.25rem', backgroundColor: '#6366f115', color: '#6366f1', fontWeight: '600', fontSize: '0.65rem' }}>{t.stage}</span>}
                              {t.email && <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}><EnvelopeIcon style={{ width: '0.7rem', height: '0.7rem' }} />{t.email}</span>}
                              {t.phone && <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}><PhoneIcon style={{ width: '0.7rem', height: '0.7rem' }} />{t.phone}</span>}
                              {t.brandCount != null && t.brandCount > 0 && <span>{t.brandCount} marcas</span>}
                            </div>
                          </div>
                          <button onClick={() => unlinkPerson(t.id)} title="Desvincular persona" style={{ padding: '0.35rem', background: 'none', border: '1px solid #ef444430', borderRadius: '0.35rem', color: '#ef4444', cursor: 'pointer', display: 'flex', flexShrink: 0 }}>
                            <UserMinusIcon style={{ width: '0.85rem', height: '0.85rem' }} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
              )}
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

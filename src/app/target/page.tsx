"use client";
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo, useRef } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeToTargets, Target, updateTarget, createTarget } from '@/services/targetService';
import { subscribeToRepresentatives, Representative } from '@/services/representativeService';
import ScrapeIMPIButton from '@/components/ScrapeIMPIButton';
import { subscribeToDespachos, Despacho } from '@/services/despachoService';
import { ArrowLeftIcon, MagnifyingGlassIcon, XMarkIcon, EnvelopeIcon, PhoneIcon, BuildingOfficeIcon, TagIcon, CalendarIcon, ChatBubbleLeftIcon, CameraIcon, DocumentTextIcon, InformationCircleIcon, FlagIcon, StarIcon, DocumentArrowDownIcon, PencilIcon, CheckIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';

const DESPACHOS = [
  { name: 'Tópica Media, S.A. de C.V', color: '#6366f1', initials: 'TM', logo: '/logos/topica-media.png' },
  { name: 'Baker McKenzie', color: '#ef4444', initials: 'BM', logo: '/logos/baker-mckenzie.png' },
  { name: 'Hogan Lovells', color: '#f59e0b', initials: 'HL', logo: '/logos/hogan-lovells.png' },
  { name: 'Olivares', color: '#22c55e', initials: 'OL', logo: '/logos/olivares.png' },
  { name: 'Uhthoff, Gómez Vega & Uhthoff', color: '#3b82f6', initials: 'UG', logo: '/logos/uhthoff.png' },
  { name: 'Arochi & Lindner', color: '#ec4899', initials: 'AL', logo: '/logos/arochi-lindner.png' },
  { name: 'Basham, Ringe y Correa', color: '#8b5cf6', initials: 'BR', logo: '/logos/basham.png' },
  { name: 'Goodrich Riquelme', color: '#14b8a6', initials: 'GR', logo: '/logos/goodrich.png' },
  { name: 'Becerril, Coca & Becerril', color: '#f97316', initials: 'BC', logo: '/logos/becerril.png' },
  { name: 'Dumont Bergman Bider', color: '#06b6d4', initials: 'DB', logo: '/logos/dumont.png' },
];

type SortField = 'name' | 'brandCount' | 'none';
type SortDirection = 'asc' | 'desc';

export default function TargetPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [prospects, setProspects] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [representatives, setRepresentatives] = useState<Representative[]>([]);
  const [loadingReps, setLoadingReps] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProspect, setSelectedProspect] = useState<Target | null>(null);
  const [activeTab, setActiveTab] = useState('infos');
  const [despachoDropdownOpen, setDespachoDropdownOpen] = useState(false);
  const [customDespacho, setCustomDespacho] = useState('');
  const despachoRef = useRef<HTMLDivElement>(null);
  const [firestoreDespachos, setFirestoreDespachos] = useState<Despacho[]>([]);
  const [sortField, setSortField] = useState<SortField>('none');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [editingContact, setEditingContact] = useState(false);
  const [editContactForm, setEditContactForm] = useState({ email: '', phone: '', linkedinUrl: '', leadSource: '' });
  const [savingContact, setSavingContact] = useState(false);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortField('none');
        setSortDirection('asc');
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeToTargets((data) => {
      setProspects(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const unsubReps = subscribeToRepresentatives((data) => {
      setRepresentatives(data);
      setLoadingReps(false);
    });
    return () => unsubReps();
  }, []);

  useEffect(() => {
    const unsubDespachos = subscribeToDespachos((data) => {
      setFirestoreDespachos(data);
    });
    return () => unsubDespachos();
  }, []);

  useEffect(() => {
    if (selectedProspect) {
      setActiveTab('infos');
      setDespachoDropdownOpen(false);
      setEditingContact(false);
      setEditContactForm({
        email: selectedProspect.email || '',
        phone: selectedProspect.phone || '',
        linkedinUrl: selectedProspect.linkedinUrl || '',
        leadSource: selectedProspect.leadSource || ''
      });
    }
  }, [selectedProspect]);

  // Close despacho dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (despachoRef.current && !despachoRef.current.contains(event.target as Node)) {
        setDespachoDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getDespachoForProspect = (prospect: Target) => {
    const despachoName = prospect.company;
    if (!despachoName || !despachoName.trim()) return null;
    const found = DESPACHOS.find(d => d.name.toLowerCase() === despachoName.toLowerCase());
    const fsDespacho = firestoreDespachos.find(d => d.nombre.toLowerCase() === despachoName.toLowerCase());
    if (found) {
      return { ...found, logo: fsDespacho?.logoUrl || found.logo };
    }
    if (fsDespacho) {
      return { name: fsDespacho.nombre, color: fsDespacho.color, initials: fsDespacho.initials, logo: fsDespacho.logoUrl || '' };
    }
    const words = despachoName.trim().split(' ').filter(Boolean);
    const initials = words.length >= 2
      ? (words[0][0] + words[1][0]).toUpperCase()
      : despachoName.trim().substring(0, 2).toUpperCase();
    return { name: despachoName, color: '#6b7280', initials, logo: '' };
  };

  const filteredProspects = useMemo(() => {
    // Merge representatives into targets, deduplicating by name
    const targetsByName = new Map<string, Target>();

    // First, add all real targets
    for (const target of prospects) {
      const key = target.name.toLowerCase().trim();
      targetsByName.set(key, target);
    }

    // Then, for each representative:
    // - If a target with the same name exists, merge brandCount into it
    // - If not, add as a virtual target entry
    for (const rep of representatives) {
      const key = rep.name.toLowerCase().trim();
      const existingTarget = targetsByName.get(key);
      if (existingTarget) {
        targetsByName.set(key, {
          ...existingTarget,
          brandCount: rep.brandCount || existingTarget.brandCount,
        });
      } else {
        targetsByName.set(key, {
          id: rep.id,
          name: rep.name,
          company: '',
          email: '',
          phone: '',
          notes: '',
          stage: '',
          createdAt: rep.createdAt || new Date(),
          createdBy: 'representative',
          history: [],
          brandCount: rep.brandCount,
        });
      }
    }

    let allItems = Array.from(targetsByName.values());

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      allItems = allItems.filter((p) =>
        p.name.toLowerCase().includes(term)
      );
    }

    // Apply sorting
    if (sortField !== 'none') {
      allItems.sort((a, b) => {
        if (sortField === 'name') {
          const nameA = a.name.toLowerCase();
          const nameB = b.name.toLowerCase();
          if (nameA < nameB) return sortDirection === 'asc' ? -1 : 1;
          if (nameA > nameB) return sortDirection === 'asc' ? 1 : -1;
          return 0;
        }
        if (sortField === 'brandCount') {
          const countA = a.brandCount || 0;
          const countB = b.brandCount || 0;
          return sortDirection === 'asc' ? countA - countB : countB - countA;
        }
        return 0;
      });
    }

    return allItems;
  }, [prospects, representatives, searchTerm, sortField, sortDirection]);

  const handleExportCSV = () => {
    const withEmail = filteredProspects.filter(p => p.email && p.email.trim() !== '');
    if (withEmail.length === 0) {
      alert('No hay contactos con correo disponible.');
      return;
    }
    const header = 'Nombre,Correo';
    const rows = withEmail.map(p => {
      const name = p.name.replace(/,/g, ' ');
      const email = p.email.replace(/,/g, ' ');
      return name + ',' + email;
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contactos_target.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const getDespachoInfo = (companyName: string) => {
    const found = DESPACHOS.find(d => d.name.toLowerCase() === companyName?.toLowerCase());
    const fsDespacho = firestoreDespachos.find(d => d.nombre.toLowerCase() === companyName?.toLowerCase());
    if (found) {
      return { ...found, logo: fsDespacho?.logoUrl || found.logo };
    }
    if (fsDespacho) {
      return { name: fsDespacho.nombre, color: fsDespacho.color, initials: fsDespacho.initials, logo: fsDespacho.logoUrl || '' };
    }
    if (companyName && companyName.trim()) {
      const words = companyName.trim().split(' ').filter(Boolean);
      const initials = words.length >= 2
        ? (words[0][0] + words[1][0]).toUpperCase()
        : companyName.trim().substring(0, 2).toUpperCase();
      return { name: companyName, color: '#6b7280', initials, logo: '' };
    }
    return null;
  };

  const handleDespachoSelect = async (despachoName: string) => {
    if (!selectedProspect) return;
    try {
      // Check if this is a representative entry (not a real target)
      if (selectedProspect.createdBy === 'representative') {
        // Create a new target from the representative data, then assign despacho
        const newTargetId = await createTarget({
          name: selectedProspect.name,
          company: despachoName,
          email: '',
          phone: '',
          notes: '',
          brandCount: selectedProspect.brandCount,
        });
        setSelectedProspect({ ...selectedProspect, id: newTargetId, company: despachoName, createdBy: 'system' });
      } else {
        await updateTarget(selectedProspect.id, { company: despachoName });
        setSelectedProspect({ ...selectedProspect, company: despachoName });
      }
      setDespachoDropdownOpen(false);
      setCustomDespacho('');
    } catch (error) {
      console.error('Error updating despacho:', error);
      alert('Error al asignar despacho. Intenta de nuevo.');
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  };

  const getStageColor = (stage: string) => {
    const colors: Record<string, string> = {
      'Detección de prospecto': '#6366f1',
      '1er Contacto': '#8b5cf6',
      'Contacto efectivo': '#a855f7',
      'Muestra de interés': '#ec4899',
      'Cita para demo': '#3b82f6',
      'Demo realizada': '#0ea5e9',
      'Venta': '#22c55e',
      'En Pausa': '#f59e0b',
      'Basura': '#6b7280',
      'Cliente Perdido': '#ef4444',
    };
    return colors[stage] || '#6366f1';
  };

  const getStageProgress = (stage: string) => {
    const stages: Record<string, number> = {
      'Detección de prospecto': 14,
      '1er Contacto': 28,
      'Contacto efectivo': 42,
      'Muestra de interés': 50,
      'Cita para demo': 64,
      'Demo realizada': 78,
      'Venta': 100,
      'En Pausa': 0,
      'Basura': 0,
      'Cliente Perdido': 0,
    };
    return stages[stage] || 0;
  };

  const getStageRisk = (stage: string) => {
    const risk: Record<string, { label: string; color: string }> = {
      'Detección de prospecto': { label: 'Early Stage', color: '#6366f1' },
      '1er Contacto': { label: 'In Progress', color: '#8b5cf6' },
      'Contacto efectivo': { label: 'In Progress', color: '#a855f7' },
      'Muestra de interés': { label: 'Engaged', color: '#ec4899' },
      'Cita para demo': { label: 'On Track', color: '#3b82f6' },
      'Demo realizada': { label: 'On Track', color: '#0ea5e9' },
      'Venta': { label: 'Won', color: '#22c55e' },
      'En Pausa': { label: 'Paused', color: '#f59e0b' },
      'Basura': { label: 'Discarded', color: '#6b7280' },
      'Cliente Perdido': { label: 'Lost', color: '#ef4444' },
    };
    return risk[stage] || { label: 'Unknown', color: '#6b7280' };
  };

  const getStageIndex = (stage: string) => {
    const order = ['Detección de prospecto', '1er Contacto', 'Contacto efectivo', 'Muestra de interés', 'Cita para demo', 'Demo realizada', 'Venta'];
    const idx = order.indexOf(stage);
    return idx >= 0 ? idx + 1 : 0;
  };

  const formatDate = (date: Date | undefined) => {
    if (!date) return null;
    return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  };

  const tabs = [
    { id: 'infos', label: 'Infos', icon: 'info' },
    { id: 'objectives', label: 'Objectives', icon: 'flag' },
    { id: 'documents', label: 'Documents', icon: 'doc' },
    { id: 'reviews', label: 'Reviews', icon: 'star' },
  ];

  const SortIcon = ({ field }: { field: SortField }) => {
    const isActive = sortField === field;
    if (!isActive) {
      return (
        <span style={{ display: 'inline-flex', flexDirection: 'column', marginLeft: '0.35rem', opacity: 0.35 }}>
          <ChevronUpIcon style={{ width: '0.65rem', height: '0.65rem', marginBottom: '-2px' }} />
          <ChevronDownIcon style={{ width: '0.65rem', height: '0.65rem', marginTop: '-2px' }} />
        </span>
      );
    }
    return sortDirection === 'asc'
      ? <ChevronUpIcon style={{ width: '0.8rem', height: '0.8rem', marginLeft: '0.35rem', color: '#6366f1' }} />
      : <ChevronDownIcon style={{ width: '0.8rem', height: '0.8rem', marginLeft: '0.35rem', color: '#6366f1' }} />;
  };

  return (
    <ProtectedRoute>
      <div style={{ minHeight: '100vh', backgroundColor: 'var(--background)', fontFamily: 'var(--font-sans)', padding: '2rem' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          {/* Header */}
          <div style={{ marginBottom: '2rem' }}>
            <button onClick={() => router.back()} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', color: 'var(--secondary)', cursor: 'pointer', marginBottom: '1rem', fontSize: '0.875rem' }}>
              <ArrowLeftIcon style={{ width: '1rem', height: '1rem' }} />
              Volver
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h1 style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--foreground)', margin: 0 }}>Targets</h1>
                <p style={{ fontSize: '0.875rem', color: 'var(--secondary)', marginTop: '0.5rem' }}>Lista de clientes potenciales</p>
              </div>
              <button onClick={() => router.push('/despachos-empresas')} style={{ padding: '0.6rem 1.25rem', backgroundColor: 'var(--surface)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: '0.75rem', fontSize: '0.875rem', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap', fontFamily: 'inherit', transition: 'all 0.15s ease' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--primary)'; e.currentTarget.style.color = 'white'; e.currentTarget.style.borderColor = 'var(--primary)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface)'; e.currentTarget.style.color = 'var(--foreground)'; e.currentTarget.style.borderColor = 'var(--border)'; }}>
                <BuildingOfficeIcon style={{ width: '1.25rem', height: '1.25rem' }} />
                Despachos
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <MagnifyingGlassIcon style={{ width: '1.25rem', height: '1.25rem', position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--secondary)', pointerEvents: 'none' }} />
              <input type="text" placeholder="Buscar cliente por nombre..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 3rem', fontSize: '0.9375rem', border: '1px solid var(--border)', borderRadius: '0.75rem', backgroundColor: 'var(--surface)', color: 'var(--foreground)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
            <button onClick={handleExportCSV} style={{ padding: '0.65rem 1.25rem', backgroundColor: '#6C5CE7', color: 'white', border: 'none', borderRadius: '0.75rem', fontSize: '0.875rem', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap', height: '48px' }}>
              <DocumentArrowDownIcon style={{ width: '1.25rem', height: '1.25rem' }} />
              Exportar CSV
            </button>
            <ScrapeIMPIButton />
          </div>

          {/* Client List Table */}
          <div style={{ backgroundColor: 'var(--surface)', borderRadius: '0.75rem', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 0.75fr', padding: '0.75rem 1.5rem', backgroundColor: 'var(--surface)', borderBottom: '2px solid var(--border)', fontWeight: '600', fontSize: '0.75rem', color: 'var(--secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
              <button onClick={() => handleSort('name')} style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: '600', fontSize: '0.75rem', color: sortField === 'name' ? '#6366f1' : 'var(--secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', fontFamily: 'inherit' }}>
                Nombre del Cliente
                <SortIcon field="name" />
              </button>
              <span style={{ display: 'flex', alignItems: 'center' }}>Despacho / Empresa</span>
              <button onClick={() => handleSort('brandCount')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: '600', fontSize: '0.75rem', color: sortField === 'brandCount' ? '#6366f1' : 'var(--secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', fontFamily: 'inherit' }}>
                Marcas
                <SortIcon field="brandCount" />
              </button>
            </div>
            {(loading || loadingReps) && (<div style={{ padding: '3rem', textAlign: 'center', color: 'var(--secondary)', fontSize: '0.875rem' }}>Cargando clientes...</div>)}
            {!(loading || loadingReps) && filteredProspects.length === 0 && (<div style={{ padding: '3rem', textAlign: 'center', color: 'var(--secondary)', fontSize: '0.875rem' }}>{searchTerm.trim() ? 'No se encontraron clientes con ese nombre' : 'No hay clientes registrados'}</div>)}
            {!loading && filteredProspects.map((prospect) => {
              const despacho = getDespachoForProspect(prospect);
              return (
              <div key={prospect.id} onClick={() => setSelectedProspect(prospect)} style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 0.75fr', padding: '0.875rem 1.5rem', borderBottom: '1px solid var(--border)', fontSize: '0.9375rem', color: 'var(--foreground)', cursor: 'pointer', transition: 'background-color 0.15s ease', alignItems: 'center' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--border)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                  <div style={{ width: '2.25rem', height: '2.25rem', borderRadius: '50%', backgroundColor: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.75rem', fontWeight: '700', flexShrink: 0 }}>{getInitials(prospect.name)}</div>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prospect.name}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                  {despacho ? (
                    <>
                      <span style={{ width: '1.5rem', height: '1.5rem', borderRadius: '0.3rem', backgroundColor: despacho.logo ? 'transparent' : despacho.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.5rem', fontWeight: '700', flexShrink: 0, overflow: 'hidden' }}>
                        {despacho.logo ? <img src={despacho.logo} alt={despacho.initials} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => { const t = e.currentTarget; t.style.display='none'; if(t.parentElement) { t.parentElement.style.backgroundColor = despacho.color; t.parentElement.textContent = despacho.initials; }}} /> : despacho.initials}
                      </span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{despacho.name}</span>
                    </>
                  ) : (
                    <span style={{ fontSize: '0.8rem', color: 'var(--secondary)', fontStyle: 'italic' }}>—</span>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  {prospect.brandCount !== undefined && prospect.brandCount > 0 ? (
                    <div style={{ padding: '0.25rem 0.75rem', backgroundColor: '#f0f9ff', borderRadius: '0.375rem', fontSize: '0.75rem', color: '#0369a1', fontWeight: '600', whiteSpace: 'nowrap' }}>
                      {prospect.brandCount} marcas
                    </div>
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: 'var(--secondary)' }}>0</span>
                  )}
                </div>
              </div>
              );
            })}
          </div>
          {!loading && (<div style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--secondary)', textAlign: 'right' }}>{filteredProspects.length}{searchTerm.trim() ? ` de ${prospects.length}` : ''} cliente{filteredProspects.length !== 1 ? 's' : ''} en total</div>)}
        </div>
      </div>

      {/* OVERLAY */}
      {selectedProspect && (<div onClick={() => setSelectedProspect(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 1000, animation: 'fadeIn 0.2s ease' }} />)}

      {/* SIDEBAR MODAL */}
      <div style={{ position: 'fixed', top: 0, right: selectedProspect ? '0' : '-76vw', width: '75vw', height: '100vh', backgroundColor: 'var(--surface)', boxShadow: selectedProspect ? '-8px 0 30px rgba(0,0,0,0.15)' : 'none', zIndex: 1001, transition: 'right 0.3s cubic-bezier(0.4, 0, 0.2, 1)', overflowY: 'auto', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans)' }}>
        {selectedProspect && (() => {
          const progress = getStageProgress(selectedProspect.stage);
          const risk = getStageRisk(selectedProspect.stage);
          const stageIdx = getStageIndex(selectedProspect.stage);
          const despachoInfo = getDespachoInfo(selectedProspect.company);
          return (
            <>
              {/* Top bar */}
              <div style={{ padding: '1.25rem 2rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button onClick={() => setSelectedProspect(null)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', color: 'var(--secondary)', cursor: 'pointer', fontSize: '0.875rem', padding: 0 }}>
                  <ArrowLeftIcon style={{ width: '1rem', height: '1rem' }} />
                  Back
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', backgroundColor: 'var(--foreground)', color: 'var(--surface)', border: 'none', borderRadius: '0.5rem', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <DocumentArrowDownIcon style={{ width: '1rem', height: '1rem' }} />
                  Download PDF
                </button>
                <button
                  onClick={() => {
                    setEditingContact(true);
                    setEditContactForm({
                      email: selectedProspect.email || '',
                      phone: selectedProspect.phone || '',
                      linkedinUrl: selectedProspect.linkedinUrl || '',
                      leadSource: selectedProspect.leadSource || ''
                    });
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.5rem 1rem',
                    backgroundColor: '#6366f1', color: '#fff',
                    border: 'none', borderRadius: '0.5rem',
                    fontSize: '0.8rem', fontWeight: '600',
                    cursor: 'pointer', fontFamily: 'inherit'
                  }}>
                  <PencilIcon style={{ width: '1rem', height: '1rem' }} />
                  Editar Contacto
                </button>
                </div>
              </div>

              {/* Profile Header */}
              <div style={{ padding: '1.5rem 2rem 1rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{ width: '5.5rem', height: '5.5rem', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1.75rem', fontWeight: '700', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>{getInitials(selectedProspect.name)}</div>
                  <div style={{ position: 'absolute', bottom: '0', left: '0', width: '1.75rem', height: '1.75rem', borderRadius: '0.5rem', backgroundColor: 'var(--foreground)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }}>
                    <CameraIcon style={{ width: '1rem', height: '1rem', color: '#fff' }} />
                  </div>
                  {despachoInfo && (
                    <div title={despachoInfo.name} style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '2rem', height: '2rem', borderRadius: '50%', backgroundColor: despachoInfo.logo ? '#fff' : despachoInfo.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.5rem', fontWeight: '700', boxShadow: '0 2px 8px rgba(0,0,0,0.25)', border: '2px solid var(--surface)', overflow: 'hidden' }}>
                      {despachoInfo.logo ? <img src={despachoInfo.logo} alt={despachoInfo.initials} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => { const t = e.currentTarget; t.style.display='none'; if(t.parentElement) { t.parentElement.style.backgroundColor = despachoInfo.color; t.parentElement.textContent = despachoInfo.initials; }}} /> : despachoInfo.initials}
                    </div>
                  )}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--foreground)', margin: 0, lineHeight: 1.3 }}>{selectedProspect.name}</h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-block', padding: '0.2rem 0.65rem', borderRadius: '1rem', fontSize: '0.75rem', fontWeight: '600', color: getStageColor(selectedProspect.stage), border: '1.5px solid ' + getStageColor(selectedProspect.stage), backgroundColor: getStageColor(selectedProspect.stage) + '12' }}>{selectedProspect.stage}</span>

                    {/* Editable Despacho / Filiación */}
                    <div ref={despachoRef} style={{ position: 'relative' }}>
                      <button onClick={() => setDespachoDropdownOpen(!despachoDropdownOpen)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.2rem 0.6rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: despachoInfo ? despachoInfo.color + '12' : 'var(--background)', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--foreground)', fontFamily: 'inherit', transition: 'all 0.15s ease' }}>
                        {despachoInfo ? (
                          <>
                            <span style={{ width: '1.35rem', height: '1.35rem', borderRadius: '0.3rem', backgroundColor: despachoInfo.logo ? 'transparent' : despachoInfo.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.55rem', fontWeight: '700', flexShrink: 0, overflow: 'hidden' }}>{despachoInfo.logo ? <img src={despachoInfo.logo} alt={despachoInfo.initials} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => { const t = e.currentTarget; t.style.display='none'; if(t.parentElement) { t.parentElement.style.backgroundColor = despachoInfo.color; t.parentElement.textContent = despachoInfo.initials; }}} /> : despachoInfo.initials}</span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--foreground)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{despachoInfo.name}</span>
                          </>
                        ) : (
                          <>
                            <BuildingOfficeIcon style={{ width: '0.9rem', height: '0.9rem', color: 'var(--secondary)' }} />
                            <span style={{ fontSize: '0.8rem', color: 'var(--secondary)' }}>Asignar despacho</span>
                          </>
                        )}
                        <PencilIcon style={{ width: '0.7rem', height: '0.7rem', color: 'var(--secondary)', marginLeft: '0.2rem' }} />
                      </button>

                      {/* Despacho Dropdown */}
                      {despachoDropdownOpen && (
                        <div style={{ position: 'absolute', top: 'calc(100% + 0.35rem)', left: 0, minWidth: '280px', backgroundColor: 'var(--surface)', borderRadius: '0.75rem', border: '1px solid var(--border)', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', zIndex: 1100, overflow: 'hidden' }}>
                          <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.5rem', backgroundColor: 'var(--background)', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                              <MagnifyingGlassIcon style={{ width: '0.9rem', height: '0.9rem', color: 'var(--secondary)', flexShrink: 0 }} />
                              <input type="text" placeholder="Buscar o crear despacho..." value={customDespacho} onChange={(e) => setCustomDespacho(e.target.value)} autoFocus style={{ border: 'none', outline: 'none', fontSize: '0.8rem', color: 'var(--foreground)', backgroundColor: 'transparent', width: '100%', fontFamily: 'inherit' }} />
                            </div>
                          </div>
                          <div style={{ maxHeight: '220px', overflowY: 'auto', padding: '0.35rem' }}>
                            {DESPACHOS.filter(d => !customDespacho.trim() || d.name.toLowerCase().includes(customDespacho.toLowerCase())).map((d) => (
                              <button key={d.name} onClick={() => handleDespachoSelect(d.name)} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', padding: '0.5rem 0.6rem', border: 'none', background: selectedProspect.company === d.name ? d.color + '15' : 'transparent', borderRadius: '0.4rem', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--foreground)', fontFamily: 'inherit', textAlign: 'left', transition: 'background 0.1s' }}
                                onMouseEnter={(e) => { if (selectedProspect.company !== d.name) e.currentTarget.style.background = 'var(--background)'; }}
                                onMouseLeave={(e) => { if (selectedProspect.company !== d.name) e.currentTarget.style.background = 'transparent'; }}>
                                <span style={{ width: '1.6rem', height: '1.6rem', borderRadius: '0.35rem', backgroundColor: d.logo ? 'transparent' : d.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.6rem', fontWeight: '700', flexShrink: 0, overflow: 'hidden' }}>{d.logo ? <img src={d.logo} alt={d.initials} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => { const t = e.currentTarget; t.style.display='none'; if(t.parentElement) { t.parentElement.style.backgroundColor = d.color; t.parentElement.textContent = d.initials; }}} /> : d.initials}</span>
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                                {selectedProspect.company === d.name && <CheckIcon style={{ width: '0.9rem', height: '0.9rem', color: d.color, flexShrink: 0 }} />}
                              </button>
                            ))}
                            {customDespacho.trim() && !DESPACHOS.some(d => d.name.toLowerCase() === customDespacho.toLowerCase()) && (
                              <button onClick={() => handleDespachoSelect(customDespacho.trim())} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', padding: '0.5rem 0.6rem', border: 'none', background: 'transparent', borderRadius: '0.4rem', cursor: 'pointer', fontSize: '0.8rem', color: '#6366f1', fontFamily: 'inherit', textAlign: 'left', fontWeight: '500' }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--background)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                                <span style={{ width: '1.6rem', height: '1.6rem', borderRadius: '0.35rem', backgroundColor: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.6rem', fontWeight: '700', flexShrink: 0 }}>+</span>
                                Crear &quot;{customDespacho.trim()}&quot;
                              </button>
                            )}
                          </div>
                          {selectedProspect.company && (
                            <div style={{ borderTop: '1px solid var(--border)', padding: '0.35rem' }}>
                              <button onClick={() => handleDespachoSelect('')} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', padding: '0.5rem 0.6rem', border: 'none', background: 'transparent', borderRadius: '0.4rem', cursor: 'pointer', fontSize: '0.8rem', color: '#ef4444', fontFamily: 'inherit', textAlign: 'left' }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#ef444410'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                                <XMarkIcon style={{ width: '0.9rem', height: '0.9rem' }} />
                                Quitar despacho
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Tabs Navigation */}
              <div style={{ padding: '0 2rem', display: 'flex', alignItems: 'center', gap: '0.25rem', borderBottom: '1px solid var(--border)', marginTop: '0.5rem' }}>
                {tabs.map((tab) => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.75rem 1rem', fontSize: '0.8rem', fontWeight: activeTab === tab.id ? '600' : '400', color: activeTab === tab.id ? 'var(--foreground)' : 'var(--secondary)', background: 'none', border: 'none', borderBottom: activeTab === tab.id ? '2px solid var(--foreground)' : '2px solid transparent', cursor: 'pointer', fontFamily: 'inherit', marginBottom: '-1px', transition: 'all 0.15s ease' }}>
                    {tab.icon === 'info' && <InformationCircleIcon style={{ width: '1rem', height: '1rem' }} />}
                    {tab.icon === 'flag' && <FlagIcon style={{ width: '1rem', height: '1rem' }} />}
                    {tab.icon === 'doc' && <DocumentTextIcon style={{ width: '1rem', height: '1rem' }} />}
                    {tab.icon === 'star' && <StarIcon style={{ width: '1rem', height: '1rem' }} />}
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Summary Cards Row */}
              <div style={{ padding: '1.25rem 2rem', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                {/* Achievement Progress Card */}
                <div style={{ padding: '1.25rem 1.5rem', backgroundColor: 'var(--background)', borderRadius: '1rem', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--foreground)' }}>Achievement Progress</span>
                    <span style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--foreground)' }}>{progress} %</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginBottom: '1rem' }}>
                    {(() => {
                      const totalSegments = 10;
                      const filledSegments = Math.round(progress / 10);
                      const segmentColors = ['#ef4444', '#ef4444', '#f97316', '#f59e0b', '#3b82f6', '#3b82f6', '#6366f1', '#8b5cf6', '#8b5cf6', '#22c55e'];
                      const segments: React.ReactNode[] = [];
                      for (let i = 0; i < totalSegments; i++) {
                        segments.push(<div key={'s'+i} style={{ flex: 1, height: '0.4rem', borderRadius: '1rem', backgroundColor: i < filledSegments ? segmentColors[i] : 'var(--border)', transition: 'background-color 0.3s ease' }} />);
                      }
                      for (let i = 0; i < 5; i++) {
                        segments.push(<div key={'d'+i} style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: 'var(--border)', flexShrink: 0 }} />);
                      }
                      return segments;
                    })()}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--secondary)' }}>Last update : {formatDate(selectedProspect.createdAt) || 'N/A'}</span>
                    <span style={{ fontSize: '0.7rem', fontWeight: '600', color: risk.color, background: 'linear-gradient(135deg, ' + risk.color + '18, ' + risk.color + '08)', padding: '0.2rem 0.6rem', borderRadius: '1rem' }}>{risk.label}</span>
                  </div>
                </div>

                {/* Bonus Earned Card */}
                <div style={{ padding: '1.25rem 1.5rem', backgroundColor: 'var(--background)', borderRadius: '1rem', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--foreground)', marginBottom: '0.75rem' }}>Bonus Earned</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem', marginBottom: '1rem' }}>
                    <span style={{ fontSize: '1.65rem', fontWeight: '800', color: '#6366f1', letterSpacing: '-0.02em' }}>{'$' + (selectedProspect.potentialValue || 0).toLocaleString()}</span>
                    {selectedProspect.accountValue != null && (<span style={{ fontSize: '0.9rem', color: 'var(--secondary)', fontWeight: '400' }}>/ {selectedProspect.accountValue.toLocaleString()}</span>)}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--secondary)' }}>Objectives</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#6366f1', backgroundColor: '#6366f110', padding: '0.2rem 0.6rem', borderRadius: '0.375rem' }}>{stageIdx}<span style={{ fontWeight: '400', color: 'var(--secondary)' }}> /7</span></span>
                  </div>
                </div>

                {/* Marcas como Apoderado Card */}
                <div style={{ padding: '1.25rem 1.5rem', backgroundColor: 'var(--background)', borderRadius: '1rem', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--foreground)', marginBottom: '0.75rem' }}>Marcas como Apoderado</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem', marginBottom: '1rem' }}>
                    <span style={{ fontSize: '1.65rem', fontWeight: '800', color: '#8b5cf6', letterSpacing: '-0.02em' }}>{selectedProspect.brandCount || 0}</span>
                    <span style={{ fontSize: '0.9rem', color: 'var(--secondary)', fontWeight: '400' }}>marcas</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--secondary)' }}>Número de marcas</span>
                    <span style={{ fontSize: '0.7rem', fontWeight: '600', color: (selectedProspect.brandCount || 0) > 0 ? '#22c55e' : '#6b7280', background: (selectedProspect.brandCount || 0) > 0 ? '#22c55e18' : '#6b728018', padding: '0.2rem 0.6rem', borderRadius: '1rem' }}>{(selectedProspect.brandCount || 0) > 0 ? 'Activo' : 'Sin marcas'}</span>
                  </div>
                </div>
              </div>

              {/* Tab Content */}
              {activeTab === 'infos' && (
                <div style={{ padding: '0 2rem 2rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                  {/* LEFT COLUMN */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
                    {/* Contact Info */}
                    <div>
                      <h3 style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>Informacion de Contacto</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                        {selectedProspect.email && (<div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}><EnvelopeIcon style={{ width: '1.1rem', height: '1.1rem', color: 'var(--secondary)', flexShrink: 0 }} /><span style={{ fontSize: '0.9rem', color: 'var(--foreground)' }}>{selectedProspect.email}</span></div>)}
                        {selectedProspect.phone && (<div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}><PhoneIcon style={{ width: '1.1rem', height: '1.1rem', color: 'var(--secondary)', flexShrink: 0 }} /><span style={{ fontSize: '0.9rem', color: 'var(--foreground)' }}>{selectedProspect.phone}</span></div>)}
                        {selectedProspect.company && (<div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          {despachoInfo ? (
                            <span style={{ width: '1.1rem', height: '1.1rem', borderRadius: '0.2rem', backgroundColor: despachoInfo.logo ? 'transparent' : despachoInfo.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.45rem', fontWeight: '700', flexShrink: 0, overflow: 'hidden' }}>{despachoInfo.logo ? <img src={despachoInfo.logo} alt={despachoInfo.initials} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => { const t = e.currentTarget; t.style.display='none'; if(t.parentElement) { t.parentElement.style.backgroundColor = despachoInfo.color; t.parentElement.textContent = despachoInfo.initials; }}} /> : despachoInfo.initials}</span>
                          ) : (
                            <BuildingOfficeIcon style={{ width: '1.1rem', height: '1.1rem', color: 'var(--secondary)', flexShrink: 0 }} />
                          )}
                          <span style={{ fontSize: '0.9rem', color: 'var(--foreground)' }}>{selectedProspect.company}</span>
                        </div>)}
                        {selectedProspect.linkedinUrl && (<div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}><svg style={{ width: '1.1rem', height: '1.1rem', flexShrink: 0 }} viewBox="0 0 24 24" fill="var(--secondary)"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg><a href={selectedProspect.linkedinUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.9rem', color: '#6366f1', textDecoration: 'none' }}>Ver perfil de LinkedIn</a></div>)}
                        {!selectedProspect.email && !selectedProspect.phone && !selectedProspect.company && (<span style={{ fontSize: '0.85rem', color: 'var(--secondary)', fontStyle: 'italic' }}>Sin datos de contacto registrados</span>)}
                      </div>
                    </div>

                    {/* Lead Source */}
                    {selectedProspect.leadSource && (
                      <div>
                        <h3 style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>Origen del Lead</h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}><TagIcon style={{ width: '1.1rem', height: '1.1rem', color: 'var(--secondary)', flexShrink: 0 }} /><span style={{ fontSize: '0.9rem', color: 'var(--foreground)' }}>{selectedProspect.leadSource}</span></div>
                      </div>
                    )}

                    {/* Notes */}
                    {selectedProspect.notes && (
                      <div>
                        <h3 style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>Notas</h3>
                        <div style={{ padding: '1rem', backgroundColor: 'var(--background)', borderRadius: '0.5rem', border: '1px solid var(--border)', fontSize: '0.875rem', color: 'var(--foreground)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                          <ChatBubbleLeftIcon style={{ width: '1rem', height: '1rem', color: 'var(--secondary)', marginBottom: '0.5rem' }} />
                          <div>{selectedProspect.notes}</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* RIGHT COLUMN */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
                    {/* Key Dates */}
                    <div>
                      <h3 style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>Fechas Clave</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}><CalendarIcon style={{ width: '1.1rem', height: '1.1rem', color: 'var(--secondary)', flexShrink: 0 }} /><span style={{ fontSize: '0.85rem', color: 'var(--secondary)' }}>Creado:</span><span style={{ fontSize: '0.9rem', color: 'var(--foreground)' }}>{formatDate(selectedProspect.createdAt) || 'N/A'}</span></div>
                        {selectedProspect.nextContactDate && (<div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}><CalendarIcon style={{ width: '1.1rem', height: '1.1rem', color: '#f59e0b', flexShrink: 0 }} /><span style={{ fontSize: '0.85rem', color: 'var(--secondary)' }}>Proximo contacto:</span><span style={{ fontSize: '0.9rem', color: 'var(--foreground)' }}>{formatDate(selectedProspect.nextContactDate)}</span></div>)}
                        {selectedProspect.scheduledDemoDate && (<div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}><CalendarIcon style={{ width: '1.1rem', height: '1.1rem', color: '#3b82f6', flexShrink: 0 }} /><span style={{ fontSize: '0.85rem', color: 'var(--secondary)' }}>Demo programada:</span><span style={{ fontSize: '0.9rem', color: 'var(--foreground)' }}>{formatDate(selectedProspect.scheduledDemoDate)}</span></div>)}
                      </div>
                    </div>

                    {/* Financial */}
                    {(selectedProspect.potentialValue || selectedProspect.accountValue || selectedProspect.brandCount) && (
                      <div>
                        <h3 style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>Datos Comerciales</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
                          {selectedProspect.potentialValue != null && (<div style={{ padding: '0.75rem', backgroundColor: 'var(--background)', borderRadius: '0.5rem', border: '1px solid var(--border)' }}><div style={{ fontSize: '0.7rem', color: 'var(--secondary)', marginBottom: '0.25rem' }}>Valor Potencial</div><div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#22c55e' }}>{'$' + selectedProspect.potentialValue.toLocaleString()}</div></div>)}
                          {selectedProspect.accountValue != null && (<div style={{ padding: '0.75rem', backgroundColor: 'var(--background)', borderRadius: '0.5rem', border: '1px solid var(--border)' }}><div style={{ fontSize: '0.7rem', color: 'var(--secondary)', marginBottom: '0.25rem' }}>Valor de Cuenta</div><div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#3b82f6' }}>{'$' + selectedProspect.accountValue.toLocaleString()}</div></div>)}
                          {selectedProspect.brandCount != null && (<div style={{ padding: '0.75rem', backgroundColor: 'var(--background)', borderRadius: '0.5rem', border: '1px solid var(--border)' }}><div style={{ fontSize: '0.7rem', color: 'var(--secondary)', marginBottom: '0.25rem' }}>Marcas</div><div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#8b5cf6' }}>{selectedProspect.brandCount}</div></div>)}
                        </div>
                      </div>
                    )}

                    {/* History Timeline */}
                    {selectedProspect.history && selectedProspect.history.length > 0 && (
                      <div>
                        <h3 style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>Historial de Etapas</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {selectedProspect.history.map((entry, idx) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', backgroundColor: idx === 0 ? getStageColor(entry.stage) + '10' : 'transparent', borderRadius: '0.375rem', borderLeft: '3px solid ' + getStageColor(entry.stage) }}>
                              <div style={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', backgroundColor: getStageColor(entry.stage), flexShrink: 0 }} />
                              <div style={{ flex: 1, minWidth: 0 }}><span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--foreground)' }}>{entry.stage}</span></div>
                              <span style={{ fontSize: '0.75rem', color: 'var(--secondary)', flexShrink: 0 }}>{formatDate(entry.date)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Objectives Tab */}
              {activeTab === 'objectives' && (<div style={{ padding: '2rem', color: 'var(--secondary)', fontSize: '0.9rem' }}><div style={{ textAlign: 'center', padding: '3rem 0' }}><FlagIcon style={{ width: '2.5rem', height: '2.5rem', color: 'var(--border)', margin: '0 auto 1rem' }} /><p style={{ fontWeight: '500' }}>Objectives coming soon</p><p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>This section will track prospect-specific goals and milestones.</p></div></div>)}

              {/* Documents Tab */}
              {activeTab === 'documents' && (<div style={{ padding: '2rem', color: 'var(--secondary)', fontSize: '0.9rem' }}><div style={{ textAlign: 'center', padding: '3rem 0' }}><DocumentTextIcon style={{ width: '2.5rem', height: '2.5rem', color: 'var(--border)', margin: '0 auto 1rem' }} /><p style={{ fontWeight: '500' }}>Documents coming soon</p><p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>Proposals, contracts and files will appear here.</p></div></div>)}

              {/* Reviews Tab */}
              {activeTab === 'reviews' && (<div style={{ padding: '2rem', color: 'var(--secondary)', fontSize: '0.9rem' }}><div style={{ textAlign: 'center', padding: '3rem 0' }}><StarIcon style={{ width: '2.5rem', height: '2.5rem', color: 'var(--border)', margin: '0 auto 1rem' }} /><p style={{ fontWeight: '500' }}>Reviews coming soon</p><p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>Notes and reviews about this prospect will be shown here.</p></div></div>)}

            {/* Edit Contact Modal */}
            {editingContact && (
              <>
                <div onClick={() => setEditingContact(false)} style={{
                  position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1200
                }} />
                <div style={{
                  position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                  backgroundColor: 'var(--surface)', borderRadius: '1rem',
                  border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                  zIndex: 1300, width: '480px', maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto',
                  fontFamily: 'var(--font-sans)'
                }}>
                  <div style={{
                    padding: '1.5rem 2rem', borderBottom: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: 'var(--foreground)' }}>
                      Editar Contacto
                    </h3>
                    <button onClick={() => setEditingContact(false)} style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem',
                      color: 'var(--secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <XMarkIcon style={{ width: '1.25rem', height: '1.25rem' }} />
                    </button>
                  </div>
                  <div style={{ padding: '1.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', fontWeight: '600', color: 'var(--secondary)', marginBottom: '0.5rem' }}>
                        <EnvelopeIcon style={{ width: '1rem', height: '1rem' }} /> Correo electrónico
                      </label>
                      <input type="email" value={editContactForm.email}
                        onChange={(e) => setEditContactForm({ ...editContactForm, email: e.target.value })}
                        placeholder="correo@ejemplo.com"
                        style={{
                          width: '100%', padding: '0.65rem 0.85rem', fontSize: '0.9rem',
                          border: '1px solid var(--border)', borderRadius: '0.5rem',
                          backgroundColor: 'var(--background)', color: 'var(--foreground)',
                          outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box'
                        }} />
                    </div>
                    <div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', fontWeight: '600', color: 'var(--secondary)', marginBottom: '0.5rem' }}>
                        <PhoneIcon style={{ width: '1rem', height: '1rem' }} /> Teléfono
                      </label>
                      <input type="tel" value={editContactForm.phone}
                        onChange={(e) => setEditContactForm({ ...editContactForm, phone: e.target.value })}
                        placeholder="+52 55 1234 5678"
                        style={{
                          width: '100%', padding: '0.65rem 0.85rem', fontSize: '0.9rem',
                          border: '1px solid var(--border)', borderRadius: '0.5rem',
                          backgroundColor: 'var(--background)', color: 'var(--foreground)',
                          outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box'
                        }} />
                    </div>
                    <div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', fontWeight: '600', color: 'var(--secondary)', marginBottom: '0.5rem' }}>
                        <svg style={{ width: '1rem', height: '1rem' }} viewBox="0 0 24 24" fill="var(--secondary)"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                        URL de LinkedIn
                      </label>
                      <input type="url" value={editContactForm.linkedinUrl}
                        onChange={(e) => setEditContactForm({ ...editContactForm, linkedinUrl: e.target.value })}
                        placeholder="https://linkedin.com/in/usuario"
                        style={{
                          width: '100%', padding: '0.65rem 0.85rem', fontSize: '0.9rem',
                          border: '1px solid var(--border)', borderRadius: '0.5rem',
                          backgroundColor: 'var(--background)', color: 'var(--foreground)',
                          outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box'
                        }} />
                    </div>
                    <div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', fontWeight: '600', color: 'var(--secondary)', marginBottom: '0.5rem' }}>
                        <TagIcon style={{ width: '1rem', height: '1rem' }} /> Origen del Lead
                      </label>
                      <input type="text" value={editContactForm.leadSource}
                        onChange={(e) => setEditContactForm({ ...editContactForm, leadSource: e.target.value })}
                        placeholder="LinkedIn, Referido, Web, etc."
                        style={{
                          width: '100%', padding: '0.65rem 0.85rem', fontSize: '0.9rem',
                          border: '1px solid var(--border)', borderRadius: '0.5rem',
                          backgroundColor: 'var(--background)', color: 'var(--foreground)',
                          outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box'
                        }} />
                    </div>
                  </div>
                  <div style={{
                    padding: '1rem 2rem 1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem',
                    borderTop: '1px solid var(--border)'
                  }}>
                    <button onClick={() => setEditingContact(false)} style={{
                      padding: '0.6rem 1.25rem', backgroundColor: 'transparent',
                      color: 'var(--secondary)', border: '1px solid var(--border)',
                      borderRadius: '0.5rem', fontSize: '0.85rem', fontWeight: '500',
                      cursor: 'pointer', fontFamily: 'inherit'
                    }}>Cancelar</button>
                    <button
                      disabled={savingContact}
                      onClick={async () => {
                        if (!selectedProspect) return;
                        setSavingContact(true);
                        try {
                          const updates: Partial<Target> = {
                            email: editContactForm.email.trim(),
                            phone: editContactForm.phone.trim(),
                            linkedinUrl: editContactForm.linkedinUrl.trim() || undefined,
                            leadSource: editContactForm.leadSource.trim() || undefined
                          };
                          if (selectedProspect.createdBy === 'representative') {
                            const newId = await createTarget({
                              name: selectedProspect.name,
                              company: selectedProspect.company || '',
                              email: updates.email || '',
                              phone: updates.phone || '',
                              notes: '',
                              brandCount: selectedProspect.brandCount,
                              linkedinUrl: updates.linkedinUrl,
                              leadSource: updates.leadSource
                            });
                            setSelectedProspect({
                              ...selectedProspect,
                              id: newId,
                              email: updates.email || '',
                              phone: updates.phone || '',
                              linkedinUrl: updates.linkedinUrl,
                              leadSource: updates.leadSource,
                              createdBy: 'system'
                            });
                          } else {
                            await updateTarget(selectedProspect.id, updates);
                            setSelectedProspect({
                              ...selectedProspect,
                              email: updates.email || '',
                              phone: updates.phone || '',
                              linkedinUrl: updates.linkedinUrl,
                              leadSource: updates.leadSource
                            });
                          }
                          setEditingContact(false);
                        } catch (err) {
                          console.error('Error updating contact:', err);
                          alert('Error al guardar. Intenta de nuevo.');
                        } finally {
                          setSavingContact(false);
                        }
                      }}
                      style={{
                        padding: '0.6rem 1.5rem', backgroundColor: '#6366f1',
                        color: '#fff', border: 'none', borderRadius: '0.5rem',
                        fontSize: '0.85rem', fontWeight: '600',
                        cursor: savingContact ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit', opacity: savingContact ? 0.7 : 1
                      }}>{savingContact ? 'Guardando...' : 'Guardar Cambios'}</button>
                  </div>
                </div>
              </>
            )}
            </>
          );
        })()}
      </div>
    </ProtectedRoute>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowTopRightOnSquareIcon,
  BellIcon,
  BriefcaseIcon,
  BuildingOfficeIcon,
  CalendarIcon,
  CameraIcon,
  ChartBarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  DocumentArrowDownIcon,
  EllipsisVerticalIcon,
  EnvelopeIcon,
  HomeIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  PencilIcon,
  PhoneIcon,
  PlusCircleIcon,
  UserIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import ProtectedRoute from '@/components/ProtectedRoute';
import ScrapeIMPIButton from '@/components/ScrapeIMPIButton';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeToDespachos, Despacho } from '@/services/despachoService';
import { subscribeToRepresentatives, Representative } from '@/services/representativeService';
import { createTarget, subscribeToTargets, Target, updateTarget } from '@/services/targetService';
import styles from './target.module.css';

const PAGE_SIZE = 20;

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
] as const;

const CLIENT_STATUSES = [
  { value: 'Potencial', label: 'Potencial', color: '#7c3aed', emoji: '🟣', description: 'Prospecto nuevo, sin contacto aún' },
  { value: 'Contactado', label: 'Contactado', color: '#475569', emoji: '📞', description: 'Ya se hizo primer contacto' },
  { value: 'Interesado', label: 'Interesado', color: '#2563eb', emoji: '👍', description: 'Mostró interés en el servicio' },
  { value: 'En negociación', label: 'En negociación', color: '#d97706', emoji: '🤝', description: 'Negociación activa, cerca de cerrar' },
  { value: 'Cliente activo', label: 'Cliente activo', color: '#16a34a', emoji: '✅', description: 'Cliente que ya contrató' },
  { value: 'No interesado', label: 'No interesado', color: '#6b7280', emoji: '🚫', description: 'Dijo que no, pero sin mala actitud' },
  { value: 'Grosero/Hostil', label: 'Grosero/Hostil', color: '#dc2626', emoji: '⚠️', description: 'Mala experiencia, evitar contacto' },
  { value: 'Ex-cliente', label: 'Ex-cliente', color: '#ea580c', emoji: '🔄', description: 'Fue cliente pero se bajó' },
  { value: 'Descartado', label: 'Descartado', color: '#94a3b8', emoji: '❌', description: 'No vale la pena seguir' },
] as const;

const HIDDEN_STATUSES = ['No interesado', 'Grosero/Hostil', 'Descartado'];

const PIPELINE_STEPS = [
  { label: 'Contactado', stages: ['1er Contacto', 'Contacto efectivo'] },
  { label: 'Interesado', stages: ['Muestra de interés'] },
  { label: 'Demo', stages: ['Cita para demo', 'Demo realizada'] },
  { label: 'Propuesta', stages: ['Propuesta'] },
  { label: 'Cierre', stages: ['Venta'] },
] as const;

type SortField = 'name' | 'brandCount' | 'none';
type SortDirection = 'asc' | 'desc';

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function getStageColor(stage: string) {
  const colors: Record<string, string> = {
    'Detección de prospecto': '#6366f1',
    '1er Contacto': '#8b5cf6',
    'Contacto efectivo': '#a855f7',
    'Muestra de interés': '#ec4899',
    'Cita para demo': '#3b82f6',
    'Demo realizada': '#0ea5e9',
    'Venta': '#16a34a',
    'En Pausa': '#f59e0b',
    'Basura': '#6b7280',
    'Cliente Perdido': '#ef4444',
  };
  return colors[stage] || '#64748b';
}

function getPipelineIndex(stage: string) {
  const stepIndex = PIPELINE_STEPS.findIndex((step) => step.stages.some((item) => item === stage));
  if (stage === 'Detección de prospecto') return -1;
  return stepIndex;
}

function formatDate(date?: Date) {
  if (!date) return null;
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export default function TargetPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [targets, setTargets] = useState<Target[]>([]);
  const [representatives, setRepresentatives] = useState<Representative[]>([]);
  const [firestoreDespachos, setFirestoreDespachos] = useState<Despacho[]>([]);
  const [loadingTargets, setLoadingTargets] = useState(true);
  const [loadingRepresentatives, setLoadingRepresentatives] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [hideDiscarded, setHideDiscarded] = useState(true);
  const [sortField, setSortField] = useState<SortField>('none');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showFullProfile, setShowFullProfile] = useState(false);
  const [editingContact, setEditingContact] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [editContactForm, setEditContactForm] = useState({ email: '', phone: '', linkedinUrl: '', leadSource: '' });
  const [despachoDropdownOpen, setDespachoDropdownOpen] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [customDespacho, setCustomDespacho] = useState('');
  const [showPhotoInput, setShowPhotoInput] = useState(false);
  const [photoUrlInput, setPhotoUrlInput] = useState('');
  const despachoRef = useRef<HTMLDivElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    return subscribeToTargets((data) => {
      setTargets(data);
      setLoadingTargets(false);
    });
  }, [user]);

  useEffect(() => subscribeToRepresentatives((data) => {
    setRepresentatives(data);
    setLoadingRepresentatives(false);
  }), []);

  useEffect(() => subscribeToDespachos(setFirestoreDespachos), []);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (despachoRef.current && !despachoRef.current.contains(event.target as Node)) setDespachoDropdownOpen(false);
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) setStatusDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const availableDespachos = useMemo(() => {
    const byName = new Map<string, { name: string; color: string; initials: string; logo: string }>();
    DESPACHOS.forEach((despacho) => byName.set(despacho.name.toLocaleLowerCase('es'), { ...despacho }));
    firestoreDespachos.forEach((despacho) => {
      const key = despacho.nombre.toLocaleLowerCase('es');
      const existing = byName.get(key);
      byName.set(key, {
        name: despacho.nombre,
        color: despacho.color || existing?.color || '#64748b',
        initials: despacho.initials || existing?.initials || getInitials(despacho.nombre),
        logo: despacho.logoUrl || existing?.logo || '',
      });
    });
    return Array.from(byName.values());
  }, [firestoreDespachos]);

  const allTargets = useMemo(() => {
    const byName = new Map<string, Target>();
    targets.forEach((target) => byName.set(target.name.toLocaleLowerCase('es').trim(), target));
    representatives.forEach((representative) => {
      const key = representative.name.toLocaleLowerCase('es').trim();
      const existing = byName.get(key);
      if (existing) {
        byName.set(key, {
          ...existing,
          brandCount: existing.brandCount !== undefined ? existing.brandCount : representative.brandCount,
        });
      } else {
        byName.set(key, {
          id: representative.id,
          name: representative.name,
          company: '',
          email: '',
          phone: '',
          notes: '',
          stage: '',
          createdAt: representative.createdAt || new Date(),
          createdBy: 'representative',
          history: [],
          brandCount: representative.brandCount,
        });
      }
    });
    return Array.from(byName.values());
  }, [targets, representatives]);

  const filteredTargets = useMemo(() => {
    let items = [...allTargets];
    const term = searchTerm.trim().toLocaleLowerCase('es');
    if (term) {
      items = items.filter((target) =>
        target.name.toLocaleLowerCase('es').includes(term)
        || target.company?.toLocaleLowerCase('es').includes(term)
        || target.email?.toLocaleLowerCase('es').includes(term)
      );
    }
    if (statusFilter !== 'all') items = items.filter((target) => target.clientStatus === statusFilter);
    if (hideDiscarded) items = items.filter((target) => !HIDDEN_STATUSES.includes(target.clientStatus || ''));
    if (sortField === 'name') {
      items.sort((a, b) => a.name.localeCompare(b.name, 'es') * (sortDirection === 'asc' ? 1 : -1));
    }
    if (sortField === 'brandCount') {
      items.sort((a, b) => ((a.brandCount || 0) - (b.brandCount || 0)) * (sortDirection === 'asc' ? 1 : -1));
    }
    return items;
  }, [allTargets, searchTerm, statusFilter, hideDiscarded, sortField, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(filteredTargets.length / PAGE_SIZE));
  const pageTargets = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredTargets.slice(start, start + PAGE_SIZE);
  }, [filteredTargets, currentPage]);
  const selectedTarget = useMemo(
    () => allTargets.find((target) => target.id === selectedId) || null,
    [allTargets, selectedId]
  );

  useEffect(() => setCurrentPage(1), [searchTerm, statusFilter, hideDiscarded]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    if (loadingTargets || loadingRepresentatives) return;
    if (pageTargets.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!pageTargets.some((target) => target.id === selectedId)) setSelectedId(pageTargets[0].id);
  }, [loadingTargets, loadingRepresentatives, pageTargets, selectedId]);

  useEffect(() => {
    setShowFullProfile(false);
    setDespachoDropdownOpen(false);
    setStatusDropdownOpen(false);
    setShowPhotoInput(false);
    if (selectedTarget) {
      setEditContactForm({
        email: selectedTarget.email || '',
        phone: selectedTarget.phone || '',
        linkedinUrl: selectedTarget.linkedinUrl || '',
        leadSource: selectedTarget.leadSource || '',
      });
    }
  }, [selectedTarget]);

  const getDespachoInfo = (companyName?: string, ownLogoUrl?: string) => {
    if (!companyName?.trim() && !ownLogoUrl) return null;
    const found = availableDespachos.find((despacho) => despacho.name.toLocaleLowerCase('es') === companyName?.toLocaleLowerCase('es'));
    if (found) return { ...found, logo: found.logo || ownLogoUrl || '' };
    const name = companyName || '';
    return { name, color: '#64748b', initials: getInitials(name), logo: ownLogoUrl || '' };
  };

  const getClientStatusInfo = (status?: string) => CLIENT_STATUSES.find((item) => item.value === status) || null;

  const handleSort = (field: SortField) => {
    if (sortField !== field) {
      setSortField(field);
      setSortDirection('asc');
      return;
    }
    if (sortDirection === 'asc') setSortDirection('desc');
    else {
      setSortField('none');
      setSortDirection('asc');
    }
  };

  const handleExportCSV = () => {
    const rows = filteredTargets.filter((target) => target.email?.trim());
    if (rows.length === 0) {
      alert('No hay contactos con correo disponible.');
      return;
    }
    const csv = ['Nombre,Correo', ...rows.map((target) => `${target.name.replace(/,/g, ' ')},${target.email.replace(/,/g, ' ')}`)].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'contactos_target.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const createFromRepresentative = async (updates: Partial<Target>) => {
    if (!selectedTarget) throw new Error('No target selected');
    return createTarget({
      name: selectedTarget.name,
      company: selectedTarget.company || '',
      email: selectedTarget.email || '',
      phone: selectedTarget.phone || '',
      notes: selectedTarget.notes || '',
      brandCount: selectedTarget.brandCount,
      ...updates,
    });
  };

  const handleDespachoSelect = async (company: string) => {
    if (!selectedTarget || !company.trim()) return;
    try {
      if (selectedTarget.createdBy === 'representative') setSelectedId(await createFromRepresentative({ company }));
      else await updateTarget(selectedTarget.id, { company });
      setDespachoDropdownOpen(false);
      setCustomDespacho('');
    } catch (error) {
      console.error('Error updating despacho:', error);
      alert('No fue posible asignar el despacho.');
    }
  };

  const handleStatusChange = async (clientStatus: string) => {
    if (!selectedTarget) return;
    try {
      if (selectedTarget.createdBy === 'representative') setSelectedId(await createFromRepresentative({ clientStatus }));
      else await updateTarget(selectedTarget.id, { clientStatus });
      setStatusDropdownOpen(false);
    } catch (error) {
      console.error('Error updating status:', error);
      alert('No fue posible cambiar el estatus.');
    }
  };

  const handlePhotoSave = async () => {
    if (!selectedTarget || !photoUrlInput.trim()) return;
    try {
      if (selectedTarget.createdBy === 'representative') setSelectedId(await createFromRepresentative({ photoUrl: photoUrlInput.trim() }));
      else await updateTarget(selectedTarget.id, { photoUrl: photoUrlInput.trim() });
      setShowPhotoInput(false);
    } catch (error) {
      console.error('Error updating photo:', error);
      alert('No fue posible guardar la foto.');
    }
  };

  const handleContactSave = async () => {
    if (!selectedTarget) return;
    setSavingContact(true);
    const updates: Partial<Target> = {
      email: editContactForm.email.trim(),
      phone: editContactForm.phone.trim(),
      linkedinUrl: editContactForm.linkedinUrl.trim() || undefined,
      leadSource: editContactForm.leadSource.trim() || undefined,
    };
    try {
      if (selectedTarget.createdBy === 'representative') setSelectedId(await createFromRepresentative(updates));
      else await updateTarget(selectedTarget.id, updates);
      setEditingContact(false);
    } catch (error) {
      console.error('Error updating contact:', error);
      alert('No fue posible guardar los cambios.');
    } finally {
      setSavingContact(false);
    }
  };

  const selectedDespacho = selectedTarget ? getDespachoInfo(selectedTarget.company, selectedTarget.logoUrl) : null;
  const pipelineIndex = selectedTarget ? getPipelineIndex(selectedTarget.stage) : -1;
  const nextAction = selectedTarget?.scheduledDemoDate
    ? { title: 'Realizar demo programada', date: formatDate(selectedTarget.scheduledDemoDate) }
    : selectedTarget?.nextContactDate
      ? { title: 'Dar seguimiento al contacto', date: formatDate(selectedTarget.nextContactDate) }
      : selectedTarget?.stage === 'Venta'
        ? { title: 'Dar seguimiento al cliente', date: 'Sin fecha asignada' }
        : { title: 'Continuar seguimiento comercial', date: 'Sin fecha asignada' };
  const loading = loadingTargets || loadingRepresentatives;
  const firstResult = filteredTargets.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const lastResult = Math.min(currentPage * PAGE_SIZE, filteredTargets.length);
  const visiblePages = Array.from({ length: Math.min(5, totalPages) }, (_, index) => {
    if (totalPages <= 5) return index + 1;
    const start = Math.min(Math.max(currentPage - 2, 1), totalPages - 4);
    return start + index;
  });

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronUpIcon className={styles.sortIconMuted} aria-hidden="true" />;
    return sortDirection === 'asc'
      ? <ChevronUpIcon className={styles.sortIcon} aria-hidden="true" />
      : <ChevronDownIcon className={styles.sortIcon} aria-hidden="true" />;
  };

  return (
    <ProtectedRoute>
      <div className={styles.shell}>
        <aside className={styles.rail} aria-label="Navegación principal">
          <button className={styles.brandMark} onClick={() => router.push('/dashboard')} aria-label="Ir al dashboard">C</button>
          <nav className={styles.railNav}>
            <button onClick={() => router.push('/dashboard')} title="Dashboard"><HomeIcon /></button>
            <button className={styles.railActive} aria-current="page" title="Targets"><span className={styles.targetGlyph}>◎</span></button>
            <button onClick={() => router.push('/despachos-empresas')} title="Despachos"><BriefcaseIcon /></button>
            <button onClick={() => router.push('/seguimiento')} title="Seguimiento"><ClipboardDocumentListIcon /></button>
            <button onClick={() => router.push('/kpis')} title="Indicadores"><ChartBarIcon /></button>
          </nav>
          <div className={styles.railBottom}>
            <button title="Notificaciones"><BellIcon /></button>
            <button onClick={() => router.push('/perfil')} title="Configuración"><Cog6ToothIcon /></button>
            <div className={styles.userBadge}>{getInitials(user?.displayName || user?.email || 'CA')}</div>
          </div>
        </aside>

        <main className={styles.workspace}>
          <header className={styles.topbar}>
            <div className={styles.titleGroup}>
              <button className={styles.mobileBack} onClick={() => router.back()} aria-label="Volver"><ArrowLeftIcon /></button>
              <div>
                <h1>Targets</h1>
                <p>Lista de clientes potenciales</p>
              </div>
            </div>
            <div className={styles.topActions}>
              <button className={styles.secondaryAction} onClick={handleExportCSV}>
                <DocumentArrowDownIcon /> Exportar CSV
              </button>
              <ScrapeIMPIButton variant="toolbar" />
              <button className={styles.secondaryAction} onClick={() => router.push('/despachos-empresas')}>
                <BuildingOfficeIcon /> Despachos
              </button>
            </div>
          </header>

          <section className={styles.contentGrid}>
            <section className={styles.listPane} aria-label="Lista de targets">
              <div className={styles.searchWrap}>
                <MagnifyingGlassIcon aria-hidden="true" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar cliente por nombre, despacho o correo..."
                  aria-label="Buscar targets"
                />
                {searchTerm && <button onClick={() => setSearchTerm('')} aria-label="Limpiar búsqueda"><XMarkIcon /></button>}
              </div>

              <div className={styles.filterBar} aria-label="Filtros de estatus">
                <button
                  className={statusFilter === 'all' && !hideDiscarded ? styles.filterActive : ''}
                  onClick={() => { setStatusFilter('all'); setHideDiscarded(false); }}
                >Todos</button>
                <button
                  className={statusFilter === 'all' && hideDiscarded ? styles.filterActive : ''}
                  onClick={() => { setStatusFilter('all'); setHideDiscarded(true); }}
                >Activos</button>
                {CLIENT_STATUSES.map((status) => (
                  <button
                    key={status.value}
                    className={statusFilter === status.value ? styles.filterSelected : ''}
                    style={statusFilter === status.value ? { color: status.color, borderColor: `${status.color}66`, backgroundColor: `${status.color}0d` } : undefined}
                    onClick={() => { setStatusFilter(status.value); setHideDiscarded(false); }}
                  ><span aria-hidden="true">{status.emoji}</span>{status.label}</button>
                ))}
              </div>

              <div className={styles.table}>
                <div className={styles.tableHeader}>
                  <button onClick={() => handleSort('name')}>Nombre del cliente <SortIcon field="name" /></button>
                  <span>Despacho / Empresa</span>
                  <span>Etapa CRM</span>
                  <button className={styles.alignRight} onClick={() => handleSort('brandCount')}>Marcas <SortIcon field="brandCount" /></button>
                </div>

                {loading && <div className={styles.emptyState}>Cargando clientes…</div>}
                {!loading && pageTargets.length === 0 && (
                  <div className={styles.emptyState}>{searchTerm ? 'No encontramos targets con esa búsqueda.' : 'No hay targets para este filtro.'}</div>
                )}
                {!loading && pageTargets.map((target) => {
                  const despacho = getDespachoInfo(target.company, target.logoUrl);
                  const selected = target.id === selectedId;
                  return (
                    <button
                      key={target.id}
                      className={`${styles.tableRow} ${selected ? styles.tableRowSelected : ''}`}
                      onClick={() => setSelectedId(target.id)}
                      aria-pressed={selected}
                    >
                      <span className={styles.clientCell}>
                        <span
                          className={styles.avatarSmall}
                          style={target.photoUrl ? { backgroundImage: `url(${JSON.stringify(target.photoUrl).slice(1, -1)})` } : undefined}
                          aria-hidden="true"
                        >{!target.photoUrl && getInitials(target.name)}</span>
                        <span className={styles.clientName}>{target.name}</span>
                      </span>
                      <span className={styles.companyCell}>
                        {despacho ? <><span className={styles.companyMark}>{despacho.initials}</span><span>{despacho.name}</span></> : <span className={styles.muted}>—</span>}
                      </span>
                      <span className={styles.stageCell}>
                        {target.stage ? <span className={styles.stageBadge} style={{ color: getStageColor(target.stage), backgroundColor: `${getStageColor(target.stage)}10`, borderColor: `${getStageColor(target.stage)}33` }}>{target.stage}</span> : <span className={styles.muted}>—</span>}
                      </span>
                      <span className={`${styles.brandCell} ${(target.brandCount || 0) > 0 ? styles.brandCellPopulated : ''}`}>
                        {(target.brandCount || 0).toLocaleString('es-MX')}{(target.brandCount || 0) > 0 ? ' marcas' : ''}
                      </span>
                    </button>
                  );
                })}
              </div>

              <footer className={styles.pagination}>
                <span>Mostrando {firstResult}–{lastResult} de {filteredTargets.length.toLocaleString('es-MX')} clientes</span>
                <div className={styles.pageControls}>
                  <button disabled={currentPage === 1} onClick={() => setCurrentPage((page) => page - 1)} aria-label="Página anterior"><ChevronLeftIcon /></button>
                  {visiblePages.map((page) => <button key={page} className={page === currentPage ? styles.pageActive : ''} onClick={() => setCurrentPage(page)}>{page}</button>)}
                  <button disabled={currentPage === totalPages} onClick={() => setCurrentPage((page) => page + 1)} aria-label="Página siguiente"><ChevronRightIcon /></button>
                </div>
              </footer>
            </section>

            <aside className={styles.detailPane} aria-label="Detalle del target seleccionado">
              {!selectedTarget ? (
                <div className={styles.detailEmpty}><UserIcon /><h2>Selecciona un target</h2><p>Consulta aquí su información, cartera y avance comercial.</p></div>
              ) : (
                <>
                  <div className={styles.detailHeader}>
                    <div className={styles.avatarWrap}>
                      <button
                        className={styles.avatarLarge}
                        onClick={() => { setShowPhotoInput((open) => !open); setPhotoUrlInput(selectedTarget.photoUrl || ''); }}
                        style={selectedTarget.photoUrl ? { backgroundImage: `url(${JSON.stringify(selectedTarget.photoUrl).slice(1, -1)})` } : undefined}
                        aria-label="Editar foto del contacto"
                      >{!selectedTarget.photoUrl && getInitials(selectedTarget.name)}<span><CameraIcon /></span></button>
                      <i className={styles.onlineDot} aria-hidden="true" />
                      {showPhotoInput && (
                        <div className={styles.photoPopover}>
                          <label htmlFor="target-photo">URL de la foto</label>
                          <input id="target-photo" value={photoUrlInput} onChange={(event) => setPhotoUrlInput(event.target.value)} placeholder="https://…" />
                          <div><button onClick={() => setShowPhotoInput(false)}>Cancelar</button><button className={styles.primaryMini} onClick={handlePhotoSave}>Guardar</button></div>
                        </div>
                      )}
                    </div>

                    <div className={styles.identity}>
                      <div className={styles.identityTop}>
                        <h2>{selectedTarget.name}</h2>
                        <button className={styles.iconButton} aria-label="Más acciones"><EllipsisVerticalIcon /></button>
                      </div>
                      <div ref={despachoRef} className={styles.companyPicker}>
                        <button onClick={() => setDespachoDropdownOpen((open) => !open)}>
                          <span className={styles.companyMark}>{selectedDespacho?.initials || '—'}</span>
                          <span>{selectedDespacho?.name || 'Asignar despacho'}</span>
                          <ChevronDownIcon />
                        </button>
                        {despachoDropdownOpen && (
                          <div className={styles.dropdown}>
                            <div className={styles.dropdownSearch}><MagnifyingGlassIcon /><input autoFocus value={customDespacho} onChange={(event) => setCustomDespacho(event.target.value)} placeholder="Buscar o crear despacho…" /></div>
                            <div className={styles.dropdownList}>
                              {availableDespachos.filter((item) => !customDespacho.trim() || item.name.toLocaleLowerCase('es').includes(customDespacho.toLocaleLowerCase('es'))).map((item) => (
                                <button key={item.name} onClick={() => handleDespachoSelect(item.name)}><span className={styles.companyMark}>{item.initials}</span><span>{item.name}</span>{selectedTarget.company === item.name && <CheckIcon />}</button>
                              ))}
                              {customDespacho.trim() && !availableDespachos.some((item) => item.name.toLocaleLowerCase('es') === customDespacho.trim().toLocaleLowerCase('es')) && (
                                <button onClick={() => handleDespachoSelect(customDespacho.trim())}><PlusCircleIcon /><span>Crear “{customDespacho.trim()}”</span></button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className={styles.identityBadges}>
                        <span className={styles.stageBadge} style={{ color: getStageColor(selectedTarget.stage), backgroundColor: `${getStageColor(selectedTarget.stage)}10`, borderColor: `${getStageColor(selectedTarget.stage)}33` }}>{selectedTarget.stage || 'Sin etapa'}</span>
                        <span className={styles.portfolioBadge}>{(selectedTarget.brandCount || 0).toLocaleString('es-MX')} marcas</span>
                      </div>
                    </div>
                  </div>

                  <section className={styles.detailSection}>
                    <div className={styles.sectionTitle}><h3>Información de contacto</h3><button onClick={() => setEditingContact(true)}><PencilIcon /> Editar</button></div>
                    <div className={styles.contactList}>
                      <div><EnvelopeIcon /><span>{selectedTarget.email || 'Sin correo registrado'}</span></div>
                      <div><PhoneIcon /><span>{selectedTarget.phone || 'Sin teléfono registrado'}</span></div>
                      <div><MapPinIcon /><span>{selectedTarget.city || selectedTarget.state ? [selectedTarget.city, selectedTarget.state].filter(Boolean).join(', ') : 'Ubicación no registrada'}</span></div>
                      <div><CalendarIcon /><span>{selectedTarget.subscriptionStartDate ? `Cliente desde ${formatDate(selectedTarget.subscriptionStartDate)}` : `Registrado el ${formatDate(selectedTarget.createdAt) || '—'}`}</span></div>
                    </div>
                  </section>

                  <section className={styles.detailSection}>
                    <h3>Progreso en el CRM</h3>
                    <div className={styles.pipeline}>
                      {PIPELINE_STEPS.map((step, index) => {
                        const completed = pipelineIndex > index;
                        const active = pipelineIndex === index;
                        const historyEntry = [...(selectedTarget.history || [])].reverse().find((entry) => step.stages.some((stage) => stage === entry.stage));
                        return (
                          <div key={step.label} className={`${styles.pipelineStep} ${completed ? styles.pipelineDone : ''} ${active ? styles.pipelineActive : ''}`}>
                            <div className={styles.pipelineMarker}>{completed ? <CheckIcon /> : active ? <span /> : index + 1}</div>
                            <strong>{step.label}</strong>
                            <small>{formatDate(historyEntry?.date) || '—'}</small>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <section className={styles.detailSection}>
                    <h3>Próxima acción</h3>
                    <div className={styles.nextAction}>
                      <span><CalendarIcon /></span>
                      <div><strong>{nextAction.title}</strong><small>{nextAction.date}</small></div>
                      <button onClick={() => router.push('/seguimiento')}><ArrowRightIcon /></button>
                    </div>
                  </section>

                  {showFullProfile && (
                    <section className={styles.expandedProfile}>
                      <div className={styles.commercialGrid}>
                        <div><span>Cartera</span><strong>{(selectedTarget.brandCount || 0).toLocaleString('es-MX')}</strong></div>
                        <div><span>Valor potencial</span><strong>${(selectedTarget.potentialValue || 0).toLocaleString('en-US')}</strong></div>
                        <div><span>Valor de cuenta</span><strong>${(selectedTarget.accountValue || 0).toLocaleString('en-US')}</strong></div>
                      </div>
                      <div ref={statusDropdownRef} className={styles.statusPicker}>
                        <span>Estatus del cliente</span>
                        <button onClick={() => setStatusDropdownOpen((open) => !open)}>{getClientStatusInfo(selectedTarget.clientStatus)?.emoji || '○'} {getClientStatusInfo(selectedTarget.clientStatus)?.label || 'Asignar estatus'} <ChevronDownIcon /></button>
                        {statusDropdownOpen && <div className={styles.statusMenu}>{CLIENT_STATUSES.map((status) => <button key={status.value} onClick={() => handleStatusChange(status.value)}><span>{status.emoji}</span><div><strong>{status.label}</strong><small>{status.description}</small></div>{selectedTarget.clientStatus === status.value && <CheckIcon />}</button>)}</div>}
                      </div>
                      {selectedTarget.leadSource && <div className={styles.profileBlock}><span>Origen del lead</span><p>{selectedTarget.leadSource}</p></div>}
                      {selectedTarget.notes && <div className={styles.profileBlock}><span>Notas</span><p>{selectedTarget.notes}</p></div>}
                      {selectedTarget.linkedinUrl && <a className={styles.linkedinLink} href={selectedTarget.linkedinUrl} target="_blank" rel="noreferrer">Abrir LinkedIn <ArrowTopRightOnSquareIcon /></a>}
                    </section>
                  )}

                  <footer className={styles.detailActions}>
                    <button className={styles.primaryAction} onClick={() => router.push('/seguimiento')}><PlusCircleIcon /> Registrar actividad</button>
                    <button className={styles.profileAction} onClick={() => setShowFullProfile((open) => !open)}><UserIcon /> {showFullProfile ? 'Ocultar perfil' : 'Ver perfil'}</button>
                  </footer>
                </>
              )}
            </aside>
          </section>
        </main>

        {editingContact && selectedTarget && (
          <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setEditingContact(false); }}>
            <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="edit-contact-title">
              <div className={styles.modalHeader}><div><h2 id="edit-contact-title">Editar contacto</h2><p>{selectedTarget.name}</p></div><button onClick={() => setEditingContact(false)} aria-label="Cerrar"><XMarkIcon /></button></div>
              <div className={styles.modalBody}>
                <label><span><EnvelopeIcon /> Correo electrónico</span><input type="email" value={editContactForm.email} onChange={(event) => setEditContactForm((form) => ({ ...form, email: event.target.value }))} placeholder="correo@ejemplo.com" /></label>
                <label><span><PhoneIcon /> Teléfono</span><input type="tel" value={editContactForm.phone} onChange={(event) => setEditContactForm((form) => ({ ...form, phone: event.target.value }))} placeholder="+52 55 1234 5678" /></label>
                <label><span><ArrowTopRightOnSquareIcon /> URL de LinkedIn</span><input type="url" value={editContactForm.linkedinUrl} onChange={(event) => setEditContactForm((form) => ({ ...form, linkedinUrl: event.target.value }))} placeholder="https://linkedin.com/in/usuario" /></label>
                <label><span><BriefcaseIcon /> Origen del lead</span><input value={editContactForm.leadSource} onChange={(event) => setEditContactForm((form) => ({ ...form, leadSource: event.target.value }))} placeholder="Referido, LinkedIn, Web…" /></label>
              </div>
              <div className={styles.modalFooter}><button onClick={() => setEditingContact(false)}>Cancelar</button><button className={styles.primaryAction} disabled={savingContact} onClick={handleContactSave}>{savingContact ? 'Guardando…' : 'Guardar cambios'}</button></div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}

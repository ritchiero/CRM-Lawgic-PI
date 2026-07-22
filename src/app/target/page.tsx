"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
import {
  getRepresentativeActivityColor,
  getRepresentativeActivityLevel,
  getRepresentativeVerificationLabel,
} from '@/lib/representativeActivity';
import { subscribeToDespachos, updateDespacho, Despacho } from '@/services/despachoService';
import { subscribeToRepresentatives, Representative } from '@/services/representativeService';
import { createTarget, subscribeToTargets, Target, updateTarget } from '@/services/targetService';
import styles from './target.module.css';

const INITIAL_VISIBLE_TARGETS = 40;
const LOAD_MORE_TARGETS = 40;

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
type TargetWithAccount = Target & {
  accountName?: string;
  accountStage?: string;
  accountClientStatus?: string;
  accountClosedAt?: Date;
  accountPrimaryContactName?: string;
};
type DespachoOption = {
  id?: string;
  name: string;
  color: string;
  initials: string;
  logo: string;
  aliases: string[];
};

function normalizeCompany(value?: string) {
  return (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es');
}

function normalizePersonName(value?: string) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9ñÑ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('es');
}

function findAccount(target: Target, despachos: Despacho[]) {
  if (target.despachoId) {
    const byId = despachos.find((despacho) => despacho.id === target.despachoId);
    if (byId) return byId;
  }
  const company = normalizeCompany(target.company);
  if (!company) return null;
  return despachos.find((despacho) =>
    [despacho.nombre, ...(despacho.aliases || [])].some((name) => normalizeCompany(name) === company)
  ) || null;
}

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
  const [navExpanded, setNavExpanded] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [hideDiscarded, setHideDiscarded] = useState(true);
  const [sortField, setSortField] = useState<SortField>('none');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_TARGETS);
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
  const loadMoreRef = useRef<HTMLDivElement>(null);

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
    const byName = new Map<string, DespachoOption>();
    DESPACHOS.forEach((despacho) => byName.set(despacho.name.toLocaleLowerCase('es'), { ...despacho, aliases: [] }));
    firestoreDespachos.forEach((despacho) => {
      const key = despacho.nombre.toLocaleLowerCase('es');
      const existing = byName.get(key);
      byName.set(key, {
        id: despacho.id,
        name: despacho.nombre,
        color: despacho.color || existing?.color || '#64748b',
        initials: despacho.initials || existing?.initials || getInitials(despacho.nombre),
        logo: despacho.logoUrl || existing?.logo || '',
        aliases: despacho.aliases || [],
      });
    });
    return Array.from(byName.values());
  }, [firestoreDespachos]);

  const allTargets = useMemo<TargetWithAccount[]>(() => {
    const byName = new Map<string, TargetWithAccount>();
    targets.forEach((target) => {
      const key = normalizePersonName(target.name);
      if (byName.has(key)) return;
      const account = findAccount(target, firestoreDespachos);
      byName.set(key, {
        ...target,
        accountName: account?.nombre,
        accountStage: account?.accountStage,
        accountClientStatus: account?.clientStatus,
        accountClosedAt: account?.closedAt,
        accountPrimaryContactName: account?.primaryContactName,
      });
    });
    representatives.forEach((representative) => {
      const key = normalizePersonName(representative.name);
      const existing = byName.get(key);
      if (existing) {
        byName.set(key, {
          ...existing,
          brandCount: existing.brandCount !== undefined ? existing.brandCount : representative.brandCount,
          representativeActivityVerified: representative.representativeActivityVerified,
          representativeActivityLevel: representative.representativeActivityLevel,
          representativeActivityVerificationStatus: representative.representativeActivityVerificationStatus,
          representativeActivityCount: representative.representativeActivityCount,
          activityClassificationBasis: representative.activityClassificationBasis,
          impiProfileCount: representative.impiProfileCount,
          impiProfilesProcessed: representative.impiProfilesProcessed,
          impiRawExpedientCount: representative.impiRawExpedientCount,
          impiUniqueExpedientCount: representative.impiUniqueExpedientCount,
          impiVerificationSource: representative.impiVerificationSource,
          impiSourceIndexedAt: representative.impiSourceIndexedAt,
          impiExactAgentQuery: representative.impiExactAgentQuery,
          representativeActivityVerifiedAt: representative.representativeActivityVerifiedAt,
          impiCooldownUntil: representative.impiCooldownUntil,
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
          representativeActivityVerified: representative.representativeActivityVerified,
          representativeActivityLevel: representative.representativeActivityLevel,
          representativeActivityVerificationStatus: representative.representativeActivityVerificationStatus,
          representativeActivityCount: representative.representativeActivityCount,
          activityClassificationBasis: representative.activityClassificationBasis,
          impiProfileCount: representative.impiProfileCount,
          impiProfilesProcessed: representative.impiProfilesProcessed,
          impiRawExpedientCount: representative.impiRawExpedientCount,
          impiUniqueExpedientCount: representative.impiUniqueExpedientCount,
          impiVerificationSource: representative.impiVerificationSource,
          impiSourceIndexedAt: representative.impiSourceIndexedAt,
          impiExactAgentQuery: representative.impiExactAgentQuery,
          representativeActivityVerifiedAt: representative.representativeActivityVerifiedAt,
          impiCooldownUntil: representative.impiCooldownUntil,
        });
      }
    });
    return Array.from(byName.values());
  }, [targets, representatives, firestoreDespachos]);

  const filteredTargets = useMemo(() => {
    let items = [...allTargets];
    const term = searchTerm.trim().toLocaleLowerCase('es');
    if (term) {
      items = items.filter((target) =>
        target.name.toLocaleLowerCase('es').includes(term)
        || target.company?.toLocaleLowerCase('es').includes(term)
        || target.accountName?.toLocaleLowerCase('es').includes(term)
        || target.email?.toLocaleLowerCase('es').includes(term)
      );
    }
    if (statusFilter !== 'all') items = items.filter((target) => (target.accountClientStatus || target.clientStatus) === statusFilter);
    if (hideDiscarded) items = items.filter((target) => !HIDDEN_STATUSES.includes(target.accountClientStatus || target.clientStatus || ''));
    if (sortField === 'name') {
      items.sort((a, b) => a.name.localeCompare(b.name, 'es') * (sortDirection === 'asc' ? 1 : -1));
    }
    if (sortField === 'brandCount') {
      items.sort((a, b) => ((a.brandCount || 0) - (b.brandCount || 0)) * (sortDirection === 'asc' ? 1 : -1));
    }
    return items;
  }, [allTargets, searchTerm, statusFilter, hideDiscarded, sortField, sortDirection]);

  const visibleTargets = useMemo(
    () => filteredTargets.slice(0, visibleCount),
    [filteredTargets, visibleCount]
  );
  const hasMoreTargets = visibleCount < filteredTargets.length;
  const selectedTarget = useMemo(
    () => allTargets.find((target) => target.id === selectedId) || null,
    [allTargets, selectedId]
  );

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_TARGETS);
  }, [searchTerm, statusFilter, hideDiscarded, sortField, sortDirection]);

  useEffect(() => {
    if (!hasMoreTargets || !loadMoreRef.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) return;
      setVisibleCount((count) => Math.min(count + LOAD_MORE_TARGETS, filteredTargets.length));
    }, { rootMargin: '280px 0px' });
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [filteredTargets.length, hasMoreTargets]);

  useEffect(() => {
    if (loadingTargets || loadingRepresentatives) return;
    if (visibleTargets.length === 0) {
      setSelectedId(null);
      return;
    }
    if (selectedId && !visibleTargets.some((target) => target.id === selectedId)) setSelectedId(null);
  }, [loadingTargets, loadingRepresentatives, visibleTargets, selectedId]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (filteredTargets.length === 0) return;
      e.preventDefault();
      const idx = selectedId ? filteredTargets.findIndex((t) => t.id === selectedId) : -1;
      const nextIdx = e.key === 'ArrowDown'
        ? Math.min(idx + 1, filteredTargets.length - 1)
        : Math.max(idx - 1, 0);
      const next = filteredTargets[nextIdx];
      if (!next || next.id === selectedId) return;
      if (nextIdx >= visibleCount) setVisibleCount((count) => Math.max(count, nextIdx + 10));
      setSelectedId(next.id);
      requestAnimationFrame(() => {
        document.querySelector(`[data-target-row="${next.id}"]`)?.scrollIntoView({ block: 'nearest' });
      });
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [filteredTargets, selectedId, visibleCount]);

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

  const getDespachoInfo = (companyName?: string, ownLogoUrl?: string, despachoId?: string) => {
    if (!companyName?.trim() && !ownLogoUrl && !despachoId) return null;
    const company = normalizeCompany(companyName);
    const found = availableDespachos.find((despacho) =>
      (despachoId && despacho.id === despachoId)
      || [despacho.name, ...despacho.aliases].some((name) => normalizeCompany(name) === company)
    );
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
    const rows = filteredTargets;
    if (rows.length === 0) {
      alert('No hay targets para exportar.');
      return;
    }
    const csvCell = (value: string) => `"${value.replace(/"/g, '""').replace(/[\r\n]+/g, ' ')}"`;
    const csv = ['Nombre,Correo', ...rows.map((target) => `${csvCell(target.name)},${csvCell(target.email || '')}`)].join('\n');
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
      representativeActivityVerified: selectedTarget.representativeActivityVerified,
      representativeActivityLevel: selectedTarget.representativeActivityLevel,
      representativeActivityVerificationStatus: selectedTarget.representativeActivityVerificationStatus,
      representativeActivityCount: selectedTarget.representativeActivityCount,
      activityClassificationBasis: selectedTarget.activityClassificationBasis,
      impiProfileCount: selectedTarget.impiProfileCount,
      impiProfilesProcessed: selectedTarget.impiProfilesProcessed,
      impiRawExpedientCount: selectedTarget.impiRawExpedientCount,
      impiUniqueExpedientCount: selectedTarget.impiUniqueExpedientCount,
      impiVerificationSource: selectedTarget.impiVerificationSource,
      impiSourceIndexedAt: selectedTarget.impiSourceIndexedAt,
      impiExactAgentQuery: selectedTarget.impiExactAgentQuery,
      representativeActivityVerifiedAt: selectedTarget.representativeActivityVerifiedAt,
      impiCooldownUntil: selectedTarget.impiCooldownUntil,
      ...updates,
    });
  };

  const handleDespachoSelect = async (despacho: DespachoOption) => {
    if (!selectedTarget || !despacho.name.trim()) return;
    const updates: Partial<Target> = { company: despacho.name };
    if (despacho.id) updates.despachoId = despacho.id;
    try {
      if (selectedTarget.createdBy === 'representative') setSelectedId(await createFromRepresentative(updates));
      else await updateTarget(selectedTarget.id, updates);
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
      if (selectedTarget.despachoId) await updateDespacho(selectedTarget.despachoId, { clientStatus });
      else if (selectedTarget.createdBy === 'representative') setSelectedId(await createFromRepresentative({ clientStatus }));
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

  const selectedDespacho = selectedTarget ? getDespachoInfo(selectedTarget.accountName || selectedTarget.company, selectedTarget.logoUrl, selectedTarget.despachoId) : null;
  const selectedStage = selectedTarget?.accountStage || selectedTarget?.stage || '';
  const selectedActivityCount = selectedTarget?.representativeActivityVerified
    ? selectedTarget.impiUniqueExpedientCount || 0
    : selectedTarget?.representativeActivityCount ?? selectedTarget?.brandCount ?? 0;
  const selectedActivityLevel = selectedTarget?.representativeActivityLevel || getRepresentativeActivityLevel(selectedActivityCount);
  const selectedActivityColor = getRepresentativeActivityColor(selectedActivityLevel);
  const selectedVerificationLabel = getRepresentativeVerificationLabel(selectedTarget?.representativeActivityVerificationStatus);
  const pipelineIndex = selectedTarget ? getPipelineIndex(selectedStage) : -1;
  const nextAction = selectedTarget?.scheduledDemoDate
    ? { title: 'Realizar demo programada', date: formatDate(selectedTarget.scheduledDemoDate) }
    : selectedTarget?.nextContactDate
      ? { title: 'Dar seguimiento al contacto', date: formatDate(selectedTarget.nextContactDate) }
      : selectedStage === 'Venta'
        ? { title: 'Dar seguimiento al cliente', date: 'Sin fecha asignada' }
        : { title: 'Continuar seguimiento comercial', date: 'Sin fecha asignada' };
  const loading = loadingTargets || loadingRepresentatives;

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronUpIcon className={styles.sortIconMuted} aria-hidden="true" />;
    return sortDirection === 'asc'
      ? <ChevronUpIcon className={styles.sortIcon} aria-hidden="true" />
      : <ChevronDownIcon className={styles.sortIcon} aria-hidden="true" />;
  };

  return (
    <ProtectedRoute>
      <div className={`${styles.shell} ${navExpanded ? styles.navExpanded : styles.navCollapsed}`}>
        <aside className={styles.rail} aria-label="Navegación principal">
          <div className={styles.brandRow}>
            <Link className={styles.brand} href="/dashboard" aria-label="Ir al dashboard">
              <span className={styles.brandMark}>C</span>
              <span className={styles.brandCopy}><strong>Lawgic</strong><small>CRM</small></span>
            </Link>
            <button className={styles.navToggle} onClick={() => setNavExpanded((expanded) => !expanded)} aria-label={navExpanded ? 'Contraer navegación' : 'Expandir navegación'}>
              {navExpanded ? <ChevronLeftIcon /> : <ChevronRightIcon />}
            </button>
          </div>
          <nav className={styles.railNav}>
            <span className={styles.navSectionLabel}>Principal</span>
            <Link className={styles.navItem} href="/dashboard" title="Dashboard"><HomeIcon /><span>Dashboard</span></Link>
            <Link className={`${styles.navItem} ${styles.railActive}`} href="/target" aria-current="page" title="Targets"><span className={styles.targetGlyph}>◎</span><span>Targets</span></Link>
            <span className={styles.navSectionLabel}>Gestión</span>
            <Link className={styles.navItem} href="/despachos-empresas" title="Despachos"><BriefcaseIcon /><span>Despachos</span></Link>
            <Link className={styles.navItem} href="/seguimiento" title="Seguimiento"><ClipboardDocumentListIcon /><span>Seguimiento</span></Link>
            <Link className={styles.navItem} href="/kpis" title="Indicadores"><ChartBarIcon /><span>Indicadores</span></Link>
          </nav>
          <div className={styles.railBottom}>
            <button className={styles.navItem} disabled aria-disabled="true" title="Notificaciones (próximamente)"><BellIcon /><span>Notificaciones</span></button>
            <Link className={styles.navItem} href="/perfil" title="Configuración"><Cog6ToothIcon /><span>Configuración</span></Link>
            <Link className={styles.profileCard} href="/perfil" title="Ver perfil">
              <span className={styles.userBadge}>{getInitials(user?.displayName || user?.email || 'CA')}</span>
              <span className={styles.profileCopy}><strong>{user?.displayName || 'Usuario Lawgic'}</strong><small>{user?.email || 'Mi perfil'}</small></span>
            </Link>
          </div>
        </aside>

        <main className={styles.workspace}>
          <header className={styles.topbar}>
            <div className={styles.titleGroup}>
              <button className={styles.mobileBack} onClick={() => router.push('/dashboard')} aria-label="Ir al dashboard"><ArrowLeftIcon /></button>
              <div>
                <div className={styles.breadcrumb}><span>CRM</span><i>/</i><strong>Targets</strong></div>
                <h1>Targets <span>{filteredTargets.length.toLocaleString('es-MX')}</span></h1>
                <p>Base de clientes potenciales y representantes</p>
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
                  <span>Etapa cuenta</span>
                  <button className={styles.alignRight} onClick={() => handleSort('brandCount')}>Actividad IMPI <SortIcon field="brandCount" /></button>
                </div>

                {loading && <div className={styles.emptyState}>Cargando clientes…</div>}
                {!loading && visibleTargets.length === 0 && (
                  <div className={styles.emptyState}>{searchTerm ? 'No encontramos targets con esa búsqueda.' : 'No hay targets para este filtro.'}</div>
                )}
                {!loading && visibleTargets.map((target) => {
                  const despacho = getDespachoInfo(target.accountName || target.company, target.logoUrl, target.despachoId);
                  const effectiveStage = target.accountStage || target.stage;
                  const activityCount = target.representativeActivityVerified
                    ? target.impiUniqueExpedientCount || 0
                    : target.representativeActivityCount ?? target.brandCount ?? 0;
                  const activityLevel = target.representativeActivityLevel || getRepresentativeActivityLevel(activityCount);
                  const activityColor = getRepresentativeActivityColor(activityLevel);
                  const selected = target.id === selectedId;
                  return (
                    <button
                      key={target.id}
                      data-target-row={target.id}
                      className={`${styles.tableRow} ${selected ? styles.tableRowSelected : ''}`}
                      onClick={() => setSelectedId(selected ? null : target.id)}
                      aria-expanded={selected}
                      aria-controls="target-detail"
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
                        {effectiveStage ? <span className={styles.stageBadge} title={target.accountStage && target.stage !== target.accountStage ? `Seguimiento personal: ${target.stage}` : undefined} style={{ color: getStageColor(effectiveStage), backgroundColor: `${getStageColor(effectiveStage)}10`, borderColor: `${getStageColor(effectiveStage)}33` }}>{effectiveStage}</span> : <span className={styles.muted}>—</span>}
                      </span>
                      <span className={`${styles.brandCell} ${activityCount > 0 ? styles.brandCellPopulated : ''}`}>
                        <strong style={{ color: activityColor }}>{activityLevel}</strong>
                        <small>{activityCount.toLocaleString('es-MX')} exp.</small>
                      </span>
                    </button>
                  );
                })}
              </div>

              <footer className={styles.listFooter} aria-live="polite">
                <span>Mostrando {visibleTargets.length.toLocaleString('es-MX')} de {filteredTargets.length.toLocaleString('es-MX')} clientes</span>
                <div ref={loadMoreRef} className={styles.loadStatus}>
                  {hasMoreTargets ? <><i aria-hidden="true" /> Sigue bajando para ver más</> : filteredTargets.length > 0 ? 'Todos los targets están visibles' : null}
                </div>
              </footer>
            </section>

            <aside id="target-detail" className={styles.detailPane} aria-label="Detalle del target seleccionado">
              {!selectedTarget ? (
                null
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
                        <div className={styles.detailHeaderActions}>
                          <button className={styles.iconButton} aria-label="Más acciones"><EllipsisVerticalIcon /></button>
                          <button className={styles.iconButton} onClick={() => setSelectedId(null)} aria-label="Cerrar detalle"><XMarkIcon /></button>
                        </div>
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
                                <button key={item.name} onClick={() => handleDespachoSelect(item)}><span className={styles.companyMark}>{item.initials}</span><span>{item.name}</span>{selectedTarget.despachoId === item.id || selectedTarget.company === item.name ? <CheckIcon /> : null}</button>
                              ))}
                              {customDespacho.trim() && !availableDespachos.some((item) => item.name.toLocaleLowerCase('es') === customDespacho.trim().toLocaleLowerCase('es')) && (
                                <button onClick={() => handleDespachoSelect({ name: customDespacho.trim(), color: '#64748b', initials: getInitials(customDespacho.trim()), logo: '', aliases: [] })}><PlusCircleIcon /><span>Crear “{customDespacho.trim()}”</span></button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className={styles.identityBadges}>
                        <span className={styles.stageBadge} style={{ color: getStageColor(selectedStage), backgroundColor: `${getStageColor(selectedStage)}10`, borderColor: `${getStageColor(selectedStage)}33` }}>{selectedStage || 'Sin etapa'}</span>
                        <span className={styles.portfolioBadge} style={{ color: selectedActivityColor }}>{selectedActivityLevel} · {selectedActivityCount.toLocaleString('es-MX')} expedientes</span>
                      </div>
                      {selectedTarget.accountStage && selectedTarget.accountStage !== selectedTarget.stage && (
                        <p className={styles.accountContext}>Cuenta del despacho · cierre vía {selectedTarget.accountPrimaryContactName || 'otro contacto'}</p>
                      )}
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
                    <h3>Actividad como representante</h3>
                    <div className={styles.impiActivityCard}>
                      <div className={styles.impiActivityTopline}>
                        <span
                          className={styles.verificationBadge}
                          data-status={selectedTarget.representativeActivityVerificationStatus || 'pending'}
                        >
                          {selectedVerificationLabel}
                        </span>
                        <strong style={{ color: selectedActivityColor }}>{selectedActivityLevel}</strong>
                      </div>
                      <div className={styles.impiActivityMetrics}>
                        <div><span>Expedientes</span><strong>{selectedActivityCount.toLocaleString('es-MX')}</strong></div>
                        <div>
                          <span>{selectedTarget.activityClassificationBasis === 'verified_marcia_exact_agent_records' ? 'Consulta exacta' : 'Fichas IMPI'}</span>
                          <strong>{selectedTarget.impiProfileCount?.toLocaleString('es-MX') || '—'}</strong>
                        </div>
                        <div><span>Revisadas</span><strong>{selectedTarget.impiProfilesProcessed !== undefined && selectedTarget.impiProfileCount ? `${selectedTarget.impiProfilesProcessed}/${selectedTarget.impiProfileCount}` : '—'}</strong></div>
                      </div>
                      <p>
                        {selectedTarget.representativeActivityVerified
                          ? selectedTarget.activityClassificationBasis === 'verified_marcia_exact_agent_records'
                            ? `Comprobación por frase exacta en MARCia · corte ${selectedTarget.impiSourceIndexedAt || 'no informado'}${selectedTarget.representativeActivityVerifiedAt ? ` · consultado ${formatDate(selectedTarget.representativeActivityVerifiedAt)}` : ''}.`
                            : `Comprobación completa en Marcanet${selectedTarget.representativeActivityVerifiedAt ? ` · ${formatDate(selectedTarget.representativeActivityVerifiedAt)}` : ''}.`
                          : selectedTarget.representativeActivityVerificationStatus === 'cooldown'
                            ? `IMPI solicitó una pausa. El proceso continuará automáticamente${selectedTarget.impiCooldownUntil ? ` después de ${formatDate(selectedTarget.impiCooldownUntil)}` : ''}.`
                            : 'Nivel calculado con el conteo histórico; la comprobación ficha por ficha está pendiente.'}
                      </p>
                    </div>
                  </section>

                  <section className={styles.detailSection}>
                    <h3>Progreso en el CRM</h3>
                    <div className={styles.pipeline}>
                      {PIPELINE_STEPS.map((step, index) => {
                        const completed = pipelineIndex > index;
                        const active = pipelineIndex === index;
                        const historyEntry = [...(selectedTarget.history || [])].reverse().find((entry) => step.stages.some((stage) => stage === entry.stage));
                        const accountDate = step.label === 'Cierre' && selectedTarget.accountStage === 'Venta' ? selectedTarget.accountClosedAt : undefined;
                        return (
                          <div key={step.label} className={`${styles.pipelineStep} ${completed ? styles.pipelineDone : ''} ${active ? styles.pipelineActive : ''}`}>
                            <div className={styles.pipelineMarker}>{completed ? <CheckIcon /> : active ? <span /> : index + 1}</div>
                            <strong>{step.label}</strong>
                            <small>{formatDate(accountDate || historyEntry?.date) || '—'}</small>
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
                        <div><span>Actividad IMPI</span><strong>{selectedActivityLevel}</strong></div>
                        <div><span>Expedientes</span><strong>{selectedActivityCount.toLocaleString('es-MX')}</strong></div>
                        <div><span>Valor potencial</span><strong>${(selectedTarget.potentialValue || 0).toLocaleString('en-US')}</strong></div>
                        <div><span>Valor de cuenta</span><strong>${(selectedTarget.accountValue || 0).toLocaleString('en-US')}</strong></div>
                      </div>
                      <div ref={statusDropdownRef} className={styles.statusPicker}>
                        <span>Estatus del cliente</span>
                        <button onClick={() => setStatusDropdownOpen((open) => !open)}>{getClientStatusInfo(selectedTarget.accountClientStatus || selectedTarget.clientStatus)?.emoji || '○'} {getClientStatusInfo(selectedTarget.accountClientStatus || selectedTarget.clientStatus)?.label || 'Asignar estatus'} <ChevronDownIcon /></button>
                        {statusDropdownOpen && <div className={styles.statusMenu}>{CLIENT_STATUSES.map((status) => <button key={status.value} onClick={() => handleStatusChange(status.value)}><span>{status.emoji}</span><div><strong>{status.label}</strong><small>{status.description}</small></div>{(selectedTarget.accountClientStatus || selectedTarget.clientStatus) === status.value && <CheckIcon />}</button>)}</div>}
                      </div>
                      {selectedTarget.accountStage && selectedTarget.accountStage !== selectedTarget.stage && <div className={styles.profileBlock}><span>Seguimiento personal</span><p>{selectedTarget.stage || 'Sin etapa personal'}</p></div>}
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

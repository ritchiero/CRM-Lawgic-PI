"use client";

import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeToProspects, Prospect } from '@/services/prospectService';
import { ArrowLeftIcon, MagnifyingGlassIcon, XMarkIcon, EnvelopeIcon, PhoneIcon, BuildingOfficeIcon, TagIcon, CalendarIcon, ChatBubbleLeftIcon, CameraIcon, DocumentTextIcon, InformationCircleIcon, FlagIcon, StarIcon, DocumentArrowDownIcon } from '@heroicons/react/24/outline';

export default function TargetPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [activeTab, setActiveTab] = useState('infos');

  useEffect(() => {
    if (!user) return;

    const unsubscribe = subscribeToProspects((data) => {
      setProspects(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Reset tab when selecting a new prospect
  useEffect(() => {
    if (selectedProspect) setActiveTab('infos');
  }, [selectedProspect]);

  const filteredProspects = useMemo(() => {
    if (!searchTerm.trim()) return prospects;
    const term = searchTerm.toLowerCase().trim();
    return prospects.filter((p) =>
      p.name.toLowerCase().includes(term)
    );
  }, [prospects, searchTerm]);

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  };

  const getStageColor = (stage: string) => {
    const colors: Record<string, string> = {
      'Deteccion de prospecto': '#6366f1',
      'Contacto inicial': '#8b5cf6',
      'Cita Demo': '#a855f7',
      'Demo realizada': '#3b82f6',
      'Propuesta enviada': '#f59e0b',
      'Negociacion': '#ef4444',
      'Cliente': '#22c55e',
      'Perdido': '#6b7280',
    };
    return colors[stage] || '#6366f1';
  };

  const getStageProgress = (stage: string) => {
    const stages: Record<string, number> = {
      'Deteccion de prospecto': 14,
      'Contacto inicial': 28,
      'Cita Demo': 42,
      'Demo realizada': 57,
      'Propuesta enviada': 71,
      'Negociacion': 85,
      'Cliente': 100,
      'Perdido': 0,
    };
    return stages[stage] || 0;
  };

  const getStageRisk = (stage: string) => {
    const risk: Record<string, { label: string; color: string }> = {
      'Deteccion de prospecto': { label: 'Early Stage', color: '#6366f1' },
      'Contacto inicial': { label: 'In Progress', color: '#8b5cf6' },
      'Cita Demo': { label: 'In Progress', color: '#a855f7' },
      'Demo realizada': { label: 'On Track', color: '#3b82f6' },
      'Propuesta enviada': { label: 'At Risk', color: '#f59e0b' },
      'Negociacion': { label: 'At Risk', color: '#ef4444' },
      'Cliente': { label: 'Won', color: '#22c55e' },
      'Perdido': { label: 'Lost', color: '#6b7280' },
    };
    return risk[stage] || { label: 'Unknown', color: '#6b7280' };
  };

  const getStageIndex = (stage: string) => {
    const order = ['Deteccion de prospecto', 'Contacto inicial', 'Cita Demo', 'Demo realizada', 'Propuesta enviada', 'Negociacion', 'Cliente'];
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

  return (
    <ProtectedRoute>
      <div style={{
        minHeight: '100vh',
        backgroundColor: 'var(--background)',
        fontFamily: 'var(--font-sans)',
        padding: '2rem'
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          {/* Header */}
          <div style={{ marginBottom: '2rem' }}>
            <button
              onClick={() => router.back()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: 'none',
                border: 'none',
                color: 'var(--secondary)',
                cursor: 'pointer',
                marginBottom: '1rem',
                fontSize: '0.875rem'
              }}
            >
              <ArrowLeftIcon style={{ width: '1rem', height: '1rem' }} />
              Volver
            </button>
            <h1 style={{
              fontSize: '2rem',
              fontWeight: '700',
              color: 'var(--foreground)',
              margin: 0
            }}>
              Targets
            </h1>
            <p style={{
              fontSize: '0.875rem',
              color: 'var(--secondary)',
              marginTop: '0.5rem'
            }}>
              Lista de clientes potenciales
            </p>
          </div>

          {/* Search Bar */}
          <div style={{
            marginBottom: '1rem',
            position: 'relative'
          }}>
            <MagnifyingGlassIcon style={{
              width: '1.25rem',
              height: '1.25rem',
              position: 'absolute',
              left: '1rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--secondary)',
              pointerEvents: 'none'
            }} />
            <input
              type="text"
              placeholder="Buscar cliente por nombre..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem 1rem 0.75rem 3rem',
                fontSize: '0.9375rem',
                border: '1px solid var(--border)',
                borderRadius: '0.75rem',
                backgroundColor: 'var(--surface)',
                color: 'var(--foreground)',
                outline: 'none',
                fontFamily: 'inherit',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Client List Table */}
          <div style={{
            backgroundColor: 'var(--surface)',
            borderRadius: '0.75rem',
            border: '1px solid var(--border)',
            overflow: 'hidden'
          }}>
            {/* Table Header */}
            <div style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: 'var(--surface)',
              borderBottom: '2px solid var(--border)',
              fontWeight: '600',
              fontSize: '0.75rem',
              color: 'var(--secondary)',
              textTransform: 'uppercase' as const,
              letterSpacing: '0.05em'
            }}>
              Nombre del Cliente
            </div>

            {/* Loading State */}
            {loading && (
              <div style={{
                padding: '3rem',
                textAlign: 'center',
                color: 'var(--secondary)',
                fontSize: '0.875rem'
              }}>
                Cargando clientes...
              </div>
            )}

            {/* Empty State */}
            {!loading && filteredProspects.length === 0 && (
              <div style={{
                padding: '3rem',
                textAlign: 'center',
                color: 'var(--secondary)',
                fontSize: '0.875rem'
              }}>
                {searchTerm.trim() ? 'No se encontraron clientes con ese nombre' : 'No hay clientes registrados'}
              </div>
            )}

            {/* Client Rows */}
            {!loading && filteredProspects.map((prospect) => (
              <div
                key={prospect.id}
                onClick={() => setSelectedProspect(prospect)}
                style={{
                  padding: '0.875rem 1.5rem',
                  borderBottom: '1px solid var(--border)',
                  fontSize: '0.9375rem',
                  color: 'var(--foreground)',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--border)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <div style={{
                  width: '2.25rem',
                  height: '2.25rem',
                  borderRadius: '50%',
                  backgroundColor: '#6366f1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: '0.75rem',
                  fontWeight: '700',
                  flexShrink: 0
                }}>
                  {getInitials(prospect.name)}
                </div>
                {prospect.name}
              </div>
            ))}
          </div>

          {/* Footer count */}
          {!loading && (
            <div style={{
              marginTop: '1rem',
              fontSize: '0.75rem',
              color: 'var(--secondary)',
              textAlign: 'right'
            }}>
              {filteredProspects.length}{searchTerm.trim() ? ` de ${prospects.length}` : ''} cliente{filteredProspects.length !== 1 ? 's' : ''} en total
            </div>
          )}
        </div>
      </div>

      {/* OVERLAY */}
      {selectedProspect && (
        <div
          onClick={() => setSelectedProspect(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.4)',
            zIndex: 1000,
            animation: 'fadeIn 0.2s ease'
          }}
        />
      )}

      {/* SIDEBAR MODAL - 3/4 width */}
      <div style={{
        position: 'fixed',
        top: 0,
        right: selectedProspect ? '0' : '-76vw',
        width: '75vw',
        height: '100vh',
        backgroundColor: 'var(--surface)',
        boxShadow: selectedProspect ? '-8px 0 30px rgba(0,0,0,0.15)' : 'none',
        zIndex: 1001,
        transition: 'right 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-sans)'
      }}>
        {selectedProspect && (() => {
          const progress = getStageProgress(selectedProspect.stage);
          const risk = getStageRisk(selectedProspect.stage);
          const stageIdx = getStageIndex(selectedProspect.stage);

          return (
          <>
            {/* Top bar with Back + Download PDF */}
            <div style={{ padding: '1.25rem 2rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                onClick={() => setSelectedProspect(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  background: 'none',
                  border: 'none',
                  color: 'var(--secondary)',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  padding: 0
                }}
              >
                <ArrowLeftIcon style={{ width: '1rem', height: '1rem' }} />
                Back
              </button>
              <button
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 1rem',
                  backgroundColor: 'var(--foreground)',
                  color: 'var(--surface)',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontFamily: 'inherit'
                }}
              >
                <DocumentArrowDownIcon style={{ width: '1rem', height: '1rem' }} />
                Download PDF
              </button>
            </div>

            {/* Profile Header */}
            <div style={{
              padding: '1.5rem 2rem 1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '1.5rem'
            }}>
              {/* Avatar with camera icon */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{
                  width: '5.5rem',
                  height: '5.5rem',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: '1.75rem',
                  fontWeight: '700',
                  boxShadow: '0 4px 14px rgba(99,102,241,0.3)'
                }}>
                  {getInitials(selectedProspect.name)}
                </div>
                {/* Camera icon overlay */}
                <div style={{
                  position: 'absolute',
                  bottom: '0',
                  left: '0',
                  width: '1.75rem',
                  height: '1.75rem',
                  borderRadius: '0.5rem',
                  backgroundColor: 'var(--foreground)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
                }}>
                  <CameraIcon style={{ width: '1rem', height: '1rem', color: '#fff' }} />
                </div>
              </div>
              <div style={{ minWidth: 0 }}>
                <h2 style={{
                  fontSize: '1.5rem',
                  fontWeight: '700',
                  color: 'var(--foreground)',
                  margin: 0,
                  lineHeight: 1.3
                }}>
                  {selectedProspect.name}
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '0.2rem 0.65rem',
                    borderRadius: '1rem',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    color: getStageColor(selectedProspect.stage),
                    border: '1.5px solid ' + getStageColor(selectedProspect.stage),
                    backgroundColor: getStageColor(selectedProspect.stage) + '12'
                  }}>
                    {selectedProspect.stage}
                  </span>
                  {selectedProspect.company && (
                    <span style={{ fontSize: '0.875rem', color: 'var(--secondary)' }}>
                      {selectedProspect.company}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Tabs Navigation */}
            <div style={{
              padding: '0 2rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              borderBottom: '1px solid var(--border)',
              marginTop: '0.5rem'
            }}>
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.75rem 1rem',
                    fontSize: '0.8rem',
                    fontWeight: activeTab === tab.id ? '600' : '400',
                    color: activeTab === tab.id ? 'var(--foreground)' : 'var(--secondary)',
                    background: 'none',
                    border: 'none',
                    borderBottom: activeTab === tab.id ? '2px solid var(--foreground)' : '2px solid transparent',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    marginBottom: '-1px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {tab.icon === 'info' && <InformationCircleIcon style={{ width: '1rem', height: '1rem' }} />}
                  {tab.icon === 'flag' && <FlagIcon style={{ width: '1rem', height: '1rem' }} />}
                  {tab.icon === 'doc' && <DocumentTextIcon style={{ width: '1rem', height: '1rem' }} />}
                  {tab.icon === 'star' && <StarIcon style={{ width: '1rem', height: '1rem' }} />}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Summary Cards Row */}
            <div style={{
              padding: '1.5rem 2rem',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1rem'
            }}>
              {/* Achievement Progress Card */}
              <div style={{
                padding: '1.25rem',
                backgroundColor: 'var(--background)',
                borderRadius: '0.75rem',
                border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--foreground)', marginBottom: '0.75rem' }}>
                  Achievement Progress
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  {/* Multicolor progress bar */}
                  <div style={{
                    flex: 1,
                    height: '0.5rem',
                    backgroundColor: 'var(--border)',
                    borderRadius: '1rem',
                    overflow: 'hidden',
                    position: 'relative'
                  }}>
                    <div style={{
                      width: progress + '%',
                      height: '100%',
                      borderRadius: '1rem',
                      background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #a855f7, #3b82f6, #f59e0b, #ef4444)',
                      transition: 'width 0.5s ease'
                    }} />
                  </div>
                  <span style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--foreground)', minWidth: '2.5rem', textAlign: 'right' }}>
                    {progress} %
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--secondary)' }}>
                    Last update : {formatDate(selectedProspect.createdAt) || 'N/A'}
                  </span>
                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: '600',
                    color: risk.color,
                    backgroundColor: risk.color + '15',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '1rem'
                  }}>
                    {risk.label}
                  </span>
                </div>
              </div>

              {/* Bonus / Value Earned Card */}
              <div style={{
                padding: '1.25rem',
                backgroundColor: 'var(--background)',
                borderRadius: '0.75rem',
                border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--foreground)', marginBottom: '0.75rem' }}>
                  Valor Potencial
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '1.5rem', fontWeight: '800', color: '#6366f1' }}>
                    {'$' + (selectedProspect.potentialValue || 0).toLocaleString()}
                  </span>
                  {selectedProspect.accountValue != null && (
                    <span style={{ fontSize: '0.85rem', color: 'var(--secondary)' }}>
                      / {selectedProspect.accountValue.toLocaleString()}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--secondary)' }}>
                    Objectives
                  </span>
                  <span style={{
                    fontSize: '0.85rem',
                    fontWeight: '700',
                    color: '#6366f1',
                    backgroundColor: '#6366f115',
                    padding: '0.15rem 0.6rem',
                    borderRadius: '0.375rem'
                  }}>
                    {stageIdx}<span style={{ fontWeight: '400', color: 'var(--secondary)' }}> /7</span>
                  </span>
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
                    <h3 style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
                      Informacion de Contacto
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                      {selectedProspect.email && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <EnvelopeIcon style={{ width: '1.1rem', height: '1.1rem', color: 'var(--secondary)', flexShrink: 0 }} />
                          <span style={{ fontSize: '0.9rem', color: 'var(--foreground)' }}>{selectedProspect.email}</span>
                        </div>
                      )}
                      {selectedProspect.phone && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <PhoneIcon style={{ width: '1.1rem', height: '1.1rem', color: 'var(--secondary)', flexShrink: 0 }} />
                          <span style={{ fontSize: '0.9rem', color: 'var(--foreground)' }}>{selectedProspect.phone}</span>
                        </div>
                      )}
                      {selectedProspect.company && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <BuildingOfficeIcon style={{ width: '1.1rem', height: '1.1rem', color: 'var(--secondary)', flexShrink: 0 }} />
                          <span style={{ fontSize: '0.9rem', color: 'var(--foreground)' }}>{selectedProspect.company}</span>
                        </div>
                      )}
                      {selectedProspect.linkedinUrl && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <svg style={{ width: '1.1rem', height: '1.1rem', flexShrink: 0 }} viewBox="0 0 24 24" fill="var(--secondary)">
                            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                          </svg>
                          <a href={selectedProspect.linkedinUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.9rem', color: '#6366f1', textDecoration: 'none' }}>
                            Ver perfil de LinkedIn
                          </a>
                        </div>
                      )}
                      {!selectedProspect.email && !selectedProspect.phone && !selectedProspect.company && (
                        <span style={{ fontSize: '0.85rem', color: 'var(--secondary)', fontStyle: 'italic' }}>Sin datos de contacto registrados</span>
                      )}
                    </div>
                  </div>

                  {/* Lead Source */}
                  {selectedProspect.leadSource && (
                    <div>
                      <h3 style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
                        Origen del Lead
                      </h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <TagIcon style={{ width: '1.1rem', height: '1.1rem', color: 'var(--secondary)', flexShrink: 0 }} />
                        <span style={{ fontSize: '0.9rem', color: 'var(--foreground)' }}>{selectedProspect.leadSource}</span>
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {selectedProspect.notes && (
                    <div>
                      <h3 style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
                        Notas
                      </h3>
                      <div style={{
                        padding: '1rem',
                        backgroundColor: 'var(--background)',
                        borderRadius: '0.5rem',
                        border: '1px solid var(--border)',
                        fontSize: '0.875rem',
                        color: 'var(--foreground)',
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap'
                      }}>
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
                    <h3 style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
                      Fechas Clave
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <CalendarIcon style={{ width: '1.1rem', height: '1.1rem', color: 'var(--secondary)', flexShrink: 0 }} />
                        <span style={{ fontSize: '0.85rem', color: 'var(--secondary)' }}>Creado:</span>
                        <span style={{ fontSize: '0.9rem', color: 'var(--foreground)' }}>{formatDate(selectedProspect.createdAt) || 'N/A'}</span>
                      </div>
                      {selectedProspect.nextContactDate && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <CalendarIcon style={{ width: '1.1rem', height: '1.1rem', color: '#f59e0b', flexShrink: 0 }} />
                          <span style={{ fontSize: '0.85rem', color: 'var(--secondary)' }}>Proximo contacto:</span>
                          <span style={{ fontSize: '0.9rem', color: 'var(--foreground)' }}>{formatDate(selectedProspect.nextContactDate)}</span>
                        </div>
                      )}
                      {selectedProspect.scheduledDemoDate && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <CalendarIcon style={{ width: '1.1rem', height: '1.1rem', color: '#3b82f6', flexShrink: 0 }} />
                          <span style={{ fontSize: '0.85rem', color: 'var(--secondary)' }}>Demo programada:</span>
                          <span style={{ fontSize: '0.9rem', color: 'var(--foreground)' }}>{formatDate(selectedProspect.scheduledDemoDate)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Financial */}
                  {(selectedProspect.potentialValue || selectedProspect.accountValue || selectedProspect.brandCount) && (
                    <div>
                      <h3 style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
                        Datos Comerciales
                      </h3>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
                        {selectedProspect.potentialValue != null && (
                          <div style={{ padding: '0.75rem', backgroundColor: 'var(--background)', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--secondary)', marginBottom: '0.25rem' }}>Valor Potencial</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#22c55e' }}>{'$' + selectedProspect.potentialValue.toLocaleString()}</div>
                          </div>
                        )}
                        {selectedProspect.accountValue != null && (
                          <div style={{ padding: '0.75rem', backgroundColor: 'var(--background)', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--secondary)', marginBottom: '0.25rem' }}>Valor de Cuenta</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#3b82f6' }}>{'$' + selectedProspect.accountValue.toLocaleString()}</div>
                          </div>
                        )}
                        {selectedProspect.brandCount != null && (
                          <div style={{ padding: '0.75rem', backgroundColor: 'var(--background)', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--secondary)', marginBottom: '0.25rem' }}>Marcas</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#8b5cf6' }}>{selectedProspect.brandCount}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* History Timeline */}
                  {selectedProspect.history && selectedProspect.history.length > 0 && (
                    <div>
                      <h3 style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
                        Historial de Etapas
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {selectedProspect.history.map((entry, idx) => (
                          <div key={idx} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            padding: '0.5rem 0.75rem',
                            backgroundColor: idx === 0 ? getStageColor(entry.stage) + '10' : 'transparent',
                            borderRadius: '0.375rem',
                            borderLeft: '3px solid ' + getStageColor(entry.stage)
                          }}>
                            <div style={{
                              width: '0.5rem',
                              height: '0.5rem',
                              borderRadius: '50%',
                              backgroundColor: getStageColor(entry.stage),
                              flexShrink: 0
                            }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--foreground)' }}>{entry.stage}</span>
                            </div>
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
            {activeTab === 'objectives' && (
              <div style={{ padding: '2rem', color: 'var(--secondary)', fontSize: '0.9rem' }}>
                <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                  <FlagIcon style={{ width: '2.5rem', height: '2.5rem', color: 'var(--border)', margin: '0 auto 1rem' }} />
                  <p style={{ fontWeight: '500' }}>Objectives coming soon</p>
                  <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>This section will track prospect-specific goals and milestones.</p>
                </div>
              </div>
            )}

            {/* Documents Tab */}
            {activeTab === 'documents' && (
              <div style={{ padding: '2rem', color: 'var(--secondary)', fontSize: '0.9rem' }}>
                <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                  <DocumentTextIcon style={{ width: '2.5rem', height: '2.5rem', color: 'var(--border)', margin: '0 auto 1rem' }} />
                  <p style={{ fontWeight: '500' }}>Documents coming soon</p>
                  <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>Proposals, contracts and files will appear here.</p>
                </div>
              </div>
            )}

            {/* Reviews Tab */}
            {activeTab === 'reviews' && (
              <div style={{ padding: '2rem', color: 'var(--secondary)', fontSize: '0.9rem' }}>
                <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                  <StarIcon style={{ width: '2.5rem', height: '2.5rem', color: 'var(--border)', margin: '0 auto 1rem' }} />
                  <p style={{ fontWeight: '500' }}>Reviews coming soon</p>
                  <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>Notes and reviews about this prospect will be shown here.</p>
                </div>
              </div>
            )}
          </>
          );
        })()}
      </div>
    </ProtectedRoute>
  );
}

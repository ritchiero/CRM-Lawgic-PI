"use client";

import { useState, useEffect } from 'react';
import {
    MagnifyingGlassIcon,
    PhoneIcon,
    ChatBubbleLeftRightIcon,
    SparklesIcon,
    CalendarDaysIcon,
    PresentationChartLineIcon,
    CheckCircleIcon,
    PauseCircleIcon,
    TrashIcon,
    PlusIcon,
    ArrowLeftOnRectangleIcon,
    MagnifyingGlassMinusIcon,
    MagnifyingGlassPlusIcon
} from '@heroicons/react/24/outline';
import { Column, ProspectModal, ProspectDetailModal, type Prospect } from './components';
import {
    subscribeToProspects,
    createProspect,
    deleteProspect,
    moveProspectToStage,
    updateProspect
} from '@/services/prospectService';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { getAllUsers, UserData } from '@/services/authService';
import { Avatar, getAvatarColor } from '@/components/Avatar';

export default function SeguimientoPage() {
    return (
        <ProtectedRoute>
            <SeguimientoContent />
        </ProtectedRoute>
    );
}

function SeguimientoContent() {
    const [prospects, setProspects] = useState<Prospect[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
    const [loading, setLoading] = useState(true);
    const [userMap, setUserMap] = useState<Record<string, { displayName: string; avatarColor?: string }>>({});
    const { userData, logout } = useAuth();
    
    // Zoom state with localStorage persistence
    const [zoomLevel, setZoomLevel] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('crm-kanban-zoom');
            return saved ? parseFloat(saved) : 1.0;
        }
        return 1.0;
    });

    // Subscribe to prospects from Firestore
    useEffect(() => {
        const unsubscribe = subscribeToProspects((updatedProspects) => {
            setProspects(updatedProspects);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // Fetch all users to map UIDs to names and avatar colors
    useEffect(() => {
        const fetchUsers = async () => {
            const users = await getAllUsers();
            const map: Record<string, { displayName: string; avatarColor?: string }> = {};
            users.forEach(user => {
                map[user.uid] = {
                    displayName: user.displayName,
                    avatarColor: user.avatarColor
                };
            });
            setUserMap(map);
        };
        fetchUsers();
    }, []);

    const handleDragStart = (e: React.DragEvent, prospectId: string) => {
        e.dataTransfer.setData('prospectId', prospectId);
    };

    const handleDrop = async (e: React.DragEvent, newStage: string) => {
        e.preventDefault();
        const prospectId = e.dataTransfer.getData('prospectId');

        const prospect = prospects.find(p => p.id === prospectId);
        if (!prospect) return;

        try {
            await moveProspectToStage(prospectId, newStage, prospect.history);
        } catch (error) {
            console.error('Error moving prospect:', error);
            alert('Error al mover el prospecto. Por favor intenta de nuevo.');
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleCreateProspect = async (prospectData: Omit<Prospect, 'id' | 'createdAt' | 'stage' | 'history' | 'createdBy' | 'updatedAt'>) => {
        try {
            await createProspect(prospectData);
            setIsModalOpen(false);
        } catch (error) {
            console.error('Error creating prospect:', error);
            alert('Error al crear el prospecto. Por favor intenta de nuevo.');
        }
    };

    const handleDeleteProspect = async (prospectId: string) => {
        try {
            await deleteProspect(prospectId);
            setSelectedProspect(null);
        } catch (error) {
            console.error('Error deleting prospect:', error);
            alert('Error al eliminar el prospecto. Por favor intenta de nuevo.');
        }
    };

    const handleMoveStage = async (prospectId: string, newStage: string) => {
        const prospect = prospects.find(p => p.id === prospectId);
        if (!prospect) return;

        try {
            await moveProspectToStage(prospectId, newStage, prospect.history);
            setSelectedProspect(null);
        } catch (error) {
            console.error('Error moving prospect:', error);
            alert('Error al mover el prospecto. Por favor intenta de nuevo.');
        }
    };

    const handleUpdateProspect = async (prospectId: string, updates: Partial<Prospect>) => {
        try {
            await updateProspect(prospectId, updates);
            // Update local state to reflect changes immediately
            const updatedProspect = prospects.find(p => p.id === prospectId);
            if (updatedProspect) {
                setSelectedProspect({ ...updatedProspect, ...updates });
            }
        } catch (error) {
            console.error('Error updating prospect:', error);
            alert('Error al actualizar el prospecto. Por favor intenta de nuevo.');
        }
    };

    const handleLogout = async () => {
        try {
            await logout();
        } catch (error) {
            console.error('Error logging out:', error);
        }
    };

    // Zoom functions
    const handleZoomIn = () => {
        const newZoom = Math.min(zoomLevel + 0.1, 1.3);
        setZoomLevel(newZoom);
        if (typeof window !== 'undefined') {
            localStorage.setItem('crm-kanban-zoom', newZoom.toString());
        }
    };

    const handleZoomOut = () => {
        const newZoom = Math.max(zoomLevel - 0.1, 0.6);
        setZoomLevel(newZoom);
        if (typeof window !== 'undefined') {
            localStorage.setItem('crm-kanban-zoom', newZoom.toString());
        }
    };

    const handleZoomReset = () => {
        setZoomLevel(1.0);
        if (typeof window !== 'undefined') {
            localStorage.setItem('crm-kanban-zoom', '1.0');
        }
    };

    if (loading) {
        return (
            <div style={{
                minHeight: '100vh',
                backgroundColor: 'var(--background)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--font-plus-jakarta)'
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', color: 'var(--foreground)', marginBottom: '1rem' }}>
                        Cargando prospectos...
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={{
            minHeight: '100vh',
            backgroundColor: 'var(--background)',
            fontFamily: 'var(--font-plus-jakarta)',
            display: 'flex',
            flexDirection: 'column'
        }}>
            {/* Header */}
            <header style={{
                padding: '0.5rem 1.5rem',
                borderBottom: '1px solid var(--border)',
                backgroundColor: 'var(--surface)',
                flexShrink: 0,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <h1 style={{
                    fontSize: '1.25rem',
                    fontWeight: '700',
                    color: 'var(--foreground)',
                    margin: 0,
                    whiteSpace: 'nowrap'
                }}>
                    Seguimiento Lawgic PI
                </h1>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {/* Zoom Controls */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.375rem',
                        padding: '0.375rem',
                        backgroundColor: 'var(--background)',
                        borderRadius: '0.375rem',
                        border: '1px solid var(--border)'
                    }}>
                        <button
                            onClick={handleZoomOut}
                            disabled={zoomLevel <= 0.6}
                            style={{
                                background: 'none',
                                border: 'none',
                                cursor: zoomLevel <= 0.6 ? 'not-allowed' : 'pointer',
                                color: zoomLevel <= 0.6 ? 'var(--secondary)' : 'var(--foreground)',
                                padding: '0.125rem',
                                borderRadius: '0.25rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                opacity: zoomLevel <= 0.6 ? 0.5 : 1,
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                                if (zoomLevel > 0.6) {
                                    e.currentTarget.style.backgroundColor = 'var(--surface)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                            title="Zoom Out"
                        >
                            <MagnifyingGlassMinusIcon style={{ width: '1rem', height: '1rem' }} />
                        </button>
                        <span style={{
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            color: 'var(--foreground)',
                            minWidth: '2.5rem',
                            textAlign: 'center'
                        }}>
                            {Math.round(zoomLevel * 100)}%
                        </span>
                        <button
                            onClick={handleZoomIn}
                            disabled={zoomLevel >= 1.3}
                            style={{
                                background: 'none',
                                border: 'none',
                                cursor: zoomLevel >= 1.3 ? 'not-allowed' : 'pointer',
                                color: zoomLevel >= 1.3 ? 'var(--secondary)' : 'var(--foreground)',
                                padding: '0.125rem',
                                borderRadius: '0.25rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                opacity: zoomLevel >= 1.3 ? 0.5 : 1,
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                                if (zoomLevel < 1.3) {
                                    e.currentTarget.style.backgroundColor = 'var(--surface)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                            title="Zoom In"
                        >
                            <MagnifyingGlassPlusIcon style={{ width: '1rem', height: '1rem' }} />
                        </button>
                        {zoomLevel !== 1.0 && (
                            <button
                                onClick={handleZoomReset}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'var(--secondary)',
                                    padding: '0.125rem 0.375rem',
                                    borderRadius: '0.25rem',
                                    fontSize: '0.625rem',
                                    fontWeight: '600',
                                    marginLeft: '0.125rem',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = 'var(--surface)';
                                    e.currentTarget.style.color = 'var(--foreground)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                    e.currentTarget.style.color = 'var(--secondary)';
                                }}
                                title="Reset Zoom"
                            >
                                Reset
                            </button>
                        )}
                    </div>
                    {/* User Info */}
                    {userData && (
                        <div
                            onClick={() => window.location.href = '/perfil'}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.375rem 0.75rem',
                                backgroundColor: 'var(--background)',
                                borderRadius: '0.375rem',
                                border: '1px solid var(--border)',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = 'var(--surface)';
                                e.currentTarget.style.borderColor = 'var(--primary)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'var(--background)';
                                e.currentTarget.style.borderColor = 'var(--border)';
                            }}
                            title="Configurar Perfil"
                        >
                            <Avatar
                                name={userData.displayName}
                                avatarColor={userData.avatarColor}
                                userId={userData.uid}
                                size="sm"
                            />
                            <div>
                                <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--foreground)' }}>
                                    {userData.displayName || 'Usuario'}
                                </div>
                                <div style={{ fontSize: '0.625rem', color: 'var(--secondary)' }}>
                                    {userData.role === 'admin' ? 'Admin' : 'Usuario'}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* New Prospect Button */}
                    <button
                        onClick={() => setIsModalOpen(true)}
                        style={{
                            padding: '0.5rem 1rem',
                            backgroundColor: 'var(--primary)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.375rem',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.375rem',
                            transition: 'all 0.2s',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        <PlusIcon style={{ width: '1rem', height: '1rem' }} />
                        Nuevo Prospecto
                    </button>

                    {/* Logout Button */}
                    <button
                        onClick={handleLogout}
                        style={{
                            padding: '0.375rem 0.75rem',
                            backgroundColor: 'transparent',
                            color: 'var(--secondary)',
                            border: '1px solid var(--border)',
                            borderRadius: '0.375rem',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.375rem',
                            transition: 'all 0.2s'
                        }}
                        onMouseOver={(e) => {
                            e.currentTarget.style.backgroundColor = '#ef4444';
                            e.currentTarget.style.borderColor = '#ef4444';
                            e.currentTarget.style.color = 'white';
                        }}
                        onMouseOut={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.borderColor = 'var(--border)';
                            e.currentTarget.style.color = 'var(--secondary)';
                        }}
                    >
                        <ArrowLeftOnRectangleIcon style={{ width: '1rem', height: '1rem' }} />
                        Salir
                    </button>
                </div>
            </header>

            {/* Main Content Container */}
            <main style={{ padding: '2rem', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{
                    backgroundColor: 'var(--surface)',
                    borderRadius: '1rem',
                    border: '1px solid var(--border)',
                    padding: '1.5rem',
                    flex: 1,
                    display: 'flex',
                    gap: `${1 * zoomLevel}rem`,
                    overflowX: 'auto',
                    minWidth: 0,
                    transition: 'gap 0.2s ease-out'
                }}>
                    <Column
                        title="Detección"
                        icon={MagnifyingGlassIcon}
                        prospects={prospects.filter(p => p.stage === 'Detección de prospecto')}
                        onAddClick={() => setIsModalOpen(true)}
                        showAddButton={true}
                        onDrop={(e) => handleDrop(e, 'Detección de prospecto')}
                        onDragOver={handleDragOver}
                        onDragStart={handleDragStart}
                        onProspectClick={setSelectedProspect}
                        userMap={userMap}
                        zoomLevel={zoomLevel}
                    />
                    <Column
                        title="1er Cont."
                        icon={PhoneIcon}
                        prospects={prospects.filter(p => p.stage === '1er Contacto')}
                        onDrop={(e) => handleDrop(e, '1er Contacto')}
                        onDragOver={handleDragOver}
                        onDragStart={handleDragStart}
                        onProspectClick={setSelectedProspect}
                        userMap={userMap}
                        zoomLevel={zoomLevel}
                    />
                    <Column
                        title="Efectivo"
                        icon={ChatBubbleLeftRightIcon}
                        prospects={prospects.filter(p => p.stage === 'Contacto efectivo')}
                        onDrop={(e) => handleDrop(e, 'Contacto efectivo')}
                        onDragOver={handleDragOver}
                        onDragStart={handleDragStart}
                        onProspectClick={setSelectedProspect}
                        userMap={userMap}
                        zoomLevel={zoomLevel}
                    />
                    <Column
                        title="Interés"
                        icon={SparklesIcon}
                        prospects={prospects.filter(p => p.stage === 'Muestra de interés')}
                        onDrop={(e) => handleDrop(e, 'Muestra de interés')}
                        onDragOver={handleDragOver}
                        onDragStart={handleDragStart}
                        onProspectClick={setSelectedProspect}
                        userMap={userMap}
                        zoomLevel={zoomLevel}
                    />
                    <Column
                        title="Cita Demo"
                        icon={CalendarDaysIcon}
                        prospects={prospects.filter(p => p.stage === 'Cita para demo')}
                        onDrop={(e) => handleDrop(e, 'Cita para demo')}
                        onDragOver={handleDragOver}
                        onDragStart={handleDragStart}
                        onProspectClick={setSelectedProspect}
                        userMap={userMap}
                        zoomLevel={zoomLevel}
                    />
                    <Column
                        title="Realizada"
                        icon={PresentationChartLineIcon}
                        prospects={prospects.filter(p => p.stage === 'Demo realizada')}
                        onDrop={(e) => handleDrop(e, 'Demo realizada')}
                        onDragOver={handleDragOver}
                        onDragStart={handleDragStart}
                        onProspectClick={setSelectedProspect}
                        userMap={userMap}
                        zoomLevel={zoomLevel}
                    />
                    <Column
                        title="Venta"
                        icon={CheckCircleIcon}
                        prospects={prospects.filter(p => p.stage === 'Venta')}
                        onDrop={(e) => handleDrop(e, 'Venta')}
                        onDragOver={handleDragOver}
                        onDragStart={handleDragStart}
                        onProspectClick={setSelectedProspect}
                        userMap={userMap}
                        zoomLevel={zoomLevel}
                    />
                    <Column
                        title="Pausa"
                        icon={PauseCircleIcon}
                        prospects={prospects.filter(p => p.stage === 'En Pausa')}
                        onDrop={(e) => handleDrop(e, 'En Pausa')}
                        onDragOver={handleDragOver}
                        onDragStart={handleDragStart}
                        onProspectClick={setSelectedProspect}
                        userMap={userMap}
                        zoomLevel={zoomLevel}
                    />
                    <Column
                        title="Basura"
                        icon={TrashIcon}
                        prospects={prospects.filter(p => p.stage === 'Basura')}
                        onDrop={(e) => handleDrop(e, 'Basura')}
                        onDragOver={handleDragOver}
                        onDragStart={handleDragStart}
                        onProspectClick={setSelectedProspect}
                        userMap={userMap}
                        zoomLevel={zoomLevel}
                    />
                </div>
            </main>

            {/* Create Prospect Modal */}
            {isModalOpen && (
                <ProspectModal
                    onClose={() => setIsModalOpen(false)}
                    onSubmit={handleCreateProspect}
                />
            )}

            {/* View/Edit Prospect Modal */}
            {selectedProspect && (
                <ProspectDetailModal
                    prospect={selectedProspect}
                    onClose={() => setSelectedProspect(null)}
                    onDelete={handleDeleteProspect}
                    onMoveStage={handleMoveStage}
                    onUpdate={handleUpdateProspect}
                    userMap={userMap}
                />
            )}
        </div>
    );
}

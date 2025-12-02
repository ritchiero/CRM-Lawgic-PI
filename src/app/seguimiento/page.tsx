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
    ArrowLeftOnRectangleIcon
} from '@heroicons/react/24/outline';
import { Column, ProspectModal, ProspectDetailModal, type Prospect } from './components';
import {
    subscribeToProspects,
    createProspect,
    deleteProspect,
    moveProspectToStage
} from '@/services/prospectService';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { getAllUsers } from '@/services/authService';

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
    const [userMap, setUserMap] = useState<Record<string, string>>({});
    const { userData, logout } = useAuth();

    // Subscribe to prospects from Firestore
    useEffect(() => {
        const unsubscribe = subscribeToProspects((updatedProspects) => {
            setProspects(updatedProspects);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // Fetch all users to map UIDs to names
    useEffect(() => {
        const fetchUsers = async () => {
            const users = await getAllUsers();
            const map: Record<string, string> = {};
            users.forEach(user => {
                map[user.uid] = user.displayName;
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

    const handleLogout = async () => {
        try {
            await logout();
        } catch (error) {
            console.error('Error logging out:', error);
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
                padding: '1rem 2rem',
                borderBottom: '1px solid var(--border)',
                backgroundColor: 'var(--surface)',
                flexShrink: 0,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <h1 style={{
                    fontSize: '2rem',
                    fontWeight: '700',
                    color: 'var(--foreground)',
                    margin: 0
                }}>
                    Dashboard de seguimiento Lawgic PI
                </h1>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    {/* User Info */}
                    {userData && (
                        <div
                            onClick={() => window.location.href = '/perfil'}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                padding: '0.5rem 1rem',
                                backgroundColor: 'var(--background)',
                                borderRadius: '0.5rem',
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
                            <div style={{
                                width: '2rem',
                                height: '2rem',
                                borderRadius: '50%',
                                backgroundColor: 'var(--primary)',
                                color: 'white',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.875rem',
                                fontWeight: '600'
                            }}>
                                {userData.displayName ? userData.displayName.charAt(0).toUpperCase() : '?'}
                            </div>
                            <div>
                                <div style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--foreground)' }}>
                                    {userData.displayName || 'Usuario'}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--secondary)' }}>
                                    {userData.role === 'admin' ? 'Administrador' : 'Usuario'}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* New Prospect Button */}
                    <button
                        onClick={() => setIsModalOpen(true)}
                        style={{
                            padding: '0.75rem 1.5rem',
                            backgroundColor: 'var(--primary)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.5rem',
                            fontSize: '0.875rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            transition: 'all 0.2s'
                        }}
                    >
                        <PlusIcon style={{ width: '1.25rem', height: '1.25rem' }} />
                        Nuevo Prospecto
                    </button>

                    {/* Logout Button */}
                    <button
                        onClick={handleLogout}
                        style={{
                            padding: '0.75rem',
                            backgroundColor: 'transparent',
                            color: 'var(--secondary)',
                            border: '1px solid var(--border)',
                            borderRadius: '0.5rem',
                            fontSize: '0.875rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
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
                        <ArrowLeftOnRectangleIcon style={{ width: '1.125rem', height: '1.125rem' }} />
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
                    gap: '1.5rem',
                    overflowX: 'auto',
                    minWidth: 0
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
                    />
                    <Column
                        title="1er Contacto"
                        icon={PhoneIcon}
                        prospects={prospects.filter(p => p.stage === '1er Contacto')}
                        onDrop={(e) => handleDrop(e, '1er Contacto')}
                        onDragOver={handleDragOver}
                        onDragStart={handleDragStart}
                        onProspectClick={setSelectedProspect}
                        userMap={userMap}
                    />
                    <Column
                        title="Contacto efectivo"
                        icon={ChatBubbleLeftRightIcon}
                        prospects={prospects.filter(p => p.stage === 'Contacto efectivo')}
                        onDrop={(e) => handleDrop(e, 'Contacto efectivo')}
                        onDragOver={handleDragOver}
                        onDragStart={handleDragStart}
                        onProspectClick={setSelectedProspect}
                        userMap={userMap}
                    />
                    <Column
                        title="Muestra de interés"
                        icon={SparklesIcon}
                        prospects={prospects.filter(p => p.stage === 'Muestra de interés')}
                        onDrop={(e) => handleDrop(e, 'Muestra de interés')}
                        onDragOver={handleDragOver}
                        onDragStart={handleDragStart}
                        onProspectClick={setSelectedProspect}
                        userMap={userMap}
                    />
                    <Column
                        title="Cita para demo"
                        icon={CalendarDaysIcon}
                        prospects={prospects.filter(p => p.stage === 'Cita para demo')}
                        onDrop={(e) => handleDrop(e, 'Cita para demo')}
                        onDragOver={handleDragOver}
                        onDragStart={handleDragStart}
                        onProspectClick={setSelectedProspect}
                        userMap={userMap}
                    />
                    <Column
                        title="Demo realizada"
                        icon={PresentationChartLineIcon}
                        prospects={prospects.filter(p => p.stage === 'Demo realizada')}
                        onDrop={(e) => handleDrop(e, 'Demo realizada')}
                        onDragOver={handleDragOver}
                        onDragStart={handleDragStart}
                        onProspectClick={setSelectedProspect}
                        userMap={userMap}
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
                    />
                    <Column
                        title="En Pausa"
                        icon={PauseCircleIcon}
                        prospects={prospects.filter(p => p.stage === 'En Pausa')}
                        onDrop={(e) => handleDrop(e, 'En Pausa')}
                        onDragOver={handleDragOver}
                        onDragStart={handleDragStart}
                        onProspectClick={setSelectedProspect}
                        userMap={userMap}
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
                    userMap={userMap}
                />
            )}
        </div>
    );
}

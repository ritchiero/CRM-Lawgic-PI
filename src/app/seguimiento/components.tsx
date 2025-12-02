"use client";

import { useState } from 'react';
import { PlusIcon, PlusCircleIcon, XMarkIcon, PencilIcon, TrashIcon, PauseCircleIcon } from '@heroicons/react/24/outline';

export interface Prospect {
    id: string;
    name: string;
    company: string;
    email: string;
    phone: string;
    notes: string;
    stage: string;
    createdAt: Date;
    createdBy: string;
    history: Array<{
        stage: string;
        date: Date;
        movedBy?: string;
    }>;
}

export function Column({
    title,
    icon: Icon,
    prospects = [],
    onAddClick,
    showAddButton = false,
    onDrop,
    onDragOver,
    onDragStart,
    onProspectClick,
    userMap = {}
}: {
    title: string;
    icon: React.ElementType;
    prospects?: Prospect[];
    onAddClick?: () => void;
    showAddButton?: boolean;
    onDrop?: (e: React.DragEvent) => void;
    onDragOver?: (e: React.DragEvent) => void;
    onDragStart?: (e: React.DragEvent, prospectId: string) => void;
    onProspectClick?: (prospect: Prospect) => void;
    userMap?: Record<string, string>;
}) {
    return (
        <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            style={{
                minWidth: '280px',
                backgroundColor: 'var(--background)',
                borderRadius: '0.75rem',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem'
            }}>
            <h3 style={{
                fontSize: '0.875rem',
                fontWeight: '600',
                color: 'var(--foreground)',
                margin: 0,
                padding: '0.5rem',
                borderBottom: '2px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
            }}>
                <Icon style={{ width: '1.25rem', height: '1.25rem', color: 'var(--primary)' }} />
                {title}
            </h3>

            {/* Column content area */}
            <div style={{
                flex: 1,
                minHeight: '200px',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem'
            }}>
                {prospects.map(prospect => (
                    <ProspectCard
                        key={prospect.id}
                        prospect={prospect}
                        onDragStart={(e) => onDragStart?.(e, prospect.id)}
                        onClick={() => onProspectClick?.(prospect)}
                        userMap={userMap}
                    />
                ))}

                {showAddButton && (
                    <button
                        onClick={onAddClick}
                        style={{
                            padding: '0.75rem',
                            backgroundColor: 'transparent',
                            border: '2px dashed var(--border)',
                            borderRadius: '0.5rem',
                            color: 'var(--secondary)',
                            fontSize: '0.875rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            transition: 'all 0.2s'
                        }}
                    >
                        <PlusIcon style={{ width: '1rem', height: '1rem' }} />
                        Agregar prospecto
                    </button>
                )}
            </div>
        </div>
    );
}

export function ProspectCard({
    prospect,
    onDragStart,
    onClick,
    userMap = {}
}: {
    prospect: Prospect;
    onDragStart?: (e: React.DragEvent) => void;
    onClick?: () => void;
    userMap?: Record<string, string>;
}) {
    // Get creator display name
    const creatorName = userMap[prospect.createdBy] || prospect.createdBy;
    const isAnonymous = prospect.createdBy === 'anonymous';
    const displayName = isAnonymous ? '?' : (userMap[prospect.createdBy] ? userMap[prospect.createdBy].substring(0, 2).toUpperCase() : prospect.createdBy.substring(0, 2).toUpperCase());

    return (
        <div
            draggable
            onDragStart={onDragStart} // Now directly uses the prop
            onClick={onClick}
            className={prospect.stage === 'En Pausa' ? 'paused-glow' : ''}
            style={{
                padding: '1rem',
                backgroundColor: prospect.stage === 'En Pausa' ? '#FEF3C7' : 'var(--background)',
                borderRadius: '0.5rem',
                border: '1px solid var(--border)',
                cursor: 'grab',
                transition: 'all 0.2s',
                marginBottom: '0.75rem'
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
            }}
        >
            {/* Header with name and creator */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <div style={{
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    color: 'var(--foreground)',
                    flex: 1
                }}>
                    {prospect.name}
                </div>
                {/* Creator Badge */}
                <div
                    title={`Creado por: ${creatorName}`}
                    style={{
                        width: '1.5rem',
                        height: '1.5rem',
                        borderRadius: '50%',
                        backgroundColor: 'var(--primary)',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.625rem',
                        fontWeight: '600',
                        flexShrink: 0,
                        marginLeft: '0.5rem'
                    }}
                >
                    {displayName}
                </div>
            </div>

            <div style={{ fontSize: '0.75rem', color: 'var(--secondary)', marginBottom: '0.5rem' }}>
                {prospect.company}
            </div>
            <div style={{
                fontSize: '0.75rem',
                color: 'var(--secondary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
            }}>
                {prospect.email}
            </div>
        </div>
    );
}

export function ProspectModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (prospect: Omit<Prospect, 'id' | 'createdAt' | 'stage' | 'history' | 'createdBy'>) => void }) {
    const [formData, setFormData] = useState({
        name: '',
        company: '',
        email: '',
        phone: '',
        notes: '',
        countryCode: '+52'
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const phoneWithCode = formData.phone ? `${formData.countryCode} ${formData.phone}` : '';
        onSubmit({
            name: formData.name,
            company: formData.company,
            email: formData.email,
            phone: phoneWithCode,
            notes: formData.notes
        });
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            fontFamily: 'var(--font-plus-jakarta)'
        }} onClick={onClose}>
            <div style={{
                backgroundColor: 'var(--surface)',
                borderRadius: '1rem',
                padding: '2rem',
                width: '90%',
                maxWidth: '500px',
                border: '1px solid var(--border)'
            }} onClick={(e) => e.stopPropagation()}>
                <h2 style={{
                    fontSize: '1.5rem',
                    fontWeight: '700',
                    color: 'var(--foreground)',
                    marginBottom: '1.5rem',
                    margin: 0
                }}>
                    Nuevo Prospecto
                </h2>

                <form onSubmit={handleSubmit}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: 'var(--foreground)', marginBottom: '0.5rem' }}>
                                Nombre *
                            </label>
                            <input
                                required
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                style={{
                                    width: '100%',
                                    padding: '0.75rem',
                                    backgroundColor: 'var(--background)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '0.5rem',
                                    color: 'var(--foreground)',
                                    fontSize: '0.875rem'
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: 'var(--foreground)', marginBottom: '0.5rem' }}>
                                Firma / Despacho / Empresa *
                            </label>
                            <input
                                required
                                value={formData.company}
                                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                                style={{
                                    width: '100%',
                                    padding: '0.75rem',
                                    backgroundColor: 'var(--background)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '0.5rem',
                                    color: 'var(--foreground)',
                                    fontSize: '0.875rem'
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: 'var(--foreground)', marginBottom: '0.5rem' }}>
                                Email
                            </label>
                            <input
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                style={{
                                    width: '100%',
                                    padding: '0.75rem',
                                    backgroundColor: 'var(--background)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '0.5rem',
                                    color: 'var(--foreground)',
                                    fontSize: '0.875rem'
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: 'var(--foreground)', marginBottom: '0.5rem' }}>
                                Teléfono Móvil / WhatsApp
                            </label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <select
                                    value={formData.countryCode}
                                    onChange={(e) => setFormData({ ...formData, countryCode: e.target.value })}
                                    style={{
                                        padding: '0.75rem',
                                        backgroundColor: 'var(--background)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '0.5rem',
                                        color: 'var(--foreground)',
                                        fontSize: '0.875rem',
                                        width: '110px'
                                    }}
                                >
                                    <option value="+52">🇲🇽 +52</option>
                                    <option value="+1">🇺🇸 +1</option>
                                    <option value="+34">🇪🇸 +34</option>
                                    <option value="+54">🇦🇷 +54</option>
                                    <option value="+57">🇨🇴 +57</option>
                                    <option value="+56">🇨🇱 +56</option>
                                    <option value="+51">🇵🇪 +51</option>
                                    <option value="+593">🇪🇨 +593</option>
                                </select>
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    placeholder="5512345678"
                                    style={{
                                        flex: 1,
                                        padding: '0.75rem',
                                        backgroundColor: 'var(--background)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '0.5rem',
                                        color: 'var(--foreground)',
                                        fontSize: '0.875rem'
                                    }}
                                />
                            </div>
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: 'var(--foreground)', marginBottom: '0.5rem' }}>
                                Notas
                            </label>
                            <textarea
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                rows={3}
                                style={{
                                    width: '100%',
                                    padding: '0.75rem',
                                    backgroundColor: 'var(--background)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '0.5rem',
                                    color: 'var(--foreground)',
                                    fontSize: '0.875rem',
                                    resize: 'vertical',
                                    fontFamily: 'inherit'
                                }}
                            />

                            {/* Quick Tags */}
                            <div style={{ marginTop: '0.75rem' }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--secondary)', marginBottom: '0.5rem' }}>
                                    Etiquetas rápidas:
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    {['Cliente Lawgic', '+100 marcas', '+500 marcas', '+1,000 Marcas', '+2,000 marcas', 'Ya conoce el producto', 'Formulario web', 'Amigo de Ricardo', 'Amigo de Roberto', 'Referencia', 'Recontacto'].map(tag => (
                                        <button
                                            key={tag}
                                            type="button"
                                            onClick={() => {
                                                const newNotes = formData.notes ? `${formData.notes}, ${tag}` : tag;
                                                setFormData({ ...formData, notes: newNotes });
                                            }}
                                            style={{
                                                padding: '0.375rem 0.75rem',
                                                backgroundColor: 'transparent',
                                                border: '1px solid var(--border)',
                                                borderRadius: '1rem',
                                                color: 'var(--secondary)',
                                                fontSize: '0.75rem',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                whiteSpace: 'nowrap',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.25rem'
                                            }}
                                            onMouseOver={(e) => {
                                                e.currentTarget.style.backgroundColor = 'var(--primary)';
                                                e.currentTarget.style.color = 'white';
                                                e.currentTarget.style.borderColor = 'var(--primary)';
                                            }}
                                            onMouseOut={(e) => {
                                                e.currentTarget.style.backgroundColor = 'transparent';
                                                e.currentTarget.style.color = 'var(--secondary)';
                                                e.currentTarget.style.borderColor = 'var(--border)';
                                            }}
                                        >
                                            <PlusCircleIcon style={{ width: '0.875rem', height: '0.875rem' }} />
                                            {tag}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                flex: 1,
                                padding: '0.75rem',
                                backgroundColor: 'transparent',
                                border: '1px solid var(--border)',
                                borderRadius: '0.5rem',
                                color: 'var(--foreground)',
                                fontSize: '0.875rem',
                                fontWeight: '600',
                                cursor: 'pointer'
                            }}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            style={{
                                flex: 1,
                                padding: '0.75rem',
                                backgroundColor: 'var(--primary)',
                                border: 'none',
                                borderRadius: '0.5rem',
                                color: 'white',
                                fontSize: '0.875rem',
                                fontWeight: '600',
                                cursor: 'pointer'
                            }}
                        >
                            Crear Prospecto
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export function ProspectDetailModal({
    prospect,
    onClose,
    onDelete,
    onMoveStage,
    userMap = {}
}: {
    prospect: Prospect;
    onClose: () => void;
    onDelete: (id: string) => void;
    onMoveStage: (id: string, stage: string) => void;
    userMap?: Record<string, string>;
}) {
    const creatorName = userMap[prospect.createdBy] || prospect.createdBy;
    const isAnonymous = prospect.createdBy === 'anonymous';
    const creatorInitials = isAnonymous ? '?' : (userMap[prospect.createdBy] ? userMap[prospect.createdBy].substring(0, 2).toUpperCase() : prospect.createdBy.substring(0, 2).toUpperCase());
    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    zIndex: 40,
                    backdropFilter: 'blur(4px)',
                    transition: 'all 0.3s'
                }}
            />

            {/* Modal Panel */}
            <div style={{
                position: 'fixed',
                top: 0,
                right: 0,
                bottom: 0,
                width: '500px',
                backgroundColor: 'var(--surface)',
                boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.15)',
                zIndex: 50,
                display: 'flex',
                flexDirection: 'column',
                animation: 'slideIn 0.3s ease-out'
            }}>
                {/* Header */}
                <div style={{
                    padding: '1.5rem',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--foreground)', margin: 0 }}>
                        Detalles del Prospecto
                    </h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--secondary)',
                            padding: '0.5rem',
                            borderRadius: '0.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--background)';
                            e.currentTarget.style.color = 'var(--foreground)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.color = 'var(--secondary)';
                        }}
                    >
                        <XMarkIcon style={{ width: '1.5rem', height: '1.5rem' }} />
                    </button>
                </div>

                {/* Content */}
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '1.5rem'
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {/* Name */}
                        <div>
                            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--secondary)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                                Nombre
                            </div>
                            <div style={{ fontSize: '1rem', color: 'var(--foreground)', fontWeight: '600' }}>
                                {prospect.name}
                            </div>
                        </div>

                        {/* Company */}
                        <div>
                            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--secondary)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                                Firma / Despacho / Empresa
                            </div>
                            <div style={{ fontSize: '1rem', color: 'var(--foreground)' }}>
                                {prospect.company}
                            </div>
                        </div>

                        {/* Creator */}
                        <div>
                            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--secondary)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                                Creado Por
                            </div>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                padding: '0.75rem',
                                backgroundColor: 'var(--background)',
                                borderRadius: '0.5rem',
                                border: '1px solid var(--border)'
                            }}>
                                <div style={{
                                    width: '2rem',
                                    height: '2rem',
                                    borderRadius: '50%',
                                    backgroundColor: 'var(--primary)',
                                    color: 'white',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.75rem',
                                    fontWeight: '600',
                                    flexShrink: 0
                                }}>
                                    {creatorInitials}
                                </div>
                                <div style={{ fontSize: '0.875rem', color: 'var(--foreground)', fontFamily: 'var(--font-plus-jakarta)' }}>
                                    {creatorName}
                                </div>
                            </div>
                        </div>

                        {/* Email */}
                        {prospect.email && (
                            <div>
                                <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--secondary)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                                    Email
                                </div>
                                <a href={`mailto:${prospect.email}`} style={{ fontSize: '1rem', color: 'var(--primary)', textDecoration: 'none' }}>
                                    {prospect.email}
                                </a>
                            </div>
                        )}

                        {/* Phone */}
                        {prospect.phone && (
                            <div>
                                <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--secondary)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                                    Teléfono / WhatsApp
                                </div>
                                <a href={`tel:${prospect.phone}`} style={{ fontSize: '1rem', color: 'var(--primary)', textDecoration: 'none' }}>
                                    {prospect.phone}
                                </a>
                            </div>
                        )}

                        {/* Stage */}
                        <div>
                            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--secondary)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                                Etapa Actual
                            </div>
                            <div style={{
                                display: 'inline-block',
                                padding: '0.5rem 1rem',
                                backgroundColor: 'var(--primary)',
                                borderRadius: '1rem',
                                fontSize: '0.875rem',
                                color: 'white',
                                fontWeight: '600'
                            }}>
                                {prospect.stage}
                            </div>
                        </div>

                        {/* Notes */}
                        {prospect.notes && (
                            <div>
                                <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--secondary)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                                    Notas
                                </div>
                                <div style={{
                                    fontSize: '0.875rem',
                                    color: 'var(--foreground)',
                                    padding: '1rem',
                                    backgroundColor: 'var(--background)',
                                    borderRadius: '0.5rem',
                                    whiteSpace: 'pre-wrap'
                                }}>
                                    {prospect.notes}
                                </div>
                            </div>
                        )}

                        {/* History */}
                        <div>
                            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--secondary)', marginBottom: '0.75rem', textTransform: 'uppercase' }}>
                                Historial
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {prospect.history.map((entry, index) => (
                                    <div key={index} style={{
                                        padding: '0.75rem',
                                        backgroundColor: 'var(--background)',
                                        borderRadius: '0.5rem',
                                        borderLeft: '3px solid var(--primary)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                                            <div style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--foreground)' }}>
                                                {entry.stage}
                                            </div>
                                            {entry.movedBy && (
                                                <div
                                                    title={`Por: ${userMap[entry.movedBy] || entry.movedBy}`}
                                                    style={{
                                                        width: '1.25rem',
                                                        height: '1.25rem',
                                                        borderRadius: '50%',
                                                        backgroundColor: 'var(--primary)',
                                                        color: 'white',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: '0.5rem',
                                                        fontWeight: '600',
                                                        flexShrink: 0
                                                    }}
                                                >
                                                    {userMap[entry.movedBy] ? userMap[entry.movedBy].substring(0, 2).toUpperCase() : (entry.movedBy === 'anonymous' ? '?' : entry.movedBy.substring(0, 2).toUpperCase())}
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--secondary)' }}>
                                            {new Date(entry.date).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div style={{
                    padding: '1.5rem',
                    borderTop: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem'
                }}>
                    {/* Quick Actions */}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                            onClick={() => onMoveStage(prospect.id, 'En Pausa')}
                            onMouseOver={(e) => {
                                e.currentTarget.style.backgroundColor = '#f59e0b';
                                e.currentTarget.style.borderColor = '#f59e0b';
                                e.currentTarget.style.color = 'white';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = 'var(--background)';
                                e.currentTarget.style.borderColor = 'var(--border)';
                                e.currentTarget.style.color = 'var(--foreground)';
                            }}
                            style={{
                                flex: 1,
                                padding: '0.75rem',
                                backgroundColor: 'var(--background)',
                                border: '1px solid var(--border)',
                                borderRadius: '0.5rem',
                                color: 'var(--foreground)',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.375rem',
                                boxShadow: '0 4px 0 0 rgba(245, 158, 11, 0.3)'
                            }}
                        >
                            <PauseCircleIcon style={{ width: '1rem', height: '1rem' }} />
                            Pausar
                        </button>
                        <button
                            onClick={() => {
                                if (confirm('¿Mover a Basura?')) {
                                    onMoveStage(prospect.id, 'Basura');
                                }
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.backgroundColor = '#ef4444';
                                e.currentTarget.style.borderColor = '#ef4444';
                                e.currentTarget.style.color = 'white';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = 'var(--background)';
                                e.currentTarget.style.borderColor = 'var(--border)';
                                e.currentTarget.style.color = 'var(--foreground)';
                            }}
                            style={{
                                flex: 1,
                                padding: '0.75rem',
                                backgroundColor: 'var(--background)',
                                border: '1px solid var(--border)',
                                borderRadius: '0.5rem',
                                color: 'var(--foreground)',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.375rem',
                                boxShadow: '0 4px 0 0 rgba(239, 68, 68, 0.3)'
                            }}
                        >
                            <TrashIcon style={{ width: '1rem', height: '1rem' }} />
                            Basura
                        </button>
                    </div>

                    {/* Main Actions */}
                    {/* Main Actions */}
                    {/* Edit button removed until implementation */}

                    <button
                        onClick={() => {
                            if (confirm(`¿Estás seguro de eliminar a ${prospect.name}?`)) {
                                onDelete(prospect.id);
                            }
                        }}
                        style={{
                            width: '100%',
                            padding: '0.75rem',
                            backgroundColor: 'transparent',
                            border: '1px solid #ef4444',
                            borderRadius: '0.5rem',
                            color: '#ef4444',
                            fontSize: '0.875rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem'
                        }}
                    >
                        <TrashIcon style={{ width: '1.125rem', height: '1.125rem' }} />
                        Eliminar Prospecto
                    </button>
                </div>
            </div>
        </>
    );
}

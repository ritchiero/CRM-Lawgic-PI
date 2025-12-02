"use client";

import React from 'react';

// Paleta de colores de avatar alineada con la marca
export const AVATAR_COLORS = [
    { id: 'blue', label: 'Azul', value: '#2563eb' },
    { id: 'indigo', label: 'Índigo', value: '#4f46e5' },
    { id: 'violet', label: 'Violeta', value: '#7c3aed' },
    { id: 'purple', label: 'Púrpura', value: '#9333ea' },
    { id: 'fuchsia', label: 'Fucsia', value: '#c026d3' },
    { id: 'pink', label: 'Rosa', value: '#db2777' },
    { id: 'rose', label: 'Coral', value: '#e11d48' },
    { id: 'orange', label: 'Naranja', value: '#ea580c' },
    { id: 'amber', label: 'Ámbar', value: '#d97706' },
    { id: 'emerald', label: 'Esmeralda', value: '#059669' },
    { id: 'teal', label: 'Teal', value: '#0d9488' },
    { id: 'cyan', label: 'Cian', value: '#0891b2' },
] as const;

export type AvatarColorId = typeof AVATAR_COLORS[number]['id'];

// Genera un color determinista desde un string (userId o nombre)
export function getDefaultAvatarColor(identifier: string): string {
    if (!identifier) return AVATAR_COLORS[0].value;
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < identifier.length; i++) {
        const char = identifier.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    
    const index = Math.abs(hash) % AVATAR_COLORS.length;
    return AVATAR_COLORS[index].value;
}

// Obtiene el color de avatar a mostrar (prioriza el seleccionado por el usuario)
export function getAvatarColor(avatarColor?: string | null, userId?: string): string {
    // Si el usuario tiene un color seleccionado, usarlo
    if (avatarColor) {
        // Verificar si es un id de color o un valor hex
        const colorById = AVATAR_COLORS.find(c => c.id === avatarColor);
        if (colorById) return colorById.value;
        // Si es un valor hex directo
        if (avatarColor.startsWith('#')) return avatarColor;
    }
    
    // Generar color determinista desde el userId
    if (userId) {
        return getDefaultAvatarColor(userId);
    }
    
    // Fallback al primer color (azul)
    return AVATAR_COLORS[0].value;
}

interface AvatarProps {
    name?: string;
    avatarColor?: string | null;
    userId?: string;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    style?: React.CSSProperties;
    className?: string;
}

const SIZE_MAP = {
    xs: { width: '1.25rem', height: '1.25rem', fontSize: '0.5rem' },
    sm: { width: '1.5rem', height: '1.5rem', fontSize: '0.75rem' },
    md: { width: '1.75rem', height: '1.75rem', fontSize: '0.75rem' },
    lg: { width: '2.25rem', height: '2.25rem', fontSize: '0.875rem' },
    xl: { width: '6rem', height: '6rem', fontSize: '2.5rem' },
};

export function Avatar({ 
    name, 
    avatarColor, 
    userId, 
    size = 'md', 
    style,
    className 
}: AvatarProps) {
    const initial = name ? name.charAt(0).toUpperCase() : '?';
    const backgroundColor = getAvatarColor(avatarColor, userId);
    const sizeStyles = SIZE_MAP[size];
    
    return (
        <div
            className={className}
            style={{
                ...sizeStyles,
                borderRadius: '50%',
                backgroundColor,
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '600',
                flexShrink: 0,
                ...style,
            }}
        >
            {initial}
        </div>
    );
}

interface AvatarColorPickerProps {
    selectedColor?: string | null;
    onColorSelect: (colorId: string) => void;
}

export function AvatarColorPicker({ selectedColor, onColorSelect }: AvatarColorPickerProps) {
    const currentColorId = selectedColor || 'blue';
    
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label style={{ 
                display: 'block', 
                fontSize: '0.875rem', 
                fontWeight: '500', 
                color: 'var(--foreground)', 
                marginBottom: '0.25rem' 
            }}>
                Color del Avatar
            </label>
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(6, 1fr)',
                gap: '0.5rem',
            }}>
                {AVATAR_COLORS.map((color) => (
                    <button
                        key={color.id}
                        type="button"
                        onClick={() => onColorSelect(color.id)}
                        title={color.label}
                        style={{
                            width: '2.5rem',
                            height: '2.5rem',
                            borderRadius: '50%',
                            backgroundColor: color.value,
                            border: currentColorId === color.id 
                                ? '3px solid var(--foreground)' 
                                : '3px solid transparent',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            outline: 'none',
                            boxShadow: currentColorId === color.id 
                                ? '0 0 0 2px var(--background), 0 0 0 4px var(--foreground)'
                                : 'none',
                        }}
                        onMouseEnter={(e) => {
                            if (currentColorId !== color.id) {
                                e.currentTarget.style.transform = 'scale(1.1)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'scale(1)';
                        }}
                    />
                ))}
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--secondary)', marginTop: '0.25rem' }}>
                Este color identificará tu avatar en todo el CRM.
            </p>
        </div>
    );
}

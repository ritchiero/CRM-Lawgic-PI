"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { updateUserProfile } from '@/services/authService';
import ProtectedRoute from '@/components/ProtectedRoute';
import { ArrowLeftIcon, UserCircleIcon, CheckCircleIcon } from '@heroicons/react/24/outline';

export default function ProfilePage() {
    return (
        <ProtectedRoute>
            <ProfileContent />
        </ProtectedRoute>
    );
}

function ProfileContent() {
    const { userData, user } = useAuth();
    const router = useRouter();
    const [displayName, setDisplayName] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        if (userData) {
            setDisplayName(userData.displayName || '');
        }
    }, [userData]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        try {
            if (!user) throw new Error('No user found');

            await updateUserProfile(user.uid, {
                displayName
            });

            setMessage({ type: 'success', text: 'Perfil actualizado correctamente' });

            // Reload page to refresh context if needed, or context should auto-update if it listens to auth changes
            // But auth changes might not trigger on firestore update unless we listen to firestore doc
            // For now, let's just show success
        } catch (error) {
            console.error('Error updating profile:', error);
            setMessage({ type: 'error', text: 'Error al actualizar el perfil' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            backgroundColor: 'var(--background)',
            fontFamily: 'var(--font-plus-jakarta)',
            padding: '2rem'
        }}>
            <div style={{
                maxWidth: '600px',
                margin: '0 auto'
            }}>
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
                    <h1 style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--foreground)' }}>
                        Configuración de Perfil
                    </h1>
                    <p style={{ color: 'var(--secondary)' }}>
                        Actualiza tu información personal para que tus compañeros te identifiquen.
                    </p>
                </div>

                {/* Profile Form */}
                <div style={{
                    backgroundColor: 'var(--surface)',
                    borderRadius: '1rem',
                    border: '1px solid var(--border)',
                    padding: '2rem'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
                        <div style={{
                            width: '6rem',
                            height: '6rem',
                            borderRadius: '50%',
                            backgroundColor: 'var(--primary)',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '2.5rem',
                            fontWeight: '600'
                        }}>
                            {displayName ? displayName.charAt(0).toUpperCase() : '?'}
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: 'var(--foreground)', marginBottom: '0.5rem' }}>
                                Nombre Completo
                            </label>
                            <input
                                type="text"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                placeholder="Ej. Juan Pérez"
                                required
                                style={{
                                    width: '100%',
                                    padding: '0.75rem',
                                    backgroundColor: 'var(--background)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '0.5rem',
                                    color: 'var(--foreground)',
                                    fontSize: '1rem'
                                }}
                            />
                            <p style={{ fontSize: '0.75rem', color: 'var(--secondary)', marginTop: '0.25rem' }}>
                                Este nombre aparecerá en los prospectos que crees y muevas.
                            </p>
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: 'var(--foreground)', marginBottom: '0.5rem' }}>
                                Email
                            </label>
                            <input
                                type="email"
                                value={userData?.email || ''}
                                disabled
                                style={{
                                    width: '100%',
                                    padding: '0.75rem',
                                    backgroundColor: 'rgba(0,0,0,0.2)', // Dimmed for disabled
                                    border: '1px solid var(--border)',
                                    borderRadius: '0.5rem',
                                    color: 'var(--secondary)',
                                    fontSize: '1rem',
                                    cursor: 'not-allowed'
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: 'var(--foreground)', marginBottom: '0.5rem' }}>
                                Rol
                            </label>
                            <div style={{
                                padding: '0.75rem',
                                backgroundColor: 'rgba(0,0,0,0.2)',
                                border: '1px solid var(--border)',
                                borderRadius: '0.5rem',
                                color: 'var(--secondary)',
                                fontSize: '1rem',
                                display: 'inline-block'
                            }}>
                                {userData?.role === 'admin' ? 'Administrador' : 'Usuario'}
                            </div>
                        </div>

                        {message && (
                            <div style={{
                                padding: '0.75rem',
                                borderRadius: '0.5rem',
                                backgroundColor: message.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                border: `1px solid ${message.type === 'success' ? '#10b981' : '#ef4444'}`,
                                color: message.type === 'success' ? '#10b981' : '#ef4444',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}>
                                {message.type === 'success' && <CheckCircleIcon style={{ width: '1.25rem', height: '1.25rem' }} />}
                                {message.text}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                padding: '0.875rem',
                                backgroundColor: 'var(--primary)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '0.5rem',
                                fontSize: '1rem',
                                fontWeight: '600',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s',
                                marginTop: '1rem'
                            }}
                        >
                            {loading ? 'Guardando...' : 'Guardar Cambios'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}

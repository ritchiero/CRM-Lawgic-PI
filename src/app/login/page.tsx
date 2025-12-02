"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { resetPassword } from '@/services/authService';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showResetPassword, setShowResetPassword] = useState(false);
    const [resetEmail, setResetEmail] = useState('');
    const [resetMessage, setResetMessage] = useState('');

    const { login, loginWithGoogle } = useAuth();
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await login(email, password);
            router.push('/seguimiento');
        } catch (err: any) {
            setError(err.message || 'Error al iniciar sesión');
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setError('');
        setLoading(true);

        try {
            await loginWithGoogle();
            router.push('/seguimiento');
        } catch (err: any) {
            setError(err.message || 'Error al iniciar sesión con Google');
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setResetMessage('');
        setLoading(true);

        try {
            await resetPassword(resetEmail);
            setResetMessage('Se ha enviado un enlace de recuperación a tu email');
            setResetEmail('');
            setTimeout(() => {
                setShowResetPassword(false);
                setResetMessage('');
            }, 3000);
        } catch (err: any) {
            setError(err.message || 'Error al enviar enlace de recuperación');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(to bottom right, #0f172a, #1e293b)',
            padding: '2rem',
            fontFamily: 'var(--font-plus-jakarta)'
        }}>
            <div style={{
                width: '100%',
                maxWidth: '420px',
                padding: '3rem',
                backgroundColor: 'rgba(30, 41, 59, 0.5)',
                borderRadius: '1.5rem',
                border: '1px solid rgba(255,255,255,0.05)',
                backdropFilter: 'blur(10px)'
            }}>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#94a3b8', marginBottom: '0.5rem' }}>
                        <span style={{ color: '#3b82f6' }}>Lawgic PI</span> CRM
                    </div>
                    <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#f8fafc', marginBottom: '0.5rem' }}>
                        {showResetPassword ? 'Recuperar Contraseña' : 'Iniciar Sesión'}
                    </h1>
                    <p style={{ fontSize: '0.875rem', color: '#64748b' }}>
                        {showResetPassword ? 'Ingresa tu email para recibir enlace' : 'Acceso autorizado para el equipo interno'}
                    </p>
                </div>

                {!showResetPassword ? (
                    <>
                        {/* Error Message */}
                        {error && (
                            <div style={{
                                padding: '0.75rem',
                                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                borderRadius: '0.5rem',
                                color: '#fca5a5',
                                fontSize: '0.875rem',
                                marginBottom: '1.5rem'
                            }}>
                                {error}
                            </div>
                        )}

                        {/* Login Form */}
                        <form onSubmit={handleSubmit}>
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label htmlFor="email" style={{
                                    display: 'block',
                                    fontSize: '0.875rem',
                                    fontWeight: '500',
                                    color: '#cbd5e1',
                                    marginBottom: '0.5rem'
                                }}>
                                    Email
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="admin@lawgic.com"
                                    required
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem 1rem',
                                        backgroundColor: 'rgba(15, 23, 42, 0.5)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '0.5rem',
                                        color: '#f8fafc',
                                        fontSize: '1rem',
                                        outline: 'none',
                                        transition: 'border-color 0.2s'
                                    }}
                                    onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                                    onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                                />
                            </div>

                            <div style={{ marginBottom: '2rem' }}>
                                <label htmlFor="password" style={{
                                    display: 'block',
                                    fontSize: '0.875rem',
                                    fontWeight: '500',
                                    color: '#cbd5e1',
                                    marginBottom: '0.5rem'
                                }}>
                                    Contraseña
                                </label>
                                <input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem 1rem',
                                        backgroundColor: 'rgba(15, 23, 42, 0.5)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '0.5rem',
                                        color: '#f8fafc',
                                        fontSize: '1rem',
                                        outline: 'none',
                                        transition: 'border-color 0.2s'
                                    }}
                                    onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                                    onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                style={{
                                    width: '100%',
                                    padding: '0.875rem',
                                    backgroundColor: loading ? '#1e40af' : '#3b82f6',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '0.75rem',
                                    fontSize: '1rem',
                                    fontWeight: '600',
                                    cursor: loading ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.2s',
                                    boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.2)'
                                }}
                            >
                                {loading ? 'Ingresando...' : 'Ingresar'}
                            </button>
                        </form>

                        {/* Divider */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            margin: '1.5rem 0',
                            gap: '1rem'
                        }}>
                            <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.1)' }}></div>
                            <div style={{ fontSize: '0.875rem', color: '#64748b' }}>o continúa con</div>
                            <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.1)' }}></div>
                        </div>

                        {/* Google Sign-in Button */}
                        <button
                            type="button"
                            onClick={handleGoogleSignIn}
                            disabled={loading}
                            style={{
                                width: '100%',
                                padding: '0.875rem',
                                backgroundColor: 'white',
                                color: '#1f2937',
                                border: '1px solid rgba(255,255,255,0.2)',
                                borderRadius: '0.75rem',
                                fontSize: '1rem',
                                fontWeight: '600',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.75rem'
                            }}
                        >
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                <path d="M19.6 10.2273C19.6 9.51819 19.5364 8.83637 19.4182 8.18182H10V12.05H15.3818C15.15 13.3 14.4455 14.3591 13.3864 15.0682V17.5773H16.6182C18.5091 15.8364 19.6 13.2727 19.6 10.2273Z" fill="#4285F4" />
                                <path d="M10 20C12.7 20 14.9636 19.1045 16.6182 17.5773L13.3864 15.0682C12.4909 15.6682 11.3455 16.0227 10 16.0227C7.39545 16.0227 5.19091 14.2636 4.40455 11.9H1.06364V14.4909C2.70909 17.7591 6.09091 20 10 20Z" fill="#34A853" />
                                <path d="M4.40455 11.9C4.20455 11.3 4.09091 10.6591 4.09091 10C4.09091 9.34091 4.20455 8.7 4.40455 8.1V5.50909H1.06364C0.386364 6.85909 0 8.38636 0 10C0 11.6136 0.386364 13.1409 1.06364 14.4909L4.40455 11.9Z" fill="#FBBC05" />
                                <path d="M10 3.97727C11.4682 3.97727 12.7864 4.48182 13.8227 5.47273L16.6909 2.60455C14.9591 0.990909 12.6955 0 10 0C6.09091 0 2.70909 2.24091 1.06364 5.50909L4.40455 8.1C5.19091 5.73636 7.39545 3.97727 10 3.97727Z" fill="#EA4335" />
                            </svg>
                            {loading ? 'Iniciando...' : 'Continuar con Google'}
                        </button>

                        {/* Forgot Password Link */}
                        <button
                            type="button"
                            onClick={() => setShowResetPassword(true)}
                            style={{
                                width: '100%',
                                marginTop: '1rem',
                                background: 'none',
                                border: 'none',
                                color: '#3b82f6',
                                fontSize: '0.875rem',
                                cursor: 'pointer',
                                textAlign: 'center'
                            }}
                        >
                            ¿Olvidaste tu contraseña?
                        </button>

                        {/* Footer */}
                        <div style={{
                            marginTop: '2rem',
                            paddingTop: '1.5rem',
                            borderTop: '1px solid rgba(255,255,255,0.05)',
                            textAlign: 'center'
                        }}>
                            <p style={{ fontSize: '0.875rem', color: '#64748b' }}>
                                ¿No tienes cuenta? Contacta al administrador.
                            </p>
                        </div>
                    </>
                ) : (
                    <>
                        {/* Error Message */}
                        {error && (
                            <div style={{
                                padding: '0.75rem',
                                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                borderRadius: '0.5rem',
                                color: '#fca5a5',
                                fontSize: '0.875rem',
                                marginBottom: '1.5rem'
                            }}>
                                {error}
                            </div>
                        )}

                        {/* Success Message */}
                        {resetMessage && (
                            <div style={{
                                padding: '0.75rem',
                                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                borderRadius: '0.5rem',
                                color: '#6ee7b7',
                                fontSize: '0.875rem',
                                marginBottom: '1.5rem'
                            }}>
                                {resetMessage}
                            </div>
                        )}

                        {/* Reset Password Form */}
                        <form onSubmit={handleResetPassword}>
                            <div style={{ marginBottom: '2rem' }}>
                                <label htmlFor="resetEmail" style={{
                                    display: 'block',
                                    fontSize: '0.875rem',
                                    fontWeight: '500',
                                    color: '#cbd5e1',
                                    marginBottom: '0.5rem'
                                }}>
                                    Email
                                </label>
                                <input
                                    id="resetEmail"
                                    type="email"
                                    value={resetEmail}
                                    onChange={(e) => setResetEmail(e.target.value)}
                                    placeholder="admin@lawgic.com"
                                    required
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem 1rem',
                                        backgroundColor: 'rgba(15, 23, 42, 0.5)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '0.5rem',
                                        color: '#f8fafc',
                                        fontSize: '1rem',
                                        outline: 'none',
                                        transition: 'border-color 0.2s'
                                    }}
                                    onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                                    onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                style={{
                                    width: '100%',
                                    padding: '0.875rem',
                                    backgroundColor: loading ? '#1e40af' : '#3b82f6',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '0.75rem',
                                    fontSize: '1rem',
                                    fontWeight: '600',
                                    cursor: loading ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.2s',
                                    boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.2)'
                                }}
                            >
                                {loading ? 'Enviando...' : 'Enviar Enlace'}
                            </button>
                        </form>

                        {/* Back to Login */}
                        <button
                            type="button"
                            onClick={() => {
                                setShowResetPassword(false);
                                setError('');
                                setResetMessage('');
                            }}
                            style={{
                                width: '100%',
                                marginTop: '1rem',
                                background: 'none',
                                border: 'none',
                                color: '#64748b',
                                fontSize: '0.875rem',
                                cursor: 'pointer',
                                textAlign: 'center'
                            }}
                        >
                            Volver a iniciar sesión
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

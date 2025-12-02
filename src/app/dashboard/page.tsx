"use client";

import { useAuth } from "@/context/AuthContext";
import { signOut } from "@/lib/firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";

export default function DashboardPage() {
    const { user, userProfile, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && !user) {
            router.push("/login");
        }
    }, [user, loading, router]);

    const handleLogout = async () => {
        try {
            await signOut();
            router.push("/");
        } catch (error) {
            console.error("Error logging out:", error);
        }
    };

    if (loading) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'var(--background)',
                color: 'var(--foreground)'
            }}>
                <p>Cargando...</p>
            </div>
        );
    }

    if (!user) {
        return null;
    }

    return (
        <div style={{
            minHeight: '100vh',
            backgroundColor: 'var(--background)',
            fontFamily: 'var(--font-plus-jakarta)'
        }}>
            {/* Navigation Bar */}
            <nav style={{
                padding: '1rem 2rem',
                backgroundColor: 'var(--surface)',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div style={{
                    fontSize: '1.25rem',
                    fontWeight: 'bold',
                    color: 'var(--primary)'
                }}>
                    Lawgic PI <span style={{ color: 'var(--secondary)', fontSize: '0.875rem' }}>CRM</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem'
                    }}>
                        <Avatar
                            name={userProfile?.displayName || user.email || ''}
                            avatarColor={userProfile?.avatarColor}
                            userId={user.uid}
                            size="lg"
                        />
                        <div style={{ textAlign: 'left' }}>
                            <div style={{ fontSize: '0.875rem', fontWeight: '500', color: 'var(--foreground)' }}>
                                {userProfile?.displayName || user.email}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--secondary)' }}>
                                {userProfile?.role || 'user'}
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={handleLogout}
                        style={{
                            padding: '0.5rem 1rem',
                            backgroundColor: 'transparent',
                            border: '1px solid var(--border)',
                            borderRadius: '0.5rem',
                            color: 'var(--foreground)',
                            fontSize: '0.875rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        Cerrar Sesión
                    </button>
                </div>
            </nav>

            {/* Main Content */}
            <main style={{ padding: '2rem' }}>
                <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                    <h1 style={{
                        fontSize: '2rem',
                        fontWeight: '700',
                        color: 'var(--foreground)',
                        marginBottom: '0.5rem'
                    }}>
                        Bienvenido, {userProfile?.displayName || user.email}
                    </h1>
                    <p style={{
                        fontSize: '1rem',
                        color: 'var(--secondary)',
                        marginBottom: '2rem'
                    }}>
                        Panel de control del CRM Lawgic PI
                    </p>

                    {/* Stats Grid */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                        gap: '1.5rem',
                        marginBottom: '2rem'
                    }}>
                        <StatCard title="Clientes Activos" value="0" color="#3b82f6" />
                        <StatCard title="Expedientes" value="0" color="#8b5cf6" />
                        <StatCard title="Tareas Pendientes" value="0" color="#f59e0b" />
                        <StatCard title="Alertas" value="0" color="#ef4444" />
                    </div>

                    {/* Quick Actions */}
                    <div style={{
                        padding: '2rem',
                        backgroundColor: 'var(--surface)',
                        borderRadius: '1rem',
                        border: '1px solid var(--border)'
                    }}>
                        <h2 style={{
                            fontSize: '1.25rem',
                            fontWeight: '600',
                            color: 'var(--foreground)',
                            marginBottom: '1.5rem'
                        }}>
                            Acciones Rápidas
                        </h2>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                            gap: '1rem'
                        }}>
                            <Link href="/seguimiento" style={{ textDecoration: 'none' }}>
                                <ActionButton label="Dashboard de Seguimiento" primary />
                            </Link>
                            <ActionButton label="Nuevo Cliente" />
                            <ActionButton label="Nuevo Expediente" />
                            <ActionButton label="Búsqueda Fonética" />
                            <ActionButton label="Gestionar Timelines" />
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

function StatCard({ title, value, color }: { title: string; value: string; color: string }) {
    return (
        <div style={{
            padding: '1.5rem',
            backgroundColor: 'var(--surface)',
            borderRadius: '0.75rem',
            border: '1px solid var(--border)',
            position: 'relative',
            overflow: 'hidden'
        }}>
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '4px',
                height: '100%',
                backgroundColor: color
            }} />
            <div style={{
                fontSize: '0.875rem',
                color: 'var(--secondary)',
                marginBottom: '0.5rem'
            }}>
                {title}
            </div>
            <div style={{
                fontSize: '2rem',
                fontWeight: '700',
                color: 'var(--foreground)'
            }}>
                {value}
            </div>
        </div>
    );
}

function ActionButton({ label, primary }: { label: string; primary?: boolean }) {
    return (
        <button style={{
            width: primary ? '100%' : 'auto',
            padding: '1rem',
            backgroundColor: primary ? 'var(--primary)' : 'transparent',
            border: primary ? 'none' : '1px solid var(--border)',
            borderRadius: '0.5rem',
            color: primary ? 'white' : 'var(--foreground)',
            fontSize: '0.875rem',
            fontWeight: primary ? '600' : '500',
            cursor: 'pointer',
            transition: 'all 0.2s',
            textAlign: 'left',
            boxShadow: primary ? '0 2px 4px rgba(59, 130, 246, 0.2)' : 'none'
        }}>
            {label}
        </button>
    );
}

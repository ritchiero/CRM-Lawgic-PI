import Link from "next/link";

export default function Home() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'linear-gradient(to bottom right, #0f172a, #1e293b)',
      color: '#f8fafc',
      fontFamily: 'var(--font-plus-jakarta)'
    }}>
      {/* Navigation */}
      <nav style={{
        padding: '1.5rem 2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.1)'
      }}>
        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color: '#3b82f6' }}>Lawgic PI</span>
          <span style={{ padding: '0.25rem 0.5rem', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: '4px', fontSize: '0.75rem', color: '#60a5fa' }}>INTERNAL</span>
        </div>
      </nav>

      {/* Main Content */}
      <main style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        textAlign: 'center'
      }}>
        <div style={{
          padding: '3rem',
          backgroundColor: 'rgba(30, 41, 59, 0.5)',
          borderRadius: '1.5rem',
          border: '1px solid rgba(255,255,255,0.05)',
          maxWidth: '500px',
          width: '100%',
          backdropFilter: 'blur(10px)'
        }}>
          <h1 style={{
            fontSize: '2rem',
            fontWeight: '700',
            marginBottom: '1rem',
            color: '#f8fafc'
          }}>
            Bienvenido al CRM
          </h1>

          <p style={{
            fontSize: '1rem',
            color: '#94a3b8',
            marginBottom: '2.5rem',
            lineHeight: '1.6'
          }}>
            Acceso exclusivo para el equipo de Lawgic PI. Gestiona clientes, expedientes y procesos de propiedad intelectual.
          </p>

          <Link href="/login" style={{
            display: 'block',
            width: '100%',
            padding: '1rem',
            backgroundColor: '#3b82f6',
            color: 'white',
            borderRadius: '0.75rem',
            fontWeight: '600',
            fontSize: '1rem',
            transition: 'all 0.2s',
            textAlign: 'center',
            boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.2)'
          }}>
            Ingresar al Portal
          </Link>

          <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <p style={{ fontSize: '0.875rem', color: '#64748b' }}>
              ¿Necesitas acceso? Contacta al administrador del sistema.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        padding: '1.5rem',
        textAlign: 'center',
        color: '#475569',
        fontSize: '0.75rem',
      }}>
        <p>Lawgic PI Internal System v1.0.0 | Authorized Personnel Only</p>
      </footer>
    </div>
  );
}

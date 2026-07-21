export const REPRESENTATIVE_ACTIVITY_THRESHOLDS = {
  high: 200,
  medium: 75,
  low: 25,
} as const;

export type RepresentativeActivityLevel = 'Alta' | 'Media' | 'Baja' | 'Incipiente';

export type RepresentativeActivityVerificationStatus =
  | 'pending'
  | 'in_progress'
  | 'cooldown'
  | 'verified'
  | 'failed';

export function getRepresentativeActivityLevel(count?: number | null): RepresentativeActivityLevel {
  const safeCount = Math.max(0, Number.isFinite(count) ? Number(count) : 0);

  if (safeCount >= REPRESENTATIVE_ACTIVITY_THRESHOLDS.high) return 'Alta';
  if (safeCount >= REPRESENTATIVE_ACTIVITY_THRESHOLDS.medium) return 'Media';
  if (safeCount >= REPRESENTATIVE_ACTIVITY_THRESHOLDS.low) return 'Baja';
  return 'Incipiente';
}

export function getRepresentativeActivityColor(level: RepresentativeActivityLevel) {
  const colors: Record<RepresentativeActivityLevel, string> = {
    Alta: '#15803d',
    Media: '#2563eb',
    Baja: '#d97706',
    Incipiente: '#64748b',
  };

  return colors[level];
}

export function getRepresentativeVerificationLabel(status?: RepresentativeActivityVerificationStatus) {
  const labels: Record<RepresentativeActivityVerificationStatus, string> = {
    pending: 'Pendiente de verificar',
    in_progress: 'Verificación en curso',
    cooldown: 'Pausa requerida por IMPI',
    verified: 'Actividad verificada',
    failed: 'Verificación incompleta',
  };

  return labels[status || 'pending'];
}

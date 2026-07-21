import type { RepresentativeActivityLevel, RepresentativeActivityVerificationStatus } from '@/lib/representativeActivity';

export interface RepresentativeActivityOverride {
  representativeActivityVerified: boolean;
  representativeActivityLevel: RepresentativeActivityLevel;
  representativeActivityVerificationStatus: RepresentativeActivityVerificationStatus;
  representativeActivityCount: number;
  activityClassificationBasis: 'verified_unique_expedients';
  impiProfileCount: number;
  impiProfilesProcessed: number;
  impiRawExpedientCount: number;
  impiUniqueExpedientCount: number;
  representativeActivityVerifiedAt: Date;
}

const overrides: Record<string, RepresentativeActivityOverride> = {
  'eduardo kleinberg druker': {
    representativeActivityVerified: true,
    representativeActivityLevel: 'Alta',
    representativeActivityVerificationStatus: 'verified',
    representativeActivityCount: 20_479,
    activityClassificationBasis: 'verified_unique_expedients',
    impiProfileCount: 27,
    impiProfilesProcessed: 27,
    impiRawExpedientCount: 20_479,
    impiUniqueExpedientCount: 20_479,
    representativeActivityVerifiedAt: new Date('2026-07-21T14:03:16.536Z'),
  },
  'luis guillermo corona ortiz': {
    representativeActivityVerified: true,
    representativeActivityLevel: 'Alta',
    representativeActivityVerificationStatus: 'verified',
    representativeActivityCount: 6_841,
    activityClassificationBasis: 'verified_unique_expedients',
    impiProfileCount: 73,
    impiProfilesProcessed: 73,
    impiRawExpedientCount: 6_841,
    impiUniqueExpedientCount: 6_841,
    representativeActivityVerifiedAt: new Date('2026-07-21T14:16:40.859Z'),
  },
  'roberto arochi escalante': {
    representativeActivityVerified: true,
    representativeActivityLevel: 'Alta',
    representativeActivityVerificationStatus: 'verified',
    representativeActivityCount: 39_043,
    activityClassificationBasis: 'verified_unique_expedients',
    impiProfileCount: 31,
    impiProfilesProcessed: 31,
    impiRawExpedientCount: 39_089,
    impiUniqueExpedientCount: 39_043,
    representativeActivityVerifiedAt: new Date('2026-07-21T14:59:55.897Z'),
  },
};

function normalizeName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('es');
}

export function getRepresentativeActivityOverride(name: string) {
  return overrides[normalizeName(name)];
}

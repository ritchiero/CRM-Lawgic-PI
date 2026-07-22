import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import styles from './BackToTargets.module.css';

type BackToTargetsProps = {
  compact?: boolean;
  label?: string;
};

export function BackToTargets({ compact = false, label = 'Volver a Targets' }: BackToTargetsProps) {
  return (
    <Link className={`${styles.link} ${compact ? styles.compact : ''}`} href="/target">
      <ArrowLeftIcon aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}

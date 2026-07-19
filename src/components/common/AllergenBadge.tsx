import type { ReactNode } from 'react';
import type { HTMLAttributes } from 'react';

export const AllergenBadge = ({ label, className = '' }: { label: string; className?: string }) => (
  <span className={`badge-allergen ${className}`} aria-label={`Contains ${label}`}>
    {label}
  </span>
);

export const DietaryBadge = ({ label, className = '' }: {
  label: string;
  className?: string;
}) => (
  <span className={`badge-diet ${className}`} aria-label={`Dietary: ${label}`}>
    {label}
  </span>
);

export const AuthenticityBadge = ({ label, className = '' }: {
  label: string;
  className?: string;
}) => (
  <span
    className={`badge-authenticity ${className}`}
    aria-label={`Authenticity: ${label.replaceAll('_', ' ')}`}
  >
    {label.replaceAll('_', ' ')}
  </span>
);

export const Pill = ({
  children,
  className = '',
}: { children: ReactNode } & HTMLAttributes<HTMLSpanElement>) => (
  <span className={`inline-flex items-center rounded-full bg-cream-100 px-2.5 py-0.5 text-xs text-ink-700 ${className}`}>
    {children}
  </span>
);

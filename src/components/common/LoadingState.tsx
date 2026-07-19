import type { ReactNode } from 'react';

export const FullPageSpinner = ({ label = 'Loading…' }: { label?: string }) => (
  // `aria-live="polite"` announces to screen readers when the route changes
  // and the previous page is replaced by this spinner (or by the new page once
  // the lazy chunk lands). `aria-atomic="true"` re-reads the whole label
  // rather than just the bits that change.
  <div
    role="status"
    aria-live="polite"
    aria-atomic="true"
    className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-cream-50 text-ink-700"
  >
    <span className="h-8 w-8 animate-spin rounded-full border-2 border-sage-600 border-t-transparent" />
    <span className="text-sm">{label}</span>
  </div>
);

export const InlineSpinner = ({ size = 16 }: { size?: number }) => (
  <span
    role="presentation"
    className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent"
    style={{ width: size, height: size }}
  />
);

export const Skeleton = ({ className = '' }: { className?: string }) => (
  <div className={`animate-pulse rounded-md bg-cream-200 ${className}`} aria-hidden="true" />
);

export const EmptyState = ({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) => (
  <div className="flex flex-col items-center justify-center rounded-xl2 border border-dashed border-border bg-cream-100 px-6 py-12 text-center">
    <h3 className="text-lg font-semibold text-ink-900">{title}</h3>
    {description && (
      <p className="mt-2 max-w-md text-sm text-ink-500">{description}</p>
    )}
    {action && <div className="mt-6">{action}</div>}
  </div>
);

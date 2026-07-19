import type { HTMLAttributes, ReactNode } from 'react';

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  title?: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

export const Card = ({ title, description, footer, children, className = '', ...rest }: CardProps) => (
  <section className={`card-base ${className}`} {...rest}>
    {(title || description) && (
      <header className="mb-3">
        {title && <h2 className="text-lg font-semibold text-ink-900">{title}</h2>}
        {description && <div className="mt-1 text-sm text-ink-500">{description}</div>}
      </header>
    )}
    <div>{children}</div>
    {footer && <footer className="mt-4 border-t border-border pt-4 text-sm">{footer}</footer>}
  </section>
);

export const SectionCard = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) => (
  <section className="mt-6">
    <header className="px-1 pb-2">
      <h2 className="text-lg font-semibold tracking-tight text-ink-900">{title}</h2>
      {description && <div className="mt-1 text-sm text-ink-500">{description}</div>}
    </header>
    <Card>{children}</Card>
  </section>
);

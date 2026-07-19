import type { ButtonHTMLAttributes } from 'react';

export type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  prefix?: string;
};

export const Chip = ({ active = false, prefix, className = '', children, ...rest }: ChipProps) => (
  <button
    type="button"
    aria-pressed={active}
    className={`${active ? 'chip-active' : 'chip'} ${className}`}
    {...rest}
  >
    {prefix && <span aria-hidden="true" className="text-ink-500">{prefix}</span>}
    <span>{children}</span>
  </button>
);

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const variantClass: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};

const sizeClass: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-6 py-3 text-base',
};

type CommonProps = {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
  className?: string;
};

type ButtonAsButton = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps> & {
    asChildLink?: boolean | undefined;
    to?: never;
  };

type ButtonAsLink = CommonProps &
  Pick<LinkProps, 'to' | 'replace' | 'state' | 'preventScrollReset' | 'relative'> & {
    asChildLink: true;
    to: string;
    children: ReactNode;
  };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

export const Button = (props: ButtonProps) => {
  const {
    variant = 'primary',
    size = 'md',
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    className = '',
    children,
  } = props;

  const cls = `${variantClass[variant]} ${sizeClass[size]} ${
    fullWidth ? 'w-full' : ''
  } ${className}`;

  if (props.asChildLink) {
    const { to, replace, state, preventScrollReset, relative } = props as ButtonAsLink;
    return (
      <Link
        to={to}
        replace={replace}
        state={state}
        preventScrollReset={preventScrollReset}
        relative={relative}
        className={cls}
      >
        {leftIcon}
        <span>{children}</span>
        {rightIcon}
      </Link>
    );
  }

  const {
    disabled,
    type,
    ...rest
  } = props as ButtonAsButton;
  return (
    <button
      type={type ?? 'button'}
      className={cls}
      disabled={disabled || loading}
      aria-busy={loading}
      {...rest}
    >
      {loading ? (
        <span
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : (
        leftIcon
      )}
      <span>{children}</span>
      {!loading && rightIcon}
    </button>
  );
};

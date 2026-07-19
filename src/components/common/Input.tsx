import type {
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';
import { forwardRef } from 'react';

type ShellRenderProps = {
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
  required?: boolean;
};

const Shell = ({ label, hint, error, children, required }: ShellRenderProps) => (
  <label className="block">
    {label && (
      <span className="mb-1.5 inline-flex items-center gap-1 text-sm font-medium text-ink-900">
        {label}
        {required && (
          <span aria-hidden="true" className="text-terracotta-500">
            *
          </span>
        )}
      </span>
    )}
    {children}
    {hint && !error && (
      <span className="mt-1 block text-xs text-ink-500">{hint}</span>
    )}
    {error && (
      <span className="mt-1 block text-xs font-medium text-danger-700" role="alert">
        {error}
      </span>
    )}
  </label>
);

type Adornments = { leftIcon?: ReactNode; rightIcon?: ReactNode };

export type InputProps = InputHTMLAttributes<HTMLInputElement> &
  Omit<ShellRenderProps, 'children'> &
  Adornments;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, leftIcon, rightIcon, className = '', required, id, ...rest }, ref) => (
    <Shell label={label} hint={hint} error={error} required={required}>
      <div className="relative">
        {leftIcon && (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-ink-500">
            {leftIcon}
          </span>
        )}
        <input
          id={id}
          ref={ref}
          aria-invalid={Boolean(error)}
          aria-required={required}
          className={`input-base ${leftIcon ? 'pl-9' : ''} ${rightIcon ? 'pr-9' : ''} ${className}`}
          {...rest}
        />
        {rightIcon && (
          <span className="absolute inset-y-0 right-0 flex items-center pr-2 text-ink-500">
            {rightIcon}
          </span>
        )}
      </div>
    </Shell>
  ),
);
Input.displayName = 'Input';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> &
  Omit<ShellRenderProps, 'children'>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, hint, error, className = '', required, id, ...rest }, ref) => (
    <Shell label={label} hint={hint} error={error} required={required}>
      <textarea
        id={id}
        ref={ref}
        rows={4}
        aria-invalid={Boolean(error)}
        className={`input-base resize-y ${className}`}
        {...rest}
      />
    </Shell>
  ),
);
Textarea.displayName = 'Textarea';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> &
  Omit<ShellRenderProps, 'children'>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, hint, error, className = '', required, id, children, ...rest }, ref) => (
    <Shell label={label} hint={hint} error={error} required={required}>
      <select
        id={id}
        ref={ref}
        aria-invalid={Boolean(error)}
        className={`input-base pr-8 ${className}`}
        {...rest}
      >
        {children}
      </select>
    </Shell>
  ),
);
Select.displayName = 'Select';

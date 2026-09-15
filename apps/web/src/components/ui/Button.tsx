import React from 'react';
import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'subtle';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface BaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ElementType;
  iconRight?: React.ElementType;
  fullWidth?: boolean;
  children?: React.ReactNode;
  className?: string;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-gold-500 text-white dark:text-gov-950 hover:bg-gold-600 border border-transparent shadow-xs disabled:bg-gov-600 disabled:text-slate-500',
  secondary:
    'bg-gov-850 text-slate-100 hover:bg-gov-800 border border-slate-700 shadow-xs disabled:text-slate-500',
  ghost:
    'bg-transparent text-slate-300 hover:bg-gov-800 hover:text-slate-100 border border-transparent disabled:text-slate-600',
  subtle:
    'bg-gov-800 text-slate-200 hover:bg-gov-700 border border-transparent disabled:text-slate-500',
  destructive:
    'bg-rose-600 text-white dark:text-gov-950 hover:bg-rose-500 border border-transparent shadow-xs disabled:bg-gov-600 disabled:text-slate-500',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-md',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-md',
  lg: 'h-11 px-5 text-sm gap-2 rounded-lg',
};

const ICON_SIZES: Record<ButtonSize, string> = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-4 h-4',
};

const base =
  'inline-flex items-center justify-center font-medium transition-colors select-none ' +
  'disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2';

export const Button: React.FC<BaseProps & React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon: Icon,
  iconRight: IconRight,
  fullWidth,
  className,
  children,
  disabled,
  ...rest
}) => (
  <button
    className={clsx(base, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    {...rest}
  >
    {loading ? (
      <Loader2 className={clsx(ICON_SIZES[size], 'animate-spin')} aria-hidden="true" />
    ) : (
      Icon && <Icon className={ICON_SIZES[size]} aria-hidden="true" />
    )}
    {children}
    {IconRight && !loading && <IconRight className={ICON_SIZES[size]} aria-hidden="true" />}
  </button>
);

export const LinkButton: React.FC<
  BaseProps & React.AnchorHTMLAttributes<HTMLAnchorElement>
> = ({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  fullWidth,
  className,
  children,
  ...rest
}) => (
  <a
    className={clsx(base, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
    {...rest}
  >
    {Icon && <Icon className={ICON_SIZES[size]} aria-hidden="true" />}
    {children}
    {IconRight && <IconRight className={ICON_SIZES[size]} aria-hidden="true" />}
  </a>
);

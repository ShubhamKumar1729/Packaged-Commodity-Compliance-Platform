import React from 'react';
import { clsx } from 'clsx';
import { CheckCircle2, XCircle, AlertTriangle, MinusCircle, HelpCircle, Info } from 'lucide-react';

export { Button, LinkButton } from './Button';

/* ------------------------------------------------------------------ Panel */

interface PanelProps {
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
}

/** A neutral surface. Used deliberately — not wrapped around everything. */
export const Panel: React.FC<PanelProps> = ({ children, className, as: Tag = 'div' }) => (
  <Tag className={clsx('bg-gov-850 border border-slate-800 rounded-lg', className)}>{children}</Tag>
);

export const PanelHeader: React.FC<{
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}> = ({ title, description, actions, className }) => (
  <div
    className={clsx(
      'px-5 py-4 border-b border-slate-800 flex items-start justify-between gap-4 flex-wrap',
      className,
    )}
  >
    <div className="min-w-0">
      <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
      {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
    </div>
    {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

/* ------------------------------------------------------- Section heading */

export const SectionTitle: React.FC<{
  children: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}> = ({ children, description, actions, className }) => (
  <div className={clsx('flex items-end justify-between gap-4 flex-wrap', className)}>
    <div>
      <h2 className="text-base font-semibold text-slate-100 tracking-tight">{children}</h2>
      {description && <p className="text-xs text-slate-400 mt-1">{description}</p>}
    </div>
    {actions}
  </div>
);

/* ------------------------------------------------------------------ Badge */

type Tone = 'neutral' | 'pass' | 'fail' | 'warn' | 'info' | 'accent';

const TONES: Record<Tone, string> = {
  neutral: 'bg-gov-800 text-slate-300 border-slate-700',
  pass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  fail: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
  warn: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  info: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
  accent: 'bg-gold-500/10 text-gold-400 border-gold-500/30',
};

export const Badge: React.FC<{
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
  mono?: boolean;
  icon?: React.ElementType;
}> = ({ children, tone = 'neutral', className, mono, icon: Icon }) => (
  <span
    className={clsx(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded border text-2xs font-medium whitespace-nowrap',
      TONES[tone],
      mono && 'font-mono',
      className,
    )}
  >
    {Icon && <Icon className="w-3 h-3" aria-hidden="true" />}
    {children}
  </span>
);

/* ----------------------------------------------------------- StatusPill */

export type VerdictKind = 'pass' | 'fail' | 'warn' | 'na';

const VERDICT_META: Record<VerdictKind, { Icon: React.ElementType; tone: Tone }> = {
  pass: { Icon: CheckCircle2, tone: 'pass' },
  fail: { Icon: XCircle, tone: 'fail' },
  warn: { Icon: AlertTriangle, tone: 'warn' },
  na: { Icon: MinusCircle, tone: 'neutral' },
};

/**
 * Status is conveyed by icon + text + border, never colour alone (a11y).
 */
export const StatusPill: React.FC<{
  kind: VerdictKind;
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}> = ({ kind, label, size = 'md', className }) => {
  const { Icon, tone } = VERDICT_META[kind];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded border font-semibold uppercase tracking-wide whitespace-nowrap',
        TONES[tone],
        size === 'sm' ? 'text-2xs px-1.5 py-0.5' : 'text-xs px-2 py-1',
        className,
      )}
    >
      <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} aria-hidden="true" />
      {label}
    </span>
  );
};

/* ------------------------------------------------------------------ Field */

/** Label + value pair used instead of wrapping every datum in a card. */
export const Field: React.FC<{
  label: React.ReactNode;
  children: React.ReactNode;
  mono?: boolean;
  className?: string;
}> = ({ label, children, mono, className }) => (
  <div className={className}>
    <dt className="text-2xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
    <dd className={clsx('mt-1 text-sm text-slate-200 break-words', mono && 'font-mono text-xs')}>
      {children}
    </dd>
  </div>
);

/* ------------------------------------------------------------------ Alert */

export const Alert: React.FC<{
  tone?: 'fail' | 'warn' | 'info' | 'pass';
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}> = ({ tone = 'info', title, children, className, action }) => {
  const meta = {
    fail: { cls: 'bg-rose-500/5 border-rose-500/30 text-rose-400', Icon: XCircle },
    warn: { cls: 'bg-amber-500/5 border-amber-500/30 text-amber-400', Icon: AlertTriangle },
    info: { cls: 'bg-sky-500/5 border-sky-500/30 text-sky-400', Icon: Info },
    pass: { cls: 'bg-emerald-500/5 border-emerald-500/30 text-emerald-400', Icon: CheckCircle2 },
  }[tone];
  const { Icon } = meta;

  return (
    <div
      role={tone === 'fail' ? 'alert' : 'status'}
      className={clsx('rounded-lg border p-4 flex gap-3', meta.cls, className)}
    >
      <Icon className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="text-sm font-semibold">{title}</p>}
        {children && <div className="text-xs text-slate-300 mt-0.5 leading-relaxed">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};

/* ------------------------------------------------------------- EmptyState */

export const EmptyState: React.FC<{
  icon?: React.ElementType;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}> = ({ icon: Icon = HelpCircle, title, description, action, className }) => (
  <div className={clsx('px-6 py-14 text-center', className)}>
    <div className="w-11 h-11 rounded-lg bg-gov-800 border border-slate-800 flex items-center justify-center mx-auto">
      <Icon className="w-5 h-5 text-slate-500" aria-hidden="true" />
    </div>
    <p className="mt-4 text-sm font-semibold text-slate-200">{title}</p>
    {description && (
      <p className="mt-1.5 text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">{description}</p>
    )}
    {action && <div className="mt-5 flex justify-center">{action}</div>}
  </div>
);

/* --------------------------------------------------------------- Skeleton */

export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={clsx('skeleton', className)} aria-hidden="true" />
);

export const TableSkeleton: React.FC<{ rows?: number; cols?: number }> = ({ rows = 5, cols = 6 }) => (
  <div className="divide-y divide-slate-800" aria-hidden="true">
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} className="px-5 py-3.5 flex items-center gap-4">
        {Array.from({ length: cols }).map((__, c) => (
          <Skeleton key={c} className={clsx('h-3.5', c === 0 ? 'w-32' : c === cols - 1 ? 'w-16 ml-auto' : 'w-20')} />
        ))}
      </div>
    ))}
  </div>
);

/* ------------------------------------------------------------------ Meter */

/** Thin score bar. Communicates magnitude without a full chart library. */
export const Meter: React.FC<{
  value: number;
  tone?: 'pass' | 'fail' | 'warn' | 'accent';
  className?: string;
  label?: string;
}> = ({ value, tone = 'accent', className, label }) => {
  const pct = Math.max(0, Math.min(100, value));
  const bar = {
    pass: 'bg-emerald-500',
    fail: 'bg-rose-500',
    warn: 'bg-amber-500',
    accent: 'bg-gold-500',
  }[tone];

  return (
    <div
      className={clsx('h-1.5 w-full rounded-full bg-gov-700 overflow-hidden', className)}
      role="meter"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? 'Score'}
    >
      <div className={clsx('h-full rounded-full transition-all duration-500', bar)} style={{ width: `${pct}%` }} />
    </div>
  );
};

/* ------------------------------------------------------------- Input/Select */

export const inputClass =
  'w-full bg-gov-900 border border-slate-700 rounded-md px-3 text-sm text-slate-100 ' +
  'placeholder:text-slate-500 transition-colors hover:border-slate-600 ' +
  'focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/25 ' +
  'disabled:opacity-60 disabled:cursor-not-allowed';

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className, ...rest }) => (
  <input className={clsx(inputClass, 'h-9', className)} {...rest} />
);

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({
  className,
  children,
  ...rest
}) => (
  <select className={clsx(inputClass, 'h-9 pr-8 cursor-pointer', className)} {...rest}>
    {children}
  </select>
);

export const Textarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({
  className,
  ...rest
}) => <textarea className={clsx(inputClass, 'py-2 resize-y', className)} {...rest} />;

export const FormField: React.FC<{
  label: string;
  htmlFor: string;
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}> = ({ label, htmlFor, hint, error, required, children, className }) => (
  <div className={className}>
    <label htmlFor={htmlFor} className="block text-xs font-medium text-slate-200 mb-1.5">
      {label}
      {required && <span className="text-rose-400 ml-0.5" aria-hidden="true">*</span>}
    </label>
    {children}
    {error ? (
      <p className="mt-1.5 text-2xs text-rose-400 flex items-center gap-1" role="alert">
        <AlertTriangle className="w-3 h-3" aria-hidden="true" />
        {error}
      </p>
    ) : (
      hint && <p className="mt-1.5 text-2xs text-slate-500 leading-relaxed">{hint}</p>
    )}
  </div>
);

/* ------------------------------------------------------------------ Tabs */

export const TabBar: React.FC<{
  children: React.ReactNode;
  className?: string;
  label?: string;
}> = ({ children, className, label = 'Sections' }) => (
  <div
    role="tablist"
    aria-label={label}
    className={clsx('flex items-center gap-1 border-b border-slate-800 overflow-x-auto', className)}
  >
    {children}
  </div>
);

export const Tab: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
  icon?: React.ElementType;
  id?: string;
  controls?: string;
}> = ({ active, onClick, children, count, icon: Icon, id, controls }) => (
  <button
    role="tab"
    id={id}
    aria-selected={active}
    aria-controls={controls}
    onClick={onClick}
    className={clsx(
      'relative inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors',
      'border-b-2 -mb-px',
      active
        ? 'border-gold-500 text-slate-100'
        : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700',
    )}
  >
    {Icon && <Icon className="w-3.5 h-3.5" aria-hidden="true" />}
    {children}
    {count !== undefined && (
      <span
        className={clsx(
          'ml-0.5 px-1.5 py-px rounded text-2xs font-semibold tabular-nums',
          active ? 'bg-gold-500/15 text-gold-400' : 'bg-gov-800 text-slate-500',
        )}
      >
        {count}
      </span>
    )}
  </button>
);

/* ----------------------------------------------------------------- Modal */

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}> = ({ open, onClose, title, description, children, footer, size = 'md' }) => {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const width = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' }[size];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={clsx(
          'relative w-full bg-gov-850 border border-slate-700 rounded-xl shadow-2xl animate-scale-in',
          'max-h-[90vh] flex flex-col',
          width,
        )}
      >
        <div className="px-5 py-4 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          {description && <p className="text-xs text-slate-400 mt-1">{description}</p>}
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {footer && (
          <div className="px-5 py-3.5 border-t border-slate-800 flex items-center justify-end gap-2 bg-gov-900/50 rounded-b-xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

/* ----------------------------------------------------------------- Toast */

export const Toast: React.FC<{ message: string; tone?: 'pass' | 'fail' }> = ({
  message,
  tone = 'pass',
}) => (
  <div
    role="status"
    aria-live="polite"
    className="fixed bottom-5 right-5 z-50 animate-fade-in-up"
  >
    <div
      className={clsx(
        'flex items-center gap-2.5 px-4 py-2.5 rounded-lg border shadow-lg text-xs font-medium bg-gov-850',
        tone === 'pass' ? 'border-emerald-500/40 text-emerald-400' : 'border-rose-500/40 text-rose-400',
      )}
    >
      {tone === 'pass' ? (
        <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
      ) : (
        <XCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
      )}
      <span className="text-slate-200">{message}</span>
    </div>
  </div>
);

/* ------------------------------------------------------------ Data table */

export const Table: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <div className="overflow-x-auto">
    <table className={clsx('w-full text-left border-collapse', className)}>{children}</table>
  </div>
);

export const Th: React.FC<{
  children?: React.ReactNode;
  className?: string;
  align?: 'left' | 'right';
}> = ({ children, className, align = 'left' }) => (
  <th
    scope="col"
    className={clsx(
      'px-5 py-2.5 text-2xs font-semibold uppercase tracking-wide text-slate-500 bg-gov-900/60 border-b border-slate-800',
      align === 'right' && 'text-right',
      className,
    )}
  >
    {children}
  </th>
);

export const Td: React.FC<{
  children?: React.ReactNode;
  className?: string;
  align?: 'left' | 'right';
}> = ({ children, className, align = 'left' }) => (
  <td className={clsx('px-5 py-3 text-sm text-slate-300 align-middle', align === 'right' && 'text-right', className)}>
    {children}
  </td>
);

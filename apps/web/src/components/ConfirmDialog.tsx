import React, { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './ui/Button';

/**
 * A focused confirmation dialog for destructive actions.
 *
 * Deliberately modal: deleting an inspection cannot be undone, so it should
 * interrupt rather than sit in a corner. Escape cancels, focus is moved to the
 * dialog on open and returned to the trigger on close.
 */
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  busy = false,
  onConfirm,
  onCancel,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement;
    // Button is a plain function component without ref forwarding, so the
    // confirm action is focused by id rather than by ref.
    dialogRef.current
      ?.querySelector<HTMLButtonElement>('[data-confirm-action]')
      ?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
      // Keep focus inside the dialog while it is open.
      if (e.key === 'Tab' && dialogRef.current) {
        const items = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled])',
        );
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      (previouslyFocused.current as HTMLElement | null)?.focus?.();
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-gov-950/70 backdrop-blur-[1px]"
        onClick={() => !busy && onCancel()}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-desc"
        className="relative w-full max-w-md bg-gov-850 border border-slate-700 rounded-xl shadow-2xl"
      >
        <div className="p-5 flex gap-3.5">
          <span className="h-9 w-9 shrink-0 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center">
            <AlertTriangle className="w-4.5 h-4.5 text-rose-400" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="confirm-title" className="text-sm font-semibold text-slate-100">
              {title}
            </h2>
            <div id="confirm-desc" className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              {description}
            </div>
          </div>
        </div>
        <div className="px-5 py-3.5 border-t border-slate-800 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            data-confirm-action
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            loading={busy}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};

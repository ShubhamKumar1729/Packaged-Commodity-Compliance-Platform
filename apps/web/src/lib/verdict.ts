import type { VerdictKind } from '../components/ui';

/**
 * Single source of truth for turning backend status strings into UI treatment.
 * Handles BOTH vocabularies already present in the API:
 *   PCR 2011  -> PASS | FAIL | REVIEW_REQUIRED | NOT_APPLICABLE
 *   FSSR 2020 -> compliant | violation | unable_to_verify
 */
export interface VerdictMeta {
  kind: VerdictKind;
  label: string;
  /** Longer, human phrasing for headings. */
  headline: string;
}

export const verdictMeta = (status?: string | null): VerdictMeta => {
  switch ((status ?? '').toUpperCase()) {
    case 'PASS':
    case 'COMPLIANT':
      return { kind: 'pass', label: 'Compliant', headline: 'Compliant' };
    case 'FAIL':
    case 'VIOLATION':
      return { kind: 'fail', label: 'Violation', headline: 'Violation found' };
    case 'REVIEW_REQUIRED':
    case 'UNABLE_TO_VERIFY':
      return { kind: 'warn', label: 'Needs verification', headline: 'Needs verification' };
    case 'NOT_APPLICABLE':
      return { kind: 'na', label: 'Not applicable', headline: 'Not applicable' };
    default:
      return { kind: 'na', label: status ? String(status) : 'Unknown', headline: 'Pending' };
  }
};

/** Tone for score meters, derived from the same vocabulary. */
export const scoreTone = (status?: string | null): 'pass' | 'fail' | 'warn' | 'accent' => {
  const k = verdictMeta(status).kind;
  if (k === 'pass') return 'pass';
  if (k === 'fail') return 'fail';
  if (k === 'warn') return 'warn';
  return 'accent';
};

/** Human-readable commodity / status codes: FOOD_GRAINS -> Food grains */
export const humanise = (value?: string | null): string => {
  if (!value) return '—';
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
};

export const formatDateTime = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatDate = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};

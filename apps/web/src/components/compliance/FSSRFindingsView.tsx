import React, { useState } from 'react';
import {
  Leaf, FlaskConical, AlertTriangle, ListOrdered, ChevronDown, ChevronRight,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Panel, PanelHeader, StatusPill, Badge, EmptyState, Field, Meter } from '../ui';
import { humanise } from '../../lib/verdict';

export interface FSSRFinding {
  rule_id: string;
  rule_family: string;
  status: 'compliant' | 'violation' | 'unable_to_verify';
  confidence: number;
  extracted_value?: any;
  expected_value?: string;
  evidence?: Array<{
    source: string;
    text_snippet?: string | null;
    bbox?: number[] | null;
    confidence?: number;
    note?: string | null;
  }>;
  source: string;
  explanation: string;
  title?: string;
  source_rule?: string;
  severity?: string;
}

const STATUS_META = {
  compliant: { kind: 'pass' as const, label: 'Compliant', accent: 'border-l-emerald-500' },
  violation: { kind: 'fail' as const, label: 'Violation', accent: 'border-l-rose-500' },
  unable_to_verify: {
    kind: 'warn' as const,
    label: 'Unable to verify',
    accent: 'border-l-amber-500',
  },
};

const RULE_ICONS: Record<string, React.ElementType> = {
  FSSR_2020_INGREDIENTS_LIST: ListOrdered,
  FSSR_2020_INGREDIENTS_ORDER: ListOrdered,
  FSSR_2020_ALLERGEN_DECLARATION: AlertTriangle,
  FSSR_2020_ADDITIVES_INS: FlaskConical,
  FSSR_2020_VEG_NONVEG_MARK: Leaf,
};

const renderValue = (value: any): string => {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) {
    return value
      .map((v) =>
        typeof v === 'object' && v !== null
          ? `${v.name ?? JSON.stringify(v)}${v.percentage != null ? ` (${v.percentage}%)` : ''}`
          : String(v),
      )
      .join(', ');
  }
  if (typeof value === 'object') {
    return (
      Object.entries(value)
        .filter(([, v]) => (Array.isArray(v) ? v.length > 0 : v != null))
        .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
        .join(' • ') || '—'
    );
  }
  return String(value);
};

const FSSRRow: React.FC<{ f: FSSRFinding }> = ({ f }) => {
  const [open, setOpen] = useState(false);
  const meta = STATUS_META[f.status] ?? STATUS_META.unable_to_verify;
  const RuleIcon = RULE_ICONS[f.rule_id] ?? FlaskConical;
  const hasEvidence = !!f.evidence?.length;

  return (
    <div
      className={clsx(
        'bg-gov-850 border border-slate-800 border-l-2 rounded-r-lg',
        meta.accent,
      )}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-8 h-8 rounded-md bg-gov-800 border border-slate-800 flex items-center justify-center shrink-0">
              <RuleIcon className="w-4 h-4 text-slate-400" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-slate-100 leading-snug">
                {f.title || humanise(f.rule_id.replace('FSSR_2020_', ''))}
              </h4>
              <p className="mt-0.5 text-2xs font-mono text-slate-500 break-words">
                {f.rule_family} · {f.source_rule || f.rule_id}
                {f.severity ? ` · ${f.severity}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <StatusPill kind={meta.kind} label={meta.label} size="sm" />
            <span className="text-2xs font-mono tabular-nums text-slate-500">
              {(f.confidence * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-400 leading-relaxed">{f.explanation}</p>

        <dl className="mt-3 grid sm:grid-cols-2 gap-3">
          <Field label="Detected" mono>{renderValue(f.extracted_value)}</Field>
          <Field label="Expected">
            <span className="text-xs text-slate-400">{f.expected_value || '—'}</span>
          </Field>
        </dl>

        {hasEvidence && (
          <>
            <button
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="mt-3 inline-flex items-center gap-1.5 text-2xs font-medium text-slate-400 hover:text-slate-100 transition-colors"
            >
              {open ? (
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              {open ? 'Hide' : 'Show'} evidence ({f.evidence!.length})
            </button>

            {open && (
              <ul className="mt-2.5 rounded-md border border-slate-800 bg-gov-900 divide-y divide-slate-800 animate-fade-in">
                {f.evidence!.map((e, i) => (
                  <li key={i} className="p-3 flex items-start gap-2.5">
                    <Badge mono className="shrink-0">{e.source}</Badge>
                    <div className="min-w-0 flex-1">
                      {e.text_snippet && (
                        <p className="text-xs text-slate-300 font-mono break-words">
                          “{e.text_snippet}”
                        </p>
                      )}
                      {e.note && (
                        <p className="text-2xs text-slate-500 mt-0.5 leading-relaxed">{e.note}</p>
                      )}
                    </div>
                    {e.confidence != null && (
                      <div className="shrink-0 w-20">
                        <p className="text-2xs font-mono tabular-nums text-slate-500 text-right">
                          {(e.confidence * 100).toFixed(0)}%
                        </p>
                        <Meter
                          value={e.confidence * 100}
                          className="mt-1"
                          label="Evidence confidence"
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export const FSSRFindingsView: React.FC<{ findings: FSSRFinding[] }> = ({ findings = [] }) => {
  if (!findings.length) {
    return (
      <Panel>
        <EmptyState
          icon={FlaskConical}
          title="No FSSR 2020 results yet"
          description="Run the verification pipeline to evaluate ingredient declarations against the FSS (Labelling & Display) Regulations, 2020."
        />
      </Panel>
    );
  }

  const counts = findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.status] = (acc[f.status] || 0) + 1;
    return acc;
  }, {});

  // Violations first, then unverifiable, then compliant.
  const ORDER = { violation: 0, unable_to_verify: 1, compliant: 2 } as const;
  const sorted = findings
    .slice()
    .sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9));

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title="FSS (Labelling & Display) Regulations, 2020"
          description="Ingredient rule family — evaluated separately from PCR 2011"
          actions={
            <div className="flex items-center gap-1.5 flex-wrap">
              {(['violation', 'unable_to_verify', 'compliant'] as const).map((s) =>
                counts[s] ? (
                  <StatusPill
                    key={s}
                    kind={STATUS_META[s].kind}
                    label={`${counts[s]} ${STATUS_META[s].label}`}
                    size="sm"
                  />
                ) : null,
              )}
            </div>
          }
        />
      </Panel>

      <div className="space-y-2.5">
        {sorted.map((f) => (
          <FSSRRow key={f.rule_id} f={f} />
        ))}
      </div>
    </div>
  );
};

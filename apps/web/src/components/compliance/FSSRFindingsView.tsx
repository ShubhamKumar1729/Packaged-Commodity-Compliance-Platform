import React from 'react';
import {
  CheckCircle2, XCircle, HelpCircle, Leaf, FlaskConical,
  AlertTriangle, ListOrdered, Eye,
} from 'lucide-react';

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

const STATUS_STYLES: Record<string, { label: string; cls: string; Icon: React.ElementType }> = {
  compliant: {
    label: 'COMPLIANT',
    cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    Icon: CheckCircle2,
  },
  violation: {
    label: 'VIOLATION',
    cls: 'bg-red-500/10 text-red-400 border-red-500/30',
    Icon: XCircle,
  },
  unable_to_verify: {
    label: 'UNABLE TO VERIFY',
    cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    Icon: HelpCircle,
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
    return Object.entries(value)
      .filter(([, v]) => Array.isArray(v) ? v.length > 0 : v != null)
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
      .join(' • ') || '—';
  }
  return String(value);
};

interface Props {
  findings: FSSRFinding[];
}

export const FSSRFindingsView: React.FC<Props> = ({ findings = [] }) => {
  if (!findings.length) {
    return (
      <div className="bg-gov-850 border border-slate-800 rounded-xl p-8 text-center">
        <FlaskConical className="w-10 h-10 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-300 font-medium">No FSSR 2020 results available</p>
        <p className="text-slate-500 text-sm mt-1">
          Run the analysis pipeline to evaluate ingredient declarations.
        </p>
      </div>
    );
  }

  const counts = findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.status] = (acc[f.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="bg-gov-850 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-white font-semibold flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-gold-400" />
              FSS (Labelling &amp; Display) Regulations, 2020
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Ingredient rule family — evaluated separately from PCR 2011
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {(['compliant', 'violation', 'unable_to_verify'] as const).map((s) =>
              counts[s] ? (
                <span key={s} className={`px-2.5 py-1 rounded-md border font-semibold ${STATUS_STYLES[s].cls}`}>
                  {counts[s]} {STATUS_STYLES[s].label}
                </span>
              ) : null,
            )}
          </div>
        </div>
      </div>

      {findings.map((f) => {
        const style = STATUS_STYLES[f.status] ?? STATUS_STYLES.unable_to_verify;
        const RuleIcon = RULE_ICONS[f.rule_id] ?? FlaskConical;
        const { Icon } = style;

        return (
          <div key={f.rule_id} className="bg-gov-850 border border-slate-800 rounded-xl p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-slate-800/80 flex items-center justify-center shrink-0">
                  <RuleIcon className="w-4 h-4 text-gold-400" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-white font-semibold text-sm">{f.title || f.rule_id}</h4>
                  <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                    {f.rule_family} • {f.source_rule || f.rule_id}
                    {f.severity ? ` • ${f.severity}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`px-2.5 py-1 rounded-md border text-[11px] font-bold flex items-center gap-1.5 ${style.cls}`}>
                  <Icon className="w-3.5 h-3.5" />
                  {style.label}
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  {(f.confidence * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            <p className="text-sm text-slate-300 mt-3 leading-relaxed">{f.explanation}</p>

            <div className="grid sm:grid-cols-2 gap-3 mt-4">
              <div className="bg-gov-900/60 rounded-lg p-3 border border-slate-800/80">
                <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Extracted</p>
                <p className="text-xs text-slate-200 mt-1 break-words">{renderValue(f.extracted_value)}</p>
              </div>
              <div className="bg-gov-900/60 rounded-lg p-3 border border-slate-800/80">
                <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Expected</p>
                <p className="text-xs text-slate-200 mt-1 break-words">{f.expected_value || '—'}</p>
              </div>
            </div>

            {f.evidence && f.evidence.length > 0 && (
              <div className="mt-3 border-t border-slate-800 pt-3">
                <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold flex items-center gap-1.5">
                  <Eye className="w-3 h-3" /> Evidence
                </p>
                <ul className="mt-2 space-y-1.5">
                  {f.evidence.map((e, i) => (
                    <li key={i} className="text-[11px] text-slate-400 flex gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono shrink-0 h-fit">
                        {e.source}
                      </span>
                      <span className="break-words">
                        {e.text_snippet ? `"${e.text_snippet}"` : ''}
                        {e.note ? (e.text_snippet ? ` — ${e.note}` : e.note) : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

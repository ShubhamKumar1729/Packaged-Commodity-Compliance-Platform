import React, { useEffect, useState } from 'react';
import {
  ScanLine, FileText, ShieldCheck, AlertOctagon, HelpCircle,
  Inbox, ChevronRight,
} from 'lucide-react';
import { api } from '../services/api';
import { DashboardSummary, ScanItem } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import {
  Panel, PanelHeader, Button, EmptyState, Skeleton, TableSkeleton,
  Meter, Table, Th, Td, Badge,
} from '../components/ui';
import { formatDateTime, humanise } from '../lib/verdict';

interface DashboardViewProps {
  onStartNewScan: () => void;
  onViewScan: (scanId: string) => void;
}

const StatTile: React.FC<{
  label: string;
  value: React.ReactNode;
  hint: string;
  icon: React.ElementType;
  tone?: 'neutral' | 'pass' | 'fail' | 'warn';
  loading?: boolean;
}> = ({ label, value, hint, icon: Icon, tone = 'neutral', loading }) => {
  const valueTone = {
    neutral: 'text-slate-100',
    pass: 'text-emerald-400',
    fail: 'text-rose-400',
    warn: 'text-amber-400',
  }[tone];
  const iconTone = {
    neutral: 'text-slate-500',
    pass: 'text-emerald-500',
    fail: 'text-rose-500',
    warn: 'text-amber-500',
  }[tone];

  return (
    <div className="bg-gov-850 border border-slate-800 rounded-lg p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-2xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
        <Icon className={`w-4 h-4 ${iconTone}`} aria-hidden="true" />
      </div>
      {loading ? (
        <Skeleton className="h-8 w-14 mt-2.5" />
      ) : (
        <p className={`mt-2 text-3xl font-semibold tabular-nums tracking-tight ${valueTone}`}>
          {value}
        </p>
      )}
      <p className="mt-1 text-2xs text-slate-500 leading-relaxed">{hint}</p>
    </div>
  );
};

export const DashboardView: React.FC<DashboardViewProps> = ({ onStartNewScan, onViewScan }) => {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [scans, setScans] = useState<ScanItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [sumData, scansData] = await Promise.all([
          api.getDashboardSummary(),
          api.listScans(),
        ]);
        setSummary(sumData);
        setScans(scansData.scans);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const recent = scans.slice(0, 8);
  const rate = summary?.compliance_rate_percent ?? 0;

  return (
    <div className="space-y-6">
      {/* Page header + primary action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-100 tracking-tight">
            Compliance overview
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Verification of packaged commodities under PCR 2011 and FSSR 2020.
          </p>
        </div>
        <Button variant="primary" size="lg" icon={ScanLine} onClick={onStartNewScan}>
          Scan product
        </Button>
      </div>

      {/* Metrics — all values come from the API; nothing invented. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          label="Products scanned"
          value={summary?.total_scans ?? 0}
          hint="Total registered inspections"
          icon={FileText}
          loading={loading}
        />
        <StatTile
          label="Compliant"
          value={summary?.pass_count ?? 0}
          hint="All mandatory declarations verified"
          icon={ShieldCheck}
          tone="pass"
          loading={loading}
        />
        <StatTile
          label="Violations"
          value={summary?.fail_count ?? 0}
          hint="Contraventions requiring action"
          icon={AlertOctagon}
          tone="fail"
          loading={loading}
        />
        <StatTile
          label="Needs verification"
          value={summary?.review_required_count ?? 0}
          hint="Awaiting officer adjudication"
          icon={HelpCircle}
          tone="warn"
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Recent activity */}
        <Panel className="lg:col-span-2 overflow-hidden">
          <PanelHeader
            title="Recent inspections"
            description="Most recent packages submitted for verification"
            actions={
              scans.length > 0 ? (
                <Badge mono>{scans.length} total</Badge>
              ) : undefined
            }
          />
          {loading ? (
            <TableSkeleton rows={5} cols={4} />
          ) : recent.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No inspections yet"
              description="Upload a photograph of a packaged commodity to run OCR, visual verification and the statutory rule engine."
              action={
                <Button variant="primary" icon={ScanLine} onClick={onStartNewScan}>
                  Scan your first product
                </Button>
              }
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Scan</Th>
                  <Th className="hidden sm:table-cell">Commodity</Th>
                  <Th>Result</Th>
                  <Th className="hidden md:table-cell">Submitted</Th>
                  <Th align="right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {recent.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => onViewScan(s.id)}
                    className="hover:bg-gov-800/50 transition-colors cursor-pointer"
                  >
                    <Td>
                      <span className="font-mono text-xs text-slate-200">{s.scan_number}</span>
                      <span className="block sm:hidden text-2xs text-slate-500 mt-0.5">
                        {humanise(s.commodity_type)}
                      </span>
                    </Td>
                    <Td className="hidden sm:table-cell text-xs text-slate-400">
                      {humanise(s.commodity_type)}
                    </Td>
                    <Td>
                      <StatusBadge status={s.overall_verdict || s.status} size="sm" />
                    </Td>
                    <Td className="hidden md:table-cell text-xs text-slate-500 whitespace-nowrap">
                      {formatDateTime(s.created_at)}
                    </Td>
                    <Td align="right">
                      <button
                        onClick={(e) => { e.stopPropagation(); onViewScan(s.id); }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-gold-400 hover:text-gold-300"
                        aria-label={`View details for ${s.scan_number}`}
                      >
                        View
                        <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>

        {/* Side column */}
        <div className="space-y-5">
          <Panel className="p-5">
            <h3 className="text-sm font-semibold text-slate-100">Compliance rate</h3>
            <p className="text-2xs text-slate-500 mt-0.5">
              Share of inspections with a fully compliant verdict
            </p>
            {loading ? (
              <Skeleton className="h-9 w-24 mt-4" />
            ) : (
              <>
                <p className="mt-4 text-4xl font-semibold text-slate-100 tabular-nums tracking-tight">
                  {rate.toFixed(0)}
                  <span className="text-lg text-slate-500 ml-0.5">%</span>
                </p>
                <Meter
                  value={rate}
                  tone={rate >= 80 ? 'pass' : rate >= 50 ? 'warn' : 'fail'}
                  className="mt-3"
                  label="Compliance rate"
                />
                <dl className="mt-4 pt-4 border-t border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <dt className="text-slate-400">Rules enforced</dt>
                    <dd className="font-mono text-slate-200 tabular-nums">
                      {summary?.active_rules_enforced ?? '—'}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between text-xs gap-3">
                    <dt className="text-slate-400 shrink-0">Jurisdiction</dt>
                    <dd className="text-slate-300 text-right text-2xs leading-snug">
                      {summary?.enforcement_jurisdiction ?? '—'}
                    </dd>
                  </div>
                </dl>
              </>
            )}
          </Panel>

          <Panel className="p-5">
            <h3 className="text-sm font-semibold text-slate-100">How verification works</h3>
            <ol className="mt-3 space-y-3">
              {[
                { n: 1, t: 'Text extraction', d: 'PaddleOCR reads declarations with confidence and coordinates.' },
                { n: 2, t: 'Visual verification', d: 'The VLM inspects symbols and label layout.' },
                { n: 3, t: 'Rule evaluation', d: 'Deterministic PCR 2011 and FSSR 2020 rules decide the verdict.' },
              ].map((s) => (
                <li key={s.n} className="flex gap-3">
                  <span className="shrink-0 w-5 h-5 rounded bg-gov-800 border border-slate-700 text-2xs font-semibold text-slate-400 flex items-center justify-center tabular-nums">
                    {s.n}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-200">{s.t}</p>
                    <p className="text-2xs text-slate-500 leading-relaxed mt-0.5">{s.d}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-4 pt-3.5 border-t border-slate-800 text-2xs text-slate-500 leading-relaxed">
              AI extracts and measures. Deterministic rules decide compliance — no model
              determines a verdict on its own.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
};

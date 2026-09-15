import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck, ShieldAlert, AlertTriangle,
  Download, UserCheck, Eye, EyeOff, History,
  ChevronDown, ChevronRight, Image as ImageIcon, FilterX,
} from 'lucide-react';
import { clsx } from 'clsx';
import { ComplianceFinding, ComplianceStatus, ReviewLogItem } from '../../types';
import { StatusBadge } from '../StatusBadge';
import { api } from '../../services/api';
import {
  Panel, Button, LinkButton, Badge, Modal, Toast, Meter,
  EmptyState, Input, Textarea, FormField, Field,
} from '../ui';
import { formatDateTime, humanise, verdictMeta } from '../../lib/verdict';

interface ComplianceFindingsViewProps {
  scanId: string;
  scanNumber: string;
  overallVerdict?: string;
  complianceScore?: number;
  findings: ComplianceFinding[];
  imageUrl: string;
  annotatedImageUrl?: string | null;
  onFindingsUpdated: () => void;
}

const VERDICT_COPY: Record<string, { headline: string; detail: string }> = {
  PASS: {
    headline: 'Compliant',
    detail:
      'All mandatory declarations under Chapter II (Rules 6, 7, 8, 9 and 10) were detected and verified within statutory thresholds.',
  },
  FAIL: {
    headline: 'Violation found',
    detail:
      'One or more mandatory declarations are missing or non-compliant under the Legal Metrology (Packaged Commodities) Rules, 2011.',
  },
  REVIEW_REQUIRED: {
    headline: 'Needs verification',
    detail:
      'Declarations were extracted, but physical measurement or officer adjudication is required before a verdict can be recorded.',
  },
};

/** One rule finding, collapsed to essentials with expandable evidence. */
const FindingRow: React.FC<{
  finding: ComplianceFinding;
  onAdjudicate: (f: ComplianceFinding) => void;
}> = ({ finding, onAdjudicate }) => {
  const [open, setOpen] = useState(false);
  const meta = verdictMeta(finding.status);
  const hasEvidence = !!finding.evidence?.length;

  const accent =
    meta.kind === 'fail'
      ? 'border-l-rose-500'
      : meta.kind === 'warn'
      ? 'border-l-amber-500'
      : meta.kind === 'pass'
      ? 'border-l-emerald-500'
      : 'border-l-slate-700';

  return (
    <div
      className={clsx(
        'bg-gov-850 border border-slate-800 border-l-2 rounded-r-lg transition-colors hover:border-slate-700',
        accent,
      )}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge mono tone="accent">{finding.source_rule}</Badge>
              <span className="text-2xs uppercase tracking-wide text-slate-500">
                {humanise(finding.category)}
              </span>
              <StatusBadge status={finding.status} size="sm" />
            </div>
            <h4 className="mt-2 text-sm font-semibold text-slate-100 leading-snug">
              {finding.title}
            </h4>
          </div>

          <Button
            size="sm"
            variant="ghost"
            icon={UserCheck}
            onClick={() => onAdjudicate(finding)}
          >
            Adjudicate
          </Button>
        </div>

        {/* Detected vs expected — the core of a rule result. */}
        <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Detected" mono>
            {finding.detected || <span className="text-slate-500 font-sans">Not detected</span>}
          </Field>
          <Field label="Statutory basis">
            <span className="text-xs text-slate-400 leading-relaxed">{finding.reasoning}</span>
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
              {open ? 'Hide' : 'Show'} evidence ({finding.evidence!.length})
            </button>

            {open && (
              <div className="mt-2.5 rounded-md border border-slate-800 bg-gov-900 divide-y divide-slate-800 animate-fade-in">
                {finding.evidence!.map((ev, idx) => (
                  <div key={idx} className="p-3 flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-2xs font-medium uppercase tracking-wide text-slate-500">
                        {humanise(ev.evidence_type)}
                      </p>
                      {'value' in (ev as any) && (ev as any).value && (
                        <p className="mt-1 text-xs font-mono text-slate-300 break-words">
                          {String((ev as any).value)}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 w-28">
                      <div className="flex items-center justify-between text-2xs text-slate-500">
                        <span>Confidence</span>
                        <span className="font-mono tabular-nums text-slate-300">
                          {(ev.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <Meter
                        value={ev.confidence * 100}
                        tone="accent"
                        className="mt-1"
                        label="Evidence confidence"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export const ComplianceFindingsView: React.FC<ComplianceFindingsViewProps> = ({
  scanId,
  scanNumber,
  overallVerdict,
  complianceScore = 0,
  findings = [],
  imageUrl,
  annotatedImageUrl,
  onFindingsUpdated,
}) => {
  const [filter, setFilter] = useState<'ALL' | 'FAIL' | 'REVIEW_REQUIRED' | 'PASS'>('ALL');
  const [showAnnotated, setShowAnnotated] = useState<boolean>(true);
  const [selectedFinding, setSelectedFinding] = useState<ComplianceFinding | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState<boolean>(false);
  const [reviewStatus, setReviewStatus] = useState<ComplianceStatus>('PASS');
  const [reviewNotes, setReviewNotes] = useState<string>('');
  const [reviewerName, setReviewerName] = useState<string>('Officer In-Charge');
  const [submittingReview, setSubmittingReview] = useState<boolean>(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewLogs, setReviewLogs] = useState<ReviewLogItem[]>([]);
  const [showLogs, setShowLogs] = useState<boolean>(false);
  const [showEvidenceImage, setShowEvidenceImage] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const loadLogs = async () => {
    try {
      const logs = await api.getScanReviews(scanId);
      setReviewLogs(logs);
    } catch {
      // Ignore if no logs
    }
  };

  useEffect(() => {
    loadLogs();
  }, [scanId]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleOpenReview = (finding: ComplianceFinding) => {
    setSelectedFinding(finding);
    setReviewStatus(finding.status === 'PASS' ? 'REVIEW_REQUIRED' : 'PASS');
    setReviewNotes('');
    setReviewError(null);
    setIsReviewOpen(true);
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFinding || !reviewNotes.trim()) return;

    try {
      setSubmittingReview(true);
      setReviewError(null);
      await api.reviewFinding(scanId, {
        rule_id: selectedFinding.rule_id,
        status: reviewStatus,
        notes: reviewNotes.trim(),
        reviewer_name: reviewerName.trim() || 'Officer In-Charge',
      });
      setIsReviewOpen(false);
      showToast(
        `${selectedFinding.source_rule} recorded as ${verdictMeta(reviewStatus).label.toLowerCase()}`,
      );
      await loadLogs();
      onFindingsUpdated();
    } catch (err: any) {
      setReviewError(
        /failed to fetch/i.test(err?.message ?? '')
          ? 'Could not reach the verification service. Your adjudication was not saved.'
          : err.message || 'The adjudication could not be recorded. Please try again.',
      );
    } finally {
      setSubmittingReview(false);
    }
  };

  const passCount = findings.filter((f) => f.status === 'PASS').length;
  const failCount = findings.filter((f) => f.status === 'FAIL').length;
  const reviewCount = findings.filter((f) => f.status === 'REVIEW_REQUIRED').length;

  // Violations first, then warnings, then verified — the required hierarchy.
  const ORDER: Record<string, number> = { FAIL: 0, REVIEW_REQUIRED: 1, PASS: 2, NOT_APPLICABLE: 3 };
  const filteredFindings = useMemo(
    () =>
      findings
        .filter((f) => (filter === 'ALL' ? true : f.status === filter))
        .slice()
        .sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9)),
    [findings, filter],
  );

  const currentVerdict =
    overallVerdict || (failCount > 0 ? 'FAIL' : reviewCount > 0 ? 'REVIEW_REQUIRED' : 'PASS');
  const meta = verdictMeta(currentVerdict);
  const copy = VERDICT_COPY[currentVerdict] ?? VERDICT_COPY.REVIEW_REQUIRED;

  const VerdictIcon =
    meta.kind === 'pass' ? ShieldCheck : meta.kind === 'fail' ? ShieldAlert : AlertTriangle;

  const verdictAccent = {
    pass: { border: 'border-emerald-500/40', icon: 'text-emerald-500 bg-emerald-500/10' },
    fail: { border: 'border-rose-500/40', icon: 'text-rose-500 bg-rose-500/10' },
    warn: { border: 'border-amber-500/40', icon: 'text-amber-500 bg-amber-500/10' },
    na: { border: 'border-slate-700', icon: 'text-slate-400 bg-gov-800' },
  }[meta.kind];

  const FILTERS = [
    { id: 'ALL', label: 'All rules', count: findings.length },
    { id: 'FAIL', label: 'Violations', count: failCount },
    { id: 'REVIEW_REQUIRED', label: 'Needs verification', count: reviewCount },
    { id: 'PASS', label: 'Verified', count: passCount },
  ] as const;

  return (
    <div className="space-y-5">
      {toastMessage && <Toast message={toastMessage} />}

      {/* 1. Overall result */}
      <div className={clsx('rounded-lg border bg-gov-850', verdictAccent.border)}>
        <div className="p-5 flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="flex items-start gap-4 min-w-0">
            <div
              className={clsx(
                'w-11 h-11 rounded-lg flex items-center justify-center shrink-0',
                verdictAccent.icon,
              )}
            >
              <VerdictIcon className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-2xs font-medium uppercase tracking-wide text-slate-500">
                Statutory verdict
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-100 tracking-tight">
                {copy.headline}
              </h2>
              <p className="mt-1.5 text-xs text-slate-400 max-w-2xl leading-relaxed">
                {copy.detail}
              </p>
            </div>
          </div>

          {/* 2. Score & counts */}
          <div className="lg:border-l lg:border-slate-800 lg:pl-6 shrink-0 w-full lg:w-64">
            <div className="flex items-baseline justify-between">
              <span className="text-2xs font-medium uppercase tracking-wide text-slate-500">
                Compliance score
              </span>
              <span className="text-2xl font-semibold text-slate-100 font-mono tabular-nums">
                {complianceScore.toFixed(1)}%
              </span>
            </div>
            <Meter
              value={complianceScore}
              tone={meta.kind === 'na' ? 'accent' : meta.kind}
              className="mt-2"
              label="Compliance score"
            />
            <dl className="mt-4 space-y-2 text-xs">
              {[
                { label: 'Violations', value: failCount, cls: 'text-rose-400' },
                { label: 'Needs verification', value: reviewCount, cls: 'text-amber-400' },
                { label: 'Verified', value: passCount, cls: 'text-emerald-400' },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between">
                  <dt className="text-slate-400">{r.label}</dt>
                  <dd className={clsx('font-mono font-semibold tabular-nums', r.cls)}>{r.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <LinkButton
              href={api.getPdfReportUrl(scanId)}
              target="_blank"
              rel="noopener noreferrer"
              variant="primary"
              size="sm"
              icon={Download}
            >
              Inspection certificate (PDF)
            </LinkButton>
            {annotatedImageUrl && (
              <Button
                size="sm"
                variant="ghost"
                icon={showAnnotated ? EyeOff : Eye}
                onClick={() => setShowAnnotated(!showAnnotated)}
              >
                {showAnnotated ? 'View raw image' : 'View evidence overlay'}
              </Button>
            )}
          </div>

          {reviewLogs.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              icon={History}
              iconRight={showLogs ? ChevronDown : ChevronRight}
              onClick={() => setShowLogs(!showLogs)}
              aria-expanded={showLogs}
            >
              Officer audit trail ({reviewLogs.length})
            </Button>
          )}
        </div>
      </div>

      {/* Audit trail */}
      {showLogs && reviewLogs.length > 0 && (
        <Panel className="animate-fade-in overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-100">Officer review ledger</h3>
            <span className="text-2xs text-slate-500">Immutable compliance history</span>
          </div>
          <ul className="divide-y divide-slate-800">
            {reviewLogs.map((log) => (
              <li key={log.id} className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="font-mono text-slate-300">{log.rule_id}</span>
                    <span className="text-slate-500">{log.previous_status}</span>
                    <span className="text-slate-600" aria-hidden="true">→</span>
                    <StatusBadge status={log.updated_status} size="sm" />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-400 italic leading-relaxed">
                    “{log.review_notes}”
                  </p>
                </div>
                <div className="sm:text-right shrink-0 text-2xs">
                  <p className="text-slate-200 font-medium">{log.reviewer_name}</p>
                  <p className="text-slate-500 mt-0.5">{formatDateTime(log.reviewed_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* 3. Rule findings */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-100">Rule findings</h3>
          <div
            className="flex items-center gap-1 flex-wrap"
            role="group"
            aria-label="Filter findings by result"
          >
            {FILTERS.map((f) => {
              const active = filter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  aria-pressed={active}
                  className={clsx(
                    'inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md text-xs font-medium border transition-colors',
                    active
                      ? 'bg-gov-800 border-slate-600 text-slate-100'
                      : 'bg-transparent border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700',
                  )}
                >
                  {f.label}
                  <span className="text-2xs tabular-nums text-slate-500">{f.count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {filteredFindings.length === 0 ? (
          <Panel>
            <EmptyState
              icon={FilterX}
              title="No findings in this view"
              description="No rule results match the selected filter."
              action={
                filter !== 'ALL' ? (
                  <Button size="sm" onClick={() => setFilter('ALL')}>Show all rules</Button>
                ) : undefined
              }
            />
          </Panel>
        ) : (
          <div className="space-y-2.5">
            {filteredFindings.map((finding) => (
              <FindingRow
                key={finding.rule_id}
                finding={finding}
                onAdjudicate={handleOpenReview}
              />
            ))}
          </div>
        )}
      </div>

      {/* 4. Visual evidence */}
      <Panel className="overflow-hidden">
        <button
          onClick={() => setShowEvidenceImage((v) => !v)}
          aria-expanded={showEvidenceImage}
          className="w-full px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-gov-800/40 transition-colors"
        >
          <span className="flex items-center gap-2.5 min-w-0">
            <ImageIcon className="w-4 h-4 text-slate-500 shrink-0" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-100">
                {showAnnotated && annotatedImageUrl ? 'Annotated evidence' : 'Package photograph'}
              </span>
              <span className="block text-2xs text-slate-500 mt-0.5">
                {showAnnotated && annotatedImageUrl
                  ? 'Boxes mark each declaration located on the label'
                  : 'Original capture at source resolution'}
              </span>
            </span>
          </span>
          {showEvidenceImage ? (
            <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" aria-hidden="true" />
          )}
        </button>

        {showEvidenceImage && (
          <div className="px-5 pb-5">
            <div className="rounded-md overflow-hidden bg-gov-900 border border-slate-800 flex items-center justify-center">
              <img
                src={showAnnotated && annotatedImageUrl ? api.getAnnotatedImageUrl(scanId) : imageUrl}
                alt={`Package scan ${scanNumber}`}
                className="max-h-[440px] w-auto object-contain"
              />
            </div>
          </div>
        )}
      </Panel>

      {/* Officer adjudication */}
      <Modal
        open={isReviewOpen && !!selectedFinding}
        onClose={() => setIsReviewOpen(false)}
        title={`Officer adjudication — ${selectedFinding?.source_rule ?? ''}`}
        description={selectedFinding?.title}
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsReviewOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              form="adjudication-form"
              type="submit"
              loading={submittingReview}
              disabled={!reviewNotes.trim()}
            >
              Record adjudication
            </Button>
          </>
        }
      >
        <form id="adjudication-form" onSubmit={handleSubmitReview} className="space-y-4">
          {reviewError && (
            <p className="text-xs text-rose-400 flex items-start gap-1.5" role="alert">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
              {reviewError}
            </p>
          )}

          <div className="rounded-md border border-slate-800 bg-gov-900 px-3.5 py-2.5 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-400">Automated finding</span>
            {selectedFinding && <StatusBadge status={selectedFinding.status} size="sm" />}
          </div>

          <fieldset>
            <legend className="block text-xs font-medium text-slate-200 mb-1.5">
              Adjudicated status
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {(['PASS', 'FAIL', 'REVIEW_REQUIRED'] as ComplianceStatus[]).map((st) => {
                const active = reviewStatus === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setReviewStatus(st)}
                    aria-pressed={active}
                    className={clsx(
                      'py-2 px-2 rounded-md text-2xs font-medium border transition-colors',
                      active
                        ? 'bg-gold-500 text-white dark:text-gov-950 border-gold-500'
                        : 'bg-gov-900 text-slate-300 border-slate-700 hover:bg-gov-800',
                    )}
                  >
                    {verdictMeta(st).label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <FormField
            label="Officer name / designation"
            htmlFor="reviewer-name"
            required
          >
            <Input
              id="reviewer-name"
              type="text"
              value={reviewerName}
              onChange={(e) => setReviewerName(e.target.value)}
              placeholder="e.g. Inspector S. Sharma, Legal Metrology"
              required
            />
          </FormField>

          <FormField
            label="Verification notes & statutory justification"
            htmlFor="review-notes"
            required
            hint="Record physical instrument measurements, compounding notes, or the basis of the override."
          >
            <Textarea
              id="review-notes"
              rows={3}
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              placeholder="Basis for this adjudication…"
              required
            />
          </FormField>
        </form>
      </Modal>
    </div>
  );
};

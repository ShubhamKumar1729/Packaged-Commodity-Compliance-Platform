import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, Play, RefreshCw, Layers, FileText, ShieldCheck,
  ClipboardList, Ruler, Leaf, ScanText,
} from 'lucide-react';
import { api } from '../services/api';
import { ComplianceFindingsView } from '../components/compliance/ComplianceFindingsView';
import { OCRVisualizer } from '../components/scan/OCRVisualizer';
import { FactsSheet } from '../components/compliance/FactsSheet';
import { CVFindingsView } from '../components/compliance/CVFindingsView';
import { FSSRFindingsView } from '../components/compliance/FSSRFindingsView';
import { StatusBadge } from '../components/StatusBadge';
import {
  Panel, Button, LinkButton, Alert, Skeleton, TabBar, Tab, Badge,
} from '../components/ui';
import { formatDateTime, humanise } from '../lib/verdict';

interface ScanDetailViewProps {
  scanId: string;
  onBack: () => void;
}

const humaniseError = (raw: string): string => {
  if (/failed to fetch|networkerror|load failed/i.test(raw)) {
    return 'Could not reach the verification service. Check your connection and try again.';
  }
  if (/404/.test(raw)) return 'This inspection record could not be found.';
  if (/5\d\d/.test(raw)) {
    return 'The verification service could not complete this request. Please try again shortly.';
  }
  return raw;
};

export const ScanDetailView: React.FC<ScanDetailViewProps> = ({ scanId, onBack }) => {
  const [scan, setScan] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'compliance' | 'facts' | 'cv' | 'fssr' | 'ocr'>('compliance');

  const loadScan = async () => {
    try {
      setLoading(true);
      const data = await api.getScanDetails(scanId);
      setScan(data);
      setError(null);
    } catch (err: any) {
      setError(humaniseError(err.message || 'Failed to load scan details'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadScan();
  }, [scanId]);

  const handleRunPipeline = async () => {
    try {
      setAnalyzing(true);
      setError(null);
      await api.analyzeScan(scanId);
      await loadScan();
      setActiveTab('compliance');
    } catch (err: any) {
      setError(humaniseError(err.message || 'Failed to execute the verification pipeline'));
    } finally {
      setAnalyzing(false);
    }
  };

  const backButton = (
    <button
      onClick={onBack}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-100 transition-colors"
    >
      <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
      Back to inspections
    </button>
  );

  if (loading) {
    return (
      <div className="space-y-5">
        {backButton}
        <Panel className="p-5 space-y-3">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-3.5 w-80" />
          <Skeleton className="h-3.5 w-64" />
        </Panel>
        <Panel className="p-5 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </Panel>
      </div>
    );
  }

  if (error || !scan) {
    return (
      <div className="space-y-4">
        {backButton}
        <Alert
          tone="fail"
          title="This inspection could not be loaded"
          action={<Button size="sm" icon={RefreshCw} onClick={loadScan}>Retry</Button>}
        >
          {error || 'The scan record was not found. It may have been removed.'}
        </Alert>
      </div>
    );
  }

  const hasAnalysis = scan.status === 'COMPLETED' || (scan.findings && scan.findings.length > 0);
  const hasFacts = !!scan.facts;

  // The backend records which engine produced the text. The mock engine emits
  // fixed sample text regardless of the uploaded image, so results sourced
  // from it must never be mistaken for a real inspection.
  const ocrProvider: string | undefined = scan.evidence?.ocr?.provider;
  const isMockOcr = typeof ocrProvider === 'string' && ocrProvider.toLowerCase() === 'mock';

  const TABS = [
    { id: 'compliance', label: 'Compliance', icon: ShieldCheck, count: scan.findings?.length || 0 },
    { id: 'facts', label: 'Declarations', icon: ClipboardList },
    { id: 'cv', label: 'Measurements', icon: Ruler },
    { id: 'fssr', label: 'Ingredients (FSSR)', icon: Leaf, count: scan.fssr_findings?.length || 0 },
    { id: 'ocr', label: 'OCR evidence', icon: ScanText, count: scan.ocr_result?.tokens?.length || 0 },
  ] as const;

  return (
    <div className="space-y-5">
      {backButton}

      {/* Case header: product identity first, then result. */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 pb-5 border-b border-slate-800">
        <div className="min-w-0">
          <p className="text-2xs font-medium uppercase tracking-wide text-slate-500">
            {humanise(scan.commodity_type)}
          </p>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <h1 className="text-xl font-semibold text-slate-100 font-mono tracking-tight">
              {scan.scan_number}
            </h1>
            <StatusBadge status={scan.overall_verdict || scan.status} size="sm" />
            {scan.compliance_score !== null && scan.compliance_score !== undefined && (
              <Badge mono>{scan.compliance_score.toFixed(1)}% score</Badge>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Scanned {formatDateTime(scan.created_at)} · Assessed under PCR 2011 (amended 2023)
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!hasAnalysis ? (
            <Button
              variant="primary"
              icon={Play}
              onClick={handleRunPipeline}
              loading={analyzing}
            >
              {analyzing ? 'Running verification…' : 'Run verification'}
            </Button>
          ) : (
            <>
              <LinkButton
                href={api.getPdfReportUrl(scanId)}
                target="_blank"
                rel="noopener noreferrer"
                variant="secondary"
                icon={FileText}
              >
                Inspection PDF
              </LinkButton>
              <Button
                variant="ghost"
                icon={RefreshCw}
                onClick={handleRunPipeline}
                loading={analyzing}
              >
                Re-verify
              </Button>
            </>
          )}
        </div>
      </div>

      {isMockOcr && (
        <Alert tone="fail" title="Simulated data — not a real inspection">
          These findings were produced by the <strong>mock OCR engine</strong>, which
          returns fixed sample text regardless of the uploaded image. The product
          details below do not describe your package. Set{' '}
          <code className="font-mono">OCR_PROVIDER=paddleocr</code> in your{' '}
          <code className="font-mono">.env</code>, restart the API server, then run
          the scan again.
        </Alert>
      )}

      {hasAnalysis && (
        <TabBar label="Inspection sections">
          {TABS.map((t) => (
            <Tab
              key={t.id}
              active={activeTab === t.id}
              onClick={() => setActiveTab(t.id)}
              icon={t.icon}
              count={'count' in t ? t.count : undefined}
              id={`tab-${t.id}`}
              controls={`panel-${t.id}`}
            >
              {t.label}
            </Tab>
          ))}
        </TabBar>
      )}

      {hasAnalysis ? (
        <div id={`panel-${activeTab}`} role="tabpanel" aria-labelledby={`tab-${activeTab}`}>
          {activeTab === 'compliance' ? (
            <ComplianceFindingsView
              scanId={scan.id}
              scanNumber={scan.scan_number}
              overallVerdict={scan.overall_verdict}
              complianceScore={scan.compliance_score || 0}
              findings={scan.findings || []}
              imageUrl={scan.image_url}
              annotatedImageUrl={scan.annotated_image_url}
              onFindingsUpdated={loadScan}
            />
          ) : activeTab === 'facts' && hasFacts ? (
            <FactsSheet facts={scan.facts} />
          ) : activeTab === 'cv' && hasFacts ? (
            <CVFindingsView facts={scan.facts} />
          ) : activeTab === 'fssr' ? (
            <FSSRFindingsView findings={scan.fssr_findings || []} />
          ) : (
            <OCRVisualizer imageUrl={scan.image_url} ocrResult={scan.ocr_result} />
          )}
        </div>
      ) : (
        <Panel className="px-6 py-14 text-center">
          <div className="w-11 h-11 rounded-lg bg-gov-800 border border-slate-800 flex items-center justify-center mx-auto text-slate-400">
            <Layers className="w-5 h-5" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-sm font-semibold text-slate-200">Ready to verify</h2>
          <p className="mt-1.5 text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
            The photograph has been uploaded and its integrity recorded. Run the pipeline to
            extract text, measure the label, and evaluate every statutory rule.
          </p>
          <div className="mt-5 flex justify-center">
            <Button
              variant="primary"
              size="lg"
              icon={Play}
              onClick={handleRunPipeline}
              loading={analyzing}
            >
              {analyzing ? 'Running verification…' : 'Run verification'}
            </Button>
          </div>
          {analyzing && (
            <p className="mt-3 text-2xs text-slate-500">
              OCR, visual verification and rule evaluation run in sequence — this can take a moment.
            </p>
          )}
        </Panel>
      )}
    </div>
  );
};

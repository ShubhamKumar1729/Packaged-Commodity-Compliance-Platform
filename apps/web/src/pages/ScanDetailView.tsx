import React, { useEffect, useState } from 'react';
import { ArrowLeft, Play, RefreshCw, Layers, AlertCircle, FileText, ShieldCheck } from 'lucide-react';
import { api } from '../services/api';
import { ComplianceFindingsView } from '../components/compliance/ComplianceFindingsView';
import { OCRVisualizer } from '../components/scan/OCRVisualizer';
import { FactsSheet } from '../components/compliance/FactsSheet';
import { CVFindingsView } from '../components/compliance/CVFindingsView';
import { FSSRFindingsView } from '../components/compliance/FSSRFindingsView';
import { StatusBadge } from '../components/StatusBadge';

interface ScanDetailViewProps {
  scanId: string;
  onBack: () => void;
}

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
      setError(err.message || 'Failed to load scan details');
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
      setError(err.message || 'Failed to execute Legal Metrology pipeline');
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <div className="p-16 text-center text-slate-400 space-y-3">
        <RefreshCw className="w-8 h-8 mx-auto animate-spin text-gold-400" />
        <p className="text-sm font-semibold">Loading package inspection records...</p>
      </div>
    );
  }

  if (error || !scan) {
    return (
      <div className="space-y-4">
        <button
          onClick={onBack}
          className="inline-flex items-center space-x-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Ledger</span>
        </button>
        <div className="p-6 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center space-x-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-400" />
          <span>{error || 'Scan not found.'}</span>
        </div>
      </div>
    );
  }

  const hasAnalysis = scan.status === 'COMPLETED' || (scan.findings && scan.findings.length > 0);
  const hasFacts = !!scan.facts;

  return (
    <div className="space-y-6">
      {/* Navigation & Case Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="p-2 rounded-lg bg-gov-800 hover:bg-gov-700 text-slate-300 hover:text-white border border-slate-700 transition-all cursor-pointer"
            title="Back to Inspection Ledger"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-xl font-bold text-white tracking-tight font-mono">{scan.scan_number}</h1>
              <StatusBadge status={scan.overall_verdict || scan.status} size="sm" />
              {scan.compliance_score !== null && scan.compliance_score !== undefined && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold font-mono bg-gov-800 text-gold-300 border border-gold-500/30">
                  {scan.compliance_score.toFixed(1)}% Score
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Category: <strong className="text-slate-200">{scan.commodity_type}</strong> • Jurisdiction:{' '}
              <span className="text-slate-300">PCR 2011 (Amended 2023)</span> • Scanned on{' '}
              {new Date(scan.created_at).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-3">
          {!hasAnalysis ? (
            <button
              onClick={handleRunPipeline}
              disabled={analyzing}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center space-x-2 ${
                analyzing
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 shadow-md cursor-pointer'
              }`}
            >
              {analyzing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Executing Verification Pipeline...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Run Verification Pipeline</span>
                </>
              )}
            </button>
          ) : (
            <>
              <a
                href={api.getPdfReportUrl(scanId)}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-gold-500 hover:bg-gold-400 text-slate-950 transition-all flex items-center space-x-1.5 shadow-sm font-bold"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Inspection PDF</span>
              </a>
              <button
                onClick={handleRunPipeline}
                disabled={analyzing}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-gov-800 hover:bg-gov-700 text-slate-300 hover:text-white border border-slate-700 transition-all flex items-center space-x-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${analyzing ? 'animate-spin' : ''}`} />
                <span>Re-verify</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Primary Sub-view Navigation Tabs */}
      {hasAnalysis && (
        <div className="flex items-center space-x-2 border-b border-slate-800 pb-2 text-xs overflow-x-auto">
          <button
            onClick={() => setActiveTab('compliance')}
            className={`px-4 py-2 rounded-lg font-semibold transition-all whitespace-nowrap cursor-pointer flex items-center space-x-1.5 ${
              activeTab === 'compliance'
                ? 'bg-gold-500 text-slate-950 shadow-sm font-bold'
                : 'text-slate-400 hover:text-white hover:bg-gov-800'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Compliance Audit &amp; Legal Findings ({scan.findings?.length || 0})</span>
          </button>
          <button
            onClick={() => setActiveTab('facts')}
            className={`px-4 py-2 rounded-lg font-semibold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'facts'
                ? 'bg-gold-500 text-slate-950 shadow-sm font-bold'
                : 'text-slate-400 hover:text-white hover:bg-gov-800'
            }`}
          >
            Structured Declarations (Facts Sheet)
          </button>
          <button
            onClick={() => setActiveTab('cv')}
            className={`px-4 py-2 rounded-lg font-semibold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'cv'
                ? 'bg-gold-500 text-slate-950 shadow-sm font-bold'
                : 'text-slate-400 hover:text-white hover:bg-gov-800'
            }`}
          >
            CV Measurements (Rules 7 &amp; 8)
          </button>
          <button
            onClick={() => setActiveTab('fssr')}
            className={`px-4 py-2 rounded-lg font-semibold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'fssr'
                ? 'bg-gold-500 text-slate-950 shadow-sm font-bold'
                : 'text-slate-400 hover:text-white hover:bg-gov-800'
            }`}
          >
            Ingredients &amp; FSSR 2020 ({scan.fssr_findings?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('ocr')}
            className={`px-4 py-2 rounded-lg font-semibold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'ocr'
                ? 'bg-gold-500 text-slate-950 shadow-sm font-bold'
                : 'text-slate-400 hover:text-white hover:bg-gov-800'
            }`}
          >
            Interactive OCR Visualizer ({scan.ocr_result?.tokens?.length || 0} Tokens)
          </button>
        </div>
      )}

      {/* Main Content Area */}
      {hasAnalysis ? (
        activeTab === 'compliance' ? (
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
          <OCRVisualizer
            imageUrl={scan.image_url}
            ocrResult={scan.ocr_result}
          />
        )
      ) : (
        <div className="glass-panel rounded-2xl p-12 text-center space-y-4 border border-slate-700/80">
          <div className="w-16 h-16 rounded-full bg-gov-800 border border-gold-500/30 flex items-center justify-center mx-auto text-gold-400">
            <Layers className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-white">Verification Engine Ready</h2>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Package photograph uploaded and integrity verified. Click below to execute the end-to-end Legal Metrology verification pipeline: OCR &rarr; Facts &rarr; CV Measurements &rarr; Statutory Rule Evaluation &rarr; Scoring.
          </p>
          <button
            onClick={handleRunPipeline}
            disabled={analyzing}
            className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 text-slate-950 font-bold text-xs rounded-lg shadow-md transition-all inline-flex items-center space-x-2 cursor-pointer"
          >
            <Play className="w-4 h-4" />
            <span>Execute Verification Pipeline</span>
          </button>
        </div>
      )}
    </div>
  );
};

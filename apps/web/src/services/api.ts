import { LegalRuleSet, DashboardSummary, ScanItem } from '../types';

const API_BASE = '/api/v1';

export const api = {
  async getHealth() {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) throw new Error('Health check failed');
    return res.json();
  },

  async getReadiness() {
    const res = await fetch(`${API_BASE}/ready`);
    if (!res.ok) throw new Error('Readiness check failed');
    return res.json();
  },

  async getRules(): Promise<LegalRuleSet> {
    const res = await fetch(`${API_BASE}/rules`);
    if (!res.ok) throw new Error('Failed to fetch legal rules');
    return res.json();
  },

  async getCommodities() {
    const res = await fetch(`${API_BASE}/commodities`);
    if (!res.ok) throw new Error('Failed to fetch commodities');
    return res.json();
  },

  async getDashboardSummary(): Promise<DashboardSummary> {
    const res = await fetch(`${API_BASE}/dashboard/summary`);
    if (!res.ok) throw new Error('Failed to fetch dashboard metrics');
    return res.json();
  },

  async listScans(): Promise<{ total: number; scans: ScanItem[] }> {
    const res = await fetch(`${API_BASE}/scans`);
    if (!res.ok) throw new Error('Failed to fetch scans');
    return res.json();
  },

  async uploadScan(file: File, commodityType: string = 'FOOD_GRAINS') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('commodity_type', commodityType);

    const res = await fetch(`${API_BASE}/scans/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ detail: 'Upload failed' }));
      throw new Error(errorData.detail || 'Failed to upload image');
    }

    return res.json();
  },

  async getScanDetails(scanId: string) {
    const res = await fetch(`${API_BASE}/scans/${scanId}`);
    if (!res.ok) throw new Error(`Failed to fetch scan ${scanId}`);
    return res.json();
  },

  async analyzeScan(scanId: string) {
    const res = await fetch(`${API_BASE}/scans/${scanId}/analyze`, {
      method: 'POST'
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Analysis failed' }));
      throw new Error(err.detail || 'Analysis pipeline failed');
    }
    return res.json();
  },

  async evaluateScan(scanId: string) {
    const res = await fetch(`${API_BASE}/scans/${scanId}/evaluate`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Evaluation failed');
    return res.json();
  },

  async reviewFinding(scanId: string, payload: {
    rule_id: string;
    status: string;
    notes: string;
    reviewer_name?: string;
  }) {
    const res = await fetch(`${API_BASE}/scans/${scanId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: jsonStringifySafe(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Adjudication failed' }));
      throw new Error(err.detail || 'Adjudication failed');
    }
    return res.json();
  },

  async getScanReviews(scanId: string) {
    const res = await fetch(`${API_BASE}/scans/${scanId}/reviews`);
    if (!res.ok) throw new Error('Failed to fetch review logs');
    return res.json();
  },

  getPdfReportUrl(scanId: string) {
    return `${API_BASE}/scans/${scanId}/report/pdf`;
  },

  getAnnotatedImageUrl(scanId: string) {
    return `${API_BASE}/scans/${scanId}/annotated-image`;
  },

  async getFssrRules() {
    const res = await fetch(`${API_BASE}/rules/fssr`);
    if (!res.ok) throw new Error('Failed to fetch FSSR 2020 rules');
    return res.json();
  },

  async getScanFssrFindings(scanId: string) {
    const res = await fetch(`${API_BASE}/scans/${scanId}/fssr-findings`);
    if (!res.ok) throw new Error('Failed to fetch FSSR findings');
    return res.json();
  },

  async getScanEvidence(scanId: string) {
    const res = await fetch(`${API_BASE}/scans/${scanId}/evidence`);
    if (!res.ok) throw new Error('Failed to fetch evidence bundle');
    return res.json();
  }
};

function jsonStringifySafe(obj: any): string {
  return JSON.stringify(obj);
}


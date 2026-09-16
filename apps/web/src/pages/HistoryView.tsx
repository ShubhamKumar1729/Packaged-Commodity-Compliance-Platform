import React, { useEffect, useMemo, useState } from 'react';
import { Search, ChevronRight, Inbox, SearchX, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { ScanItem } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import {
  Panel, Table, Th, Td, EmptyState, TableSkeleton, Select, Badge, Meter,
} from '../components/ui';
import { formatDateTime, humanise, scoreTone } from '../lib/verdict';
import { ConfirmDialog } from '../components/ConfirmDialog';

interface HistoryViewProps {
  onViewScan: (scanId: string) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ onViewScan }) => {
  const [scans, setScans] = useState<ScanItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [verdictFilter, setVerdictFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<ScanItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    async function loadScans() {
      try {
        const data = await api.listScans();
        setScans(data.scans);
      } catch (err) {
        console.error('Failed to load history:', err);
      } finally {
        setLoading(false);
      }
    }
    loadScans();
  }, []);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteScan(pendingDelete.id);
      // Drop it locally rather than refetching, so the table does not flash.
      setScans((prev) => prev.filter((x) => x.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch {
      setDeleteError('That inspection could not be deleted. Please try again.');
    } finally {
      setDeleting(false);
    }
  }

  // Filtering logic preserved exactly.
  const filteredScans = useMemo(
    () =>
      scans.filter((s) => {
        const matchesSearch =
          s.scan_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.commodity_type.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesVerdict = verdictFilter === 'ALL' ? true : s.overall_verdict === verdictFilter;
        return matchesSearch && matchesVerdict;
      }),
    [scans, searchQuery, verdictFilter],
  );

  const isFiltered = searchQuery.trim() !== '' || verdictFilter !== 'ALL';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-100 tracking-tight">Inspection history</h1>
        <p className="text-sm text-slate-400 mt-1">
          Audit log of every packaged commodity scan and its compliance assessment.
        </p>
      </div>

      <Panel className="overflow-hidden">
        {/* Toolbar */}
        <div className="px-4 py-3 border-b border-slate-800 flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search
              className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              id="history-search"
              type="search"
              placeholder="Search scan number or commodity"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search inspections"
              className="w-full h-9 pl-9 pr-3 bg-gov-900 border border-slate-700 rounded-md text-sm text-slate-100 placeholder:text-slate-500 hover:border-slate-600 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/25 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2.5">
            <label htmlFor="verdict-filter" className="text-xs text-slate-400 whitespace-nowrap">
              Result
            </label>
            <Select
              id="verdict-filter"
              value={verdictFilter}
              onChange={(e) => setVerdictFilter(e.target.value)}
              className="w-auto min-w-[10rem]"
            >
              <option value="ALL">All results</option>
              <option value="PASS">Compliant</option>
              <option value="FAIL">Violation</option>
              <option value="REVIEW_REQUIRED">Needs verification</option>
            </Select>
            {!loading && (
              <Badge mono className="hidden sm:inline-flex">
                {filteredScans.length}
              </Badge>
            )}
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : scans.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No inspections recorded"
            description="Once you scan a packaged commodity it will appear here with its full compliance history."
          />
        ) : filteredScans.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No matching inspections"
            description={
              isFiltered
                ? 'Try a different search term or clear the result filter.'
                : undefined
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Scan</Th>
                <Th className="hidden md:table-cell">Commodity</Th>
                <Th>Result</Th>
                <Th className="hidden lg:table-cell">Score</Th>
                <Th className="hidden sm:table-cell">Stage</Th>
                <Th className="hidden xl:table-cell">Submitted</Th>
                <Th align="right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredScans.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => onViewScan(s.id)}
                  className="hover:bg-gov-800/50 transition-colors cursor-pointer"
                >
                  <Td>
                    <span className="font-mono text-xs text-slate-200">{s.scan_number}</span>
                    <span className="block md:hidden text-2xs text-slate-500 mt-0.5">
                      {humanise(s.commodity_type)}
                    </span>
                  </Td>
                  <Td className="hidden md:table-cell text-xs text-slate-400">
                    {humanise(s.commodity_type)}
                  </Td>
                  <Td>
                    <StatusBadge status={s.overall_verdict || s.status} size="sm" />
                  </Td>
                  <Td className="hidden lg:table-cell">
                    {s.compliance_score != null ? (
                      <div className="w-24">
                        <div className="flex items-center justify-between text-2xs text-slate-400 mb-1">
                          <span className="font-mono tabular-nums text-slate-300">
                            {s.compliance_score.toFixed(0)}%
                          </span>
                        </div>
                        <Meter
                          value={s.compliance_score}
                          tone={scoreTone(s.overall_verdict)}
                          label={`Score for ${s.scan_number}`}
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-slate-600">—</span>
                    )}
                  </Td>
                  <Td className="hidden sm:table-cell">
                    <span className="text-2xs font-mono text-slate-500">{humanise(s.status)}</span>
                  </Td>
                  <Td className="hidden xl:table-cell text-xs text-slate-500 whitespace-nowrap">
                    {formatDateTime(s.created_at)}
                  </Td>
                  <Td align="right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); onViewScan(s.id); }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-gold-400 hover:text-gold-300"
                        aria-label={`Inspect ${s.scan_number}`}
                      >
                        Inspect
                        <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setPendingDelete(s); }}
                        className="p-1.5 rounded-md text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                        aria-label={`Delete inspection ${s.scan_number}`}
                        title="Delete inspection"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      <ConfirmDialog
        open={pendingDelete !== null}
        busy={deleting}
        title="Delete this inspection?"
        description={
          <>
            <span className="font-mono text-slate-300">{pendingDelete?.scan_number}</span> and its
            stored images, findings and officer review notes will be permanently removed. This
            cannot be undone.
            {deleteError && <span className="block mt-2 text-rose-400">{deleteError}</span>}
          </>
        }
        confirmLabel="Delete inspection"
        onConfirm={confirmDelete}
        onCancel={() => { setPendingDelete(null); setDeleteError(null); }}
      />
    </div>
  );
};

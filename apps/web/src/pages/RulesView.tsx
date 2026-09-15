import React, { useEffect, useMemo, useState } from 'react';
import { FileCode, SearchX, Search } from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '../services/api';
import { LegalRuleSet } from '../types';
import { Panel, Badge, EmptyState, Skeleton } from '../components/ui';

const CATEGORIES = [
  { id: 'ALL', label: 'All rules' },
  { id: 'MANDATORY_DECLARATION', label: 'Mandatory declarations' },
  { id: 'QUANTITY', label: 'Net quantity' },
  { id: 'MRP', label: 'Pricing & USP' },
  { id: 'FONT_SIZE', label: 'Numeral height' },
  { id: 'LEGIBILITY', label: 'Legibility & manner' },
  { id: 'EXEMPTION', label: 'Statutory exemptions' },
];

const RuleCardSkeleton: React.FC = () => (
  <div className="bg-gov-850 border border-slate-800 rounded-lg p-5">
    <div className="flex items-center justify-between">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-4 w-14" />
    </div>
    <Skeleton className="h-4 w-3/4 mt-4" />
    <Skeleton className="h-3 w-full mt-3" />
    <Skeleton className="h-3 w-5/6 mt-2" />
    <Skeleton className="h-3 w-1/3 mt-5" />
  </div>
);

export const RulesView: React.FC = () => {
  const [ruleset, setRuleset] = useState<LegalRuleSet | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRules() {
      try {
        const data = await api.getRules();
        setRuleset(data);
      } catch (err) {
        console.error('Failed to load rules:', err);
      } finally {
        setLoading(false);
      }
    }
    loadRules();
  }, []);

  const filteredRules = useMemo(() => {
    const byCategory =
      ruleset?.rules.filter((r) =>
        selectedCategory === 'ALL' ? true : r.category === selectedCategory,
      ) ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return byCategory;
    return byCategory.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.source_rule.toLowerCase().includes(q) ||
        r.rule_id.toLowerCase().includes(q),
    );
  }, [ruleset, selectedCategory, query]);

  const countFor = (id: string) =>
    id === 'ALL'
      ? ruleset?.rules.length ?? 0
      : ruleset?.rules.filter((r) => r.category === id).length ?? 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-100 tracking-tight">
            Statutory rule registry
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Legal Metrology (Packaged Commodities) Rules, 2011 — the deterministic checks
            applied by the verification engine.
          </p>
        </div>
        <div className="flex items-center gap-2.5 text-xs">
          <span className="text-slate-500">Ruleset version</span>
          {loading ? (
            <Skeleton className="h-5 w-16" />
          ) : (
            <Badge mono tone="accent">{ruleset?.ruleset_version ?? '—'}</Badge>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter rules by category">
          {CATEGORIES.map((cat) => {
            const active = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                aria-pressed={active}
                className={clsx(
                  'inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md text-xs font-medium border transition-colors',
                  active
                    ? 'bg-gov-800 border-slate-600 text-slate-100'
                    : 'bg-transparent border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700',
                )}
              >
                {cat.label}
                {!loading && (
                  <span className="text-2xs tabular-nums text-slate-500">{countFor(cat.id)}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="relative w-full lg:max-w-xs">
          <Search
            className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search rules"
            aria-label="Search rules"
            className="w-full h-8 pl-9 pr-3 bg-gov-900 border border-slate-700 rounded-md text-xs text-slate-100 placeholder:text-slate-500 hover:border-slate-600 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/25 transition-colors"
          />
        </div>
      </div>

      {/* Rules */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <RuleCardSkeleton key={i} />)}
        </div>
      ) : filteredRules.length === 0 ? (
        <Panel>
          <EmptyState
            icon={SearchX}
            title="No rules match"
            description="Adjust the category filter or clear your search to see the full statutory registry."
          />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredRules.map((rule) => (
            <article
              key={rule.rule_id}
              className="bg-gov-850 border border-slate-800 rounded-lg p-5 flex flex-col hover:border-slate-700 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <Badge mono tone="accent">{rule.source_rule}</Badge>
                <Badge tone={rule.severity === 'HIGH' ? 'fail' : 'warn'}>
                  {rule.severity === 'HIGH' ? 'High severity' : 'Medium severity'}
                </Badge>
              </div>

              <h3 className="mt-3 text-sm font-semibold text-slate-100 leading-snug">
                {rule.title}
              </h3>
              <p className="mt-1.5 text-xs text-slate-400 leading-relaxed flex-1">
                {rule.description}
              </p>

              <div className="mt-4 pt-3.5 border-t border-slate-800 flex items-center justify-between gap-3 text-2xs">
                <span className="inline-flex items-center gap-1.5 text-slate-500">
                  <FileCode className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    Verification{' '}
                    <span className="text-slate-300 font-medium">{rule.verification_type}</span>
                  </span>
                </span>
                <span className="font-mono text-slate-600">{rule.rule_id}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

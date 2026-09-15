import React from 'react';
import { ProductFacts, FactValue } from '../../types';
import {
  Tag, Calendar, MapPin, Phone, Globe, Scale, IndianRupee, Building2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Panel, PanelHeader, StatusPill, Badge } from '../ui';

interface FactsSheetProps {
  facts: ProductFacts;
}

interface FactRow {
  rule: string;
  label: string;
  fact?: FactValue;
  icon: React.ElementType;
  note?: string;
}

const displayValue = (fact: FactValue): string => {
  const normalized = fact.normalized_value;
  if (typeof normalized === 'object' && normalized !== null) return JSON.stringify(normalized);
  return String(normalized ?? fact.raw_value ?? '');
};

/**
 * Extracted declarations shown as a scannable table rather than a wall of
 * cards — each row is rule, value, source text and extraction confidence.
 */
export const FactsSheet: React.FC<FactsSheetProps> = ({ facts }) => {
  const rows: FactRow[] = [
    {
      rule: 'Rule 6(1)(e)',
      label: 'Maximum retail price',
      fact: facts.mrp_value,
      icon: IndianRupee,
      note: facts.inclusive_of_taxes_clause
        ? 'Inclusive-of-all-taxes clause present'
        : 'Inclusive-of-all-taxes clause not detected',
    },
    {
      rule: 'Rule 6(1)(c)',
      label: 'Net quantity',
      fact: facts.net_quantity_value,
      icon: Scale,
      note: facts.net_quantity_unit?.raw_value
        ? `Declared unit “${facts.net_quantity_unit.raw_value}” · normalised to ${facts.net_quantity_value?.normalized_value} ${facts.net_quantity_unit?.normalized_value}`
        : undefined,
    },
    { rule: 'Rule 6(1)(da)', label: 'Unit sale price', fact: facts.unit_sale_price, icon: Tag },
    { rule: 'Rule 6(1)(b)', label: 'Generic or common name', fact: facts.generic_name, icon: Tag },
    {
      rule: 'Rule 6(1)(d)',
      label: 'Date of manufacture / packing',
      fact: facts.mfg_date,
      icon: Calendar,
      note: facts.best_before?.raw_value
        ? `Best before: ${facts.best_before.raw_value}`
        : undefined,
    },
    { rule: 'Rule 6(1)(a)', label: 'Country of origin', fact: facts.country_of_origin, icon: Globe },
    {
      rule: 'Rule 6(1)(a)',
      label: 'Manufacturer or packer',
      fact: facts.manufacturer_name,
      icon: Building2,
    },
    {
      rule: 'Rule 6(1)(a)',
      label: 'Address & pincode',
      fact: facts.manufacturer_address,
      icon: MapPin,
    },
    {
      rule: 'Rule 6(1)(n)',
      label: 'Consumer care',
      fact: facts.consumer_care_phone || facts.consumer_care_email,
      icon: Phone,
      note:
        [
          facts.consumer_care_phone?.normalized_value
            ? `Tel: ${facts.consumer_care_phone.normalized_value}`
            : null,
          facts.consumer_care_email?.normalized_value
            ? `Email: ${facts.consumer_care_email.normalized_value}`
            : null,
        ]
          .filter(Boolean)
          .join(' · ') || undefined,
    },
  ];

  const detectedCount = rows.filter(
    (r) => !!r.fact?.raw_value || !!r.fact?.normalized_value,
  ).length;

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Extracted declarations"
        description="Normalised statutory attributes read from the label by OCR."
        actions={
          <Badge mono>
            {detectedCount}/{rows.length} detected
          </Badge>
        }
      />

      <ul className="divide-y divide-slate-800">
        {rows.map((row) => {
          const present = !!row.fact?.raw_value || !!row.fact?.normalized_value;
          const Icon = row.icon;
          const value = present ? displayValue(row.fact!) : null;
          const rawDiffers =
            present && row.fact!.raw_value && row.fact!.raw_value !== value;

          return (
            <li
              key={`${row.rule}-${row.label}`}
              className={clsx(
                'px-5 py-3.5 flex items-start gap-4',
                !present && 'bg-gov-900/40',
              )}
            >
              <Icon
                className={clsx(
                  'w-4 h-4 mt-0.5 shrink-0',
                  present ? 'text-slate-500' : 'text-slate-600',
                )}
                aria-hidden="true"
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-2xs font-mono text-slate-500">{row.rule}</span>
                  <span className="text-2xs font-medium uppercase tracking-wide text-slate-500">
                    {row.label}
                  </span>
                </div>

                {present ? (
                  <>
                    <p className="mt-1 text-sm font-medium text-slate-100 break-words">{value}</p>
                    {rawDiffers && (
                      <p className="mt-0.5 text-2xs text-slate-500 font-mono break-words">
                        Raw: “{row.fact!.raw_value}”
                      </p>
                    )}
                  </>
                ) : (
                  <p className="mt-1 text-sm text-slate-500">Not detected on this label</p>
                )}

                {row.note && (
                  <p className="mt-1 text-2xs text-slate-500 leading-relaxed">{row.note}</p>
                )}
              </div>

              <div className="shrink-0 text-right">
                {present ? (
                  <>
                    <StatusPill kind="pass" label="Detected" size="sm" />
                    <p className="mt-1 text-2xs font-mono tabular-nums text-slate-500">
                      {(row.fact!.confidence * 100).toFixed(0)}% conf.
                    </p>
                  </>
                ) : (
                  <StatusPill kind="warn" label="Missing" size="sm" />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
};

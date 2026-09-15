import React from 'react';
import { ProductFacts } from '../../types';
import { Focus, Eye, Ruler, ShieldCheck } from 'lucide-react';
import { StatusBadge } from '../StatusBadge';
import { Panel, PanelHeader, Alert } from '../ui';

interface CVFindingsViewProps {
  facts: ProductFacts;
}

interface MeasurementCard {
  title: string;
  rule: string;
  method: string;
  icon: React.ElementType;
  status: 'PASS' | 'REVIEW_REQUIRED';
  rows: Array<{ label: string; value: React.ReactNode }>;
  note?: React.ReactNode;
  caution?: React.ReactNode;
}

const MeasurementPanel: React.FC<{ card: MeasurementCard }> = ({ card }) => {
  const Icon = card.icon;
  return (
    <Panel className="flex flex-col">
      <div className="px-5 py-4 border-b border-slate-800 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-8 h-8 rounded-md bg-gov-800 border border-slate-800 flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4 text-slate-400" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-100 leading-snug">{card.title}</h3>
            <p className="mt-0.5 text-2xs text-slate-500">
              <span className="font-mono">{card.rule}</span> · {card.method}
            </p>
          </div>
        </div>
        <StatusBadge status={card.status} size="sm" />
      </div>

      <dl className="px-5 py-2 divide-y divide-slate-800 flex-1">
        {card.rows.map((r) => (
          <div key={r.label} className="py-2.5 flex items-baseline justify-between gap-4">
            <dt className="text-xs text-slate-400">{r.label}</dt>
            <dd className="text-xs text-slate-200 font-medium text-right">{r.value}</dd>
          </div>
        ))}
      </dl>

      {(card.note || card.caution) && (
        <div className="px-5 pb-5 pt-1">
          {card.caution ? (
            <Alert tone="warn">{card.caution}</Alert>
          ) : (
            <p className="text-2xs text-slate-500 leading-relaxed">{card.note}</p>
          )}
        </div>
      )}
    </Panel>
  );
};

export const CVFindingsView: React.FC<CVFindingsViewProps> = ({ facts }) => {
  const isBlurry = facts.is_blurry;
  const blurScore = facts.blur_score ?? 0;
  const contrastScore = facts.contrast_score ?? 0;
  const fontHeightMm = facts.estimated_font_height_mm;
  const tampering = facts.tampering_detected;

  const cards: MeasurementCard[] = [
    {
      title: 'Numeral & letter height',
      rule: 'Rule 7',
      method: 'Table I / Table II statutory height',
      icon: Ruler,
      status: 'REVIEW_REQUIRED',
      rows: [
        {
          label: 'Estimated character height',
          value: (
            <span className="font-mono">
              {fontHeightMm != null ? `~${fontHeightMm} mm` : 'Not estimated'}
            </span>
          ),
        },
        { label: 'Statutory minimum', value: <span className="font-mono">2.0 – 4.0 mm</span> },
        { label: 'Calibration', value: 'Uncalibrated 2D photograph' },
      ],
      caution: (
        <>
          Millimetre accuracy cannot be certified without a calibrated scale reference in frame.
          This check is always referred for officer measurement.
        </>
      ),
    },
    {
      title: 'Optical sharpness',
      rule: 'Rule 8',
      method: 'Laplacian edge variance, threshold 75.0',
      icon: Focus,
      status: isBlurry ? 'REVIEW_REQUIRED' : 'PASS',
      rows: [
        {
          label: 'Laplacian variance',
          value: (
            <span className={`font-mono ${isBlurry ? 'text-amber-400' : 'text-emerald-400'}`}>
              {blurScore}
            </span>
          ),
        },
        {
          label: 'Classification',
          value: isBlurry ? 'Defocused or blurred' : 'Crisp, well-defined edges',
        },
      ],
      note: isBlurry
        ? 'Motion or optical blur was detected. Characters may be hard for a consumer to read, and extraction accuracy is reduced.'
        : 'Declarations satisfy the statutory legibility requirement for plain and definite characters.',
    },
    {
      title: 'Background contrast',
      rule: 'Rule 8',
      method: 'RMS intensity dispersion, threshold 30.0',
      icon: Eye,
      status: contrastScore < 30 ? 'REVIEW_REQUIRED' : 'PASS',
      rows: [
        { label: 'Contrast score', value: <span className="font-mono">{contrastScore}</span> },
        {
          label: 'Separation quality',
          value:
            contrastScore >= 30
              ? 'High text-to-background distinction'
              : 'Low contrast substrate',
        },
      ],
      note:
        contrastScore >= 30
          ? 'Declarations stand out sufficiently against the commercial artwork and background colours.'
          : 'Declarations may not be conspicuous against the background artwork. Officer confirmation recommended.',
    },
    {
      title: 'MRP area & sticker alteration',
      rule: 'Substrate integrity',
      method: 'Contour boundary & edge density',
      icon: ShieldCheck,
      status: tampering ? 'REVIEW_REQUIRED' : 'PASS',
      rows: [
        {
          label: 'Secondary overlay',
          value: (
            <span className={tampering ? 'text-amber-400' : 'text-emerald-400'}>
              {tampering ? 'Detected (sticker border)' : 'None — directly printed'}
            </span>
          ),
        },
        {
          label: 'Result',
          value: tampering ? 'Manual inspection recommended' : 'Consistent packaging substrate',
        },
      ],
      note:
        facts.tampering_reason ||
        'No evidence of price scratching, secondary stickers, or altered declarations.',
    },
  ];

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title="Visual measurements"
          description="Image-processing metrics supporting Rule 7 height, Rule 8 legibility and substrate integrity."
        />
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {cards.map((c) => (
          <MeasurementPanel key={c.title} card={c} />
        ))}
      </div>
    </div>
  );
};

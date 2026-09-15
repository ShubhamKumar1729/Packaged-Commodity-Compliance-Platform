import React, { useMemo, useState } from 'react';
import { OCRResult } from '../../types';
import { Eye, EyeOff, Search, Hash, SearchX } from 'lucide-react';
import { clsx } from 'clsx';
import { Panel, PanelHeader, Button, TabBar, Tab, EmptyState, Badge, Meter } from '../ui';

interface OCRVisualizerProps {
  imageUrl: string;
  ocrResult: OCRResult;
}

export const OCRVisualizer: React.FC<OCRVisualizerProps> = ({ imageUrl, ocrResult }) => {
  const [hoveredTokenIndex, setHoveredTokenIndex] = useState<number | null>(null);
  const [selectedTokenIndex, setSelectedTokenIndex] = useState<number | null>(null);
  const [showBBoxes, setShowBBoxes] = useState<boolean>(true);
  const [showOrderBadges, setShowOrderBadges] = useState<boolean>(true);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'tokens' | 'fulltext'>('tokens');

  // Keep the ORIGINAL index alongside each token so hover/selection stays in
  // sync with the overlay while the list is filtered.
  const filteredTokens = useMemo(
    () =>
      ocrResult.tokens
        .map((token, index) => ({ token, index }))
        .filter(({ token }) =>
          token.text.toLowerCase().includes(searchFilter.toLowerCase()),
        ),
    [ocrResult.tokens, searchFilter],
  );

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="OCR evidence"
        description="Extracted text with coordinates, confidence and reading order."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={showBBoxes ? 'subtle' : 'ghost'}
              icon={showBBoxes ? Eye : EyeOff}
              onClick={() => setShowBBoxes(!showBBoxes)}
              aria-pressed={showBBoxes}
            >
              Boxes
            </Button>
            <Button
              size="sm"
              variant={showOrderBadges ? 'subtle' : 'ghost'}
              icon={Hash}
              onClick={() => setShowOrderBadges(!showOrderBadges)}
              aria-pressed={showOrderBadges}
            >
              Reading order
            </Button>
          </div>
        }
      />

      <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Image + overlay */}
        <div className="lg:col-span-7 space-y-2">
          <div className="relative rounded-md overflow-hidden bg-gov-900 border border-slate-800 flex items-center justify-center min-h-[320px] select-none">
            <img
              src={imageUrl}
              alt="Inspected package"
              className="w-full h-auto max-h-[560px] object-contain block"
            />

            {showBBoxes && (
              <svg
                className="absolute inset-0 w-full h-full"
                viewBox="0 0 1000 1000"
                preserveAspectRatio="none"
                role="img"
                aria-label="Detected text regions"
              >
                {ocrResult.tokens.map((token, index) => {
                  const [x1, y1, x2, y2] = token.bbox;
                  const isHovered = hoveredTokenIndex === index;
                  const isSelected = selectedTokenIndex === index;

                  const rectX = x1 * 1000;
                  const rectY = y1 * 1000;
                  const rectW = Math.max(15, (x2 - x1) * 1000);
                  const rectH = Math.max(15, (y2 - y1) * 1000);

                  // Theme-aware: resolves through the CSS variables.
                  const strokeColor = isSelected
                    ? 'rgb(var(--accent-500))'
                    : isHovered
                    ? 'rgb(var(--pass-500))'
                    : 'rgb(var(--n-500) / 0.65)';

                  const fillColor = isSelected
                    ? 'rgb(var(--accent-500) / 0.22)'
                    : isHovered
                    ? 'rgb(var(--pass-500) / 0.18)'
                    : 'rgb(var(--n-500) / 0.06)';

                  return (
                    <g key={index} className="cursor-pointer">
                      <rect
                        x={rectX}
                        y={rectY}
                        width={rectW}
                        height={rectH}
                        fill={fillColor}
                        stroke={strokeColor}
                        strokeWidth={isSelected || isHovered ? '3' : '1.5'}
                        rx="3"
                        onMouseEnter={() => setHoveredTokenIndex(index)}
                        onMouseLeave={() => setHoveredTokenIndex(null)}
                        onClick={() => setSelectedTokenIndex(index)}
                      />

                      {showOrderBadges && (
                        <g pointerEvents="none">
                          <rect
                            x={rectX}
                            y={Math.max(0, rectY - 20)}
                            width={24}
                            height={18}
                            fill="rgb(var(--surface-1))"
                            stroke={strokeColor}
                            strokeWidth="1"
                            rx="2"
                          />
                          <text
                            x={rectX + 12}
                            y={Math.max(0, rectY - 20) + 13}
                            fill="rgb(var(--n-200))"
                            fontSize="11"
                            fontWeight="600"
                            textAnchor="middle"
                            fontFamily="ui-monospace, monospace"
                          >
                            {token.line_number ?? index + 1}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </svg>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 text-2xs text-slate-500 flex-wrap">
            <span className="font-mono">
              {ocrResult.image_width} × {ocrResult.image_height} px
            </span>
            <span className="flex items-center gap-2">
              Average confidence
              <span className="font-mono tabular-nums text-slate-300">
                {(ocrResult.average_confidence * 100).toFixed(1)}%
              </span>
            </span>
          </div>
        </div>

        {/* Inspector */}
        <div className="lg:col-span-5 flex flex-col h-[560px] rounded-md border border-slate-800 bg-gov-900 overflow-hidden">
          <TabBar className="px-2 bg-gov-850" label="OCR output">
            <Tab
              active={activeTab === 'tokens'}
              onClick={() => setActiveTab('tokens')}
              count={ocrResult.tokens.length}
            >
              Tokens
            </Tab>
            <Tab active={activeTab === 'fulltext'} onClick={() => setActiveTab('fulltext')}>
              Raw text
            </Tab>
          </TabBar>

          {activeTab === 'tokens' ? (
            <div className="flex flex-col h-full min-h-0">
              <div className="p-3 border-b border-slate-800">
                <div className="relative">
                  <Search
                    className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    placeholder="Filter tokens (e.g. MRP, net qty)"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    aria-label="Filter OCR tokens"
                    className="w-full h-8 pl-8 pr-3 bg-gov-850 border border-slate-700 rounded-md text-xs text-slate-100 placeholder:text-slate-500 hover:border-slate-600 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/25 transition-colors"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0">
                {filteredTokens.length === 0 ? (
                  <EmptyState
                    icon={SearchX}
                    title="No tokens match"
                    description="Try a different search term."
                  />
                ) : (
                  <ul className="divide-y divide-slate-800">
                    {filteredTokens.map(({ token, index }) => {
                      const isHovered = hoveredTokenIndex === index;
                      const isSelected = selectedTokenIndex === index;

                      return (
                        <li key={index}>
                          <button
                            onMouseEnter={() => setHoveredTokenIndex(index)}
                            onMouseLeave={() => setHoveredTokenIndex(null)}
                            onClick={() => setSelectedTokenIndex(index)}
                            aria-pressed={isSelected}
                            className={clsx(
                              'w-full text-left p-3 transition-colors',
                              isSelected
                                ? 'bg-gold-500/10'
                                : isHovered
                                ? 'bg-gov-850'
                                : 'hover:bg-gov-850/60',
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <Badge mono>#{token.line_number ?? index + 1}</Badge>
                              <span className="text-2xs font-mono tabular-nums text-slate-500">
                                {(token.confidence * 100).toFixed(1)}%
                              </span>
                            </div>
                            <p className="mt-1.5 text-xs font-medium text-slate-100 break-words">
                              {token.text}
                            </p>
                            <Meter
                              value={token.confidence * 100}
                              tone={token.confidence >= 0.8 ? 'pass' : token.confidence >= 0.5 ? 'warn' : 'fail'}
                              className="mt-2"
                              label="Token confidence"
                            />
                            <p className="mt-1.5 text-2xs text-slate-600 font-mono">
                              [{token.bbox.map((v) => v.toFixed(2)).join(', ')}]
                            </p>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 p-3 min-h-0">
              <textarea
                readOnly
                aria-label="Full extracted transcript"
                value={ocrResult.full_text}
                className="w-full h-full bg-gov-850 border border-slate-800 rounded-md p-3 text-xs font-mono text-slate-200 focus:outline-none resize-none leading-relaxed"
              />
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
};

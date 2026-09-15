import React from 'react';
import { ComplianceStatus } from '../types';
import { StatusPill } from './ui';
import { verdictMeta } from '../lib/verdict';

interface StatusBadgeProps {
  status?: ComplianceStatus | string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Public API unchanged (status + size) so every existing call site keeps
 * working. Presentation now routes through the shared StatusPill so status
 * treatment is identical across the product.
 */
export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status = 'NOT_APPLICABLE',
  size = 'md',
}) => {
  const meta = verdictMeta(status);
  return <StatusPill kind={meta.kind} label={meta.label} size={size === 'sm' ? 'sm' : 'md'} />;
};

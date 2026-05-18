import React from 'react';
import { Badge, BadgeVariant } from '@kpi-platform/ui';

interface StatusBadgeProps {
  status: 'healthy' | 'warning' | 'critical' | 'active' | 'resolved';
}

const STATUS_MAP: Record<StatusBadgeProps['status'], { variant: BadgeVariant; label: string }> = {
  healthy: { variant: 'success', label: 'Healthy' },
  warning: { variant: 'warning', label: 'Warning' },
  critical: { variant: 'error', label: 'Critical' },
  active: { variant: 'processing', label: 'Active' },
  resolved: { variant: 'stale', label: 'Resolved' },
};

export const StatusBadge = ({ status }: StatusBadgeProps) => {
  const config = STATUS_MAP[status] || { variant: 'default' as BadgeVariant, label: status };

  return (
    <Badge variant={config.variant} size="sm" dot>
      {config.label}
    </Badge>
  );
};

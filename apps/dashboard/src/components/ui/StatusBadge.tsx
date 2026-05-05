import React from 'react';
<<<<<<< HEAD
import { Badge, BadgeVariant } from '@kpi-platform/ui';
=======
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb

interface StatusBadgeProps {
  status: 'healthy' | 'warning' | 'critical' | 'active' | 'resolved';
}

<<<<<<< HEAD
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
=======
export const StatusBadge = ({ status }: StatusBadgeProps) => {
  const styles = {
    healthy: {
      bg: 'rgba(16, 185, 129, 0.1)',
      color: 'var(--accent-green)',
      label: 'Healthy'
    },
    warning: {
      bg: 'rgba(217, 119, 6, 0.1)',
      color: 'var(--accent-orange)',
      label: 'Warning'
    },
    critical: {
      bg: 'rgba(220, 38, 38, 0.1)',
      color: 'var(--accent-red)',
      label: 'Critical'
    },
    active: {
      bg: 'rgba(37, 99, 235, 0.1)',
      color: 'var(--accent-blue)',
      label: 'Active'
    },
    resolved: {
      bg: 'rgba(71, 85, 105, 0.1)',
      color: 'var(--text-secondary)',
      label: 'Resolved'
    }
  }[status] || { bg: 'var(--border-light)', color: 'var(--text-secondary)', label: status };

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 10px',
      borderRadius: '20px',
      background: styles.bg,
      color: styles.color,
      fontSize: '11px',
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: '0.4px',
      border: `1px solid ${styles.color}15`
    }}>
      <div style={{
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: styles.color,
      }} />
      {styles.label}
    </div>
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
  );
};

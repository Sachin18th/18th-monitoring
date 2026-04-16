import React from 'react';

interface StatusBadgeProps {
  status: 'healthy' | 'warning' | 'critical' | 'active' | 'resolved';
}

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
  );
};

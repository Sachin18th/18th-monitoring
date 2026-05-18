import React from 'react';
import { MetricCard } from '@kpi-platform/ui';
import { ShieldAlert, Activity, ScrollText, CheckCircle2, Siren, TriangleAlert } from 'lucide-react';

export interface VisibilityStats {
  activeAlerts: number;
  criticalAlerts: number;
  unresolvedIncidents: number;
  recentAuditActions: number;
}

export interface ObservabilityHeaderProps {
  stats: VisibilityStats;
  loading?: boolean;
}

export const ObservabilityHeader: React.FC<ObservabilityHeaderProps> = ({ stats, loading }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <MetricCard
        title="Critical Incidents"
        value={stats.criticalAlerts}
        icon={ShieldAlert}
        loading={loading}
        state={stats.criticalAlerts > 0 ? 'error' : 'success'}
      />
      <MetricCard
        title="Active Alerts"
        value={stats.activeAlerts}
        icon={Siren}
        loading={loading}
        state={stats.activeAlerts > 5 ? 'error' : stats.activeAlerts > 0 ? 'warning' : 'success'}
      />
      <MetricCard
        title="System Activity"
        value="Healthy"
        icon={Activity}
        loading={loading}
        state="success"
      />
      <MetricCard
        title="Recent Audit Actions"
        value={stats.recentAuditActions}
        icon={ScrollText}
        loading={loading}
        state="info"
      />
    </div>
  );
};

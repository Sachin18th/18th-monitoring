import React from 'react';
import { MetricCard } from '@kpi-platform/ui';
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  RefreshCw,
  Clock,
  ShieldCheck,
  Link2
} from 'lucide-react';

export interface IntegrationSummaryProps {
  stats: {
    total: number;
    healthy: number;
    degraded: number;
    critical: number;
    stale: number;
    successRate: number | string;
    avgLatency: number | string;
  };
  loading?: boolean;
}

export const IntegrationSummary: React.FC<IntegrationSummaryProps> = ({ stats, loading }) => {
  const numericSuccessRate =
    typeof stats.successRate === 'number' ? stats.successRate : Number(stats.successRate);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <MetricCard
        title="Total Connectors"
        value={stats.total}
        icon={Link2}
        loading={loading}
        state="info"
      />
      <MetricCard
        title="Service Availability"
        value={stats.successRate}
        unit="%"
        icon={ShieldCheck}
        loading={loading}
        state={Number.isFinite(numericSuccessRate) ? (numericSuccessRate > 95 ? 'success' : numericSuccessRate > 85 ? 'warning' : 'error') : 'default'}
      />
      <MetricCard
        title="Degraded / Critical"
        value={`${stats.degraded} / ${stats.critical}`}
        icon={AlertTriangle}
        loading={loading}
        state={stats.critical > 0 ? 'error' : stats.degraded > 0 ? 'warning' : 'success'}
      />
      <MetricCard
        title="Data Freshness (Avg)"
        value={stats.avgLatency}
        unit="ms"
        icon={Clock}
        loading={loading}
        state="default"
      />
    </div>
  );
};

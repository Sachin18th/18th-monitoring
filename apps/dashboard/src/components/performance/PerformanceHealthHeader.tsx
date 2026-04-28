import React from 'react';
import { MetricCard } from '@kpi-platform/ui';
import { Gauge, Zap, AlertTriangle, ShieldCheck, Clock, Activity } from 'lucide-react';

export interface PerformanceStats {
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  errorRate: number;
  affectedServices: number;
  uptime: number;
}

export interface PerformanceHealthHeaderProps {
  summary: PerformanceStats;
  loading?: boolean;
}

export const PerformanceHealthHeader: React.FC<PerformanceHealthHeaderProps> = ({ summary, loading }) => {
  const stats = summary || { p50: 0, p75: 0, p90: 0, p95: 0, p99: 0, errorRate: 0, affectedServices: 0, uptime: 0 };
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <MetricCard
        title="Baseline Latency (p50)"
        value={stats.p50}
        unit="ms"
        icon={Clock as any}
        loading={loading}
        state={stats.p50 > 1500 ? 'warning' : 'success'}
      />
      <MetricCard
        title="Edge Latency (p95)"
        value={stats.p95}
        unit="ms"
        icon={Zap as any}
        loading={loading}
        state={stats.p95 > 3000 ? 'error' : stats.p95 > 2000 ? 'warning' : 'success'}
      />
      <MetricCard
        title="Technical Error Rate"
        value={stats.errorRate}
        unit="%"
        icon={Activity as any}
        loading={loading}
        state={stats.errorRate > 1.0 ? 'error' : stats.errorRate > 0.5 ? 'warning' : 'success'}
      />
      <MetricCard
        title="System Availability"
        value={stats.uptime}
        unit="%"
        icon={ShieldCheck as any}
        loading={loading}
        state="success"
      />
    </div>
  );
};

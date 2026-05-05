import React from 'react';
import { MetricCard } from '@kpi-platform/ui';
import { Users, UserCheck, UserPlus, Fingerprint, Award, TrendingUp } from 'lucide-react';

export interface CustomerStats {
  totalUsers: number;
  activeUsers: number;
  identifiedRatio: number;
  newVsReturning: number;
  sessions: number;
}

export interface CustomerDiscoveryHeaderProps {
  stats: CustomerStats;
  loading?: boolean;
}

export const CustomerDiscoveryHeader: React.FC<CustomerDiscoveryHeaderProps> = ({ stats, loading }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <MetricCard
        title="Audience Reach"
        value={stats.totalUsers}
        icon={Users}
        loading={loading}
        state="info"
        trend={{ value: 12.4, isUp: true, label: 'vs last 30d' }}
      />
      <MetricCard
        title="Identity Maturity"
        value={stats.identifiedRatio}
        unit="%"
        icon={Fingerprint}
        loading={loading}
        state={stats.identifiedRatio > 50 ? 'success' : 'warning'}
      />
      <MetricCard
        title="Live Engagement"
        value={stats.activeUsers}
        icon={UserCheck}
        loading={loading}
        state="success"
      />
      <MetricCard
        title="Acquisition Mix"
        value={stats.newVsReturning}
        unit="% new"
        icon={UserPlus}
        loading={loading}
        state="default"
      />
    </div>
  );
};

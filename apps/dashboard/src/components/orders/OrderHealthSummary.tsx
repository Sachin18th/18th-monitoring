import React from 'react';
import { MetricCard } from '@kpi-platform/ui';
import { 
  Package, 
  TrendingUp, 
  Clock, 
  AlertTriangle, 
  ShoppingBag, 
  Globe,
  Zap
} from 'lucide-react';

export interface OrderHealthStats {
  totalOrders: number;
  ordersThisHour: number;
  onlineSplit: number;
  offlineSplit: number;
  delayedCount: number;
  failedCount: number;
  ordersPerMinute: string;
}

export interface OrderHealthSummaryProps {
  stats: OrderHealthStats;
  loading?: boolean;
}

export const OrderHealthSummary: React.FC<OrderHealthSummaryProps> = ({ stats, loading }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <MetricCard
        title="Order Velocity"
        value={stats.ordersPerMinute}
        unit="rpm"
        icon={Zap}
        loading={loading}
        state="success"
        trend={{ value: 5.4, isUp: true, label: 'vs avg' }}
      />
      <MetricCard
        title="Revenue Dist. (Online)"
        value={stats.onlineSplit}
        unit="%"
        icon={Globe}
        loading={loading}
        state="info"
      />
      <MetricCard
        title="Operational Delays"
        value={stats.delayedCount}
        icon={Clock}
        loading={loading}
        state={stats.delayedCount > 10 ? 'error' : stats.delayedCount > 0 ? 'warning' : 'success'}
      />
      <MetricCard
        title="System Failures"
        value={stats.failedCount}
        icon={AlertTriangle}
        loading={loading}
        state={stats.failedCount > 0 ? 'error' : 'success'}
      />
    </div>
  );
};

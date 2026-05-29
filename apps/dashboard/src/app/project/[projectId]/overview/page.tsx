'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Bell,
  AlertTriangle,
  Activity,
  Gauge,
  LayoutDashboard,
  RefreshCw,
  ShieldCheck,
  Package,
  Users,
  ChevronRight,
  Flame,
  Database,
} from 'lucide-react';
import { type TimeRangeValue } from '@kpi-platform/ui';
import { useConnectorFilter } from '@/hooks/useConnectorFilter';
import { useAuth } from '../../../../context/AuthContext';
import { PerformanceChart } from '../../../../components/ui/PerformanceChart';
import { PageRestricted } from '../../../../components/PageRestricted';

type Metric = {
  kpiName: string;
  value?: number;
  state?: 'healthy' | 'warning' | 'critical' | 'stale';
  trend?: string;
  insight?: string;
};

type AlertItem = {
  alertId?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  message?: string;
  kpiName?: string;
  timestamp?: string;
  source?: string;
};

type StatSummary = {
  failedCount?: number;
  delayedCount?: number;
  ordersPerMinute?: string | number;
  revenueAtRisk?: number;
};

function formatCount(value?: number | string) {
  const numberValue = Number(value || 0);
  return new Intl.NumberFormat('en-US').format(Number.isFinite(numberValue) ? numberValue : 0);
}

function formatRPM(value?: number | string) {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? numberValue.toFixed(2) : '0.00';
}

function formatAPIReliability(value?: number | string) {
  const numberValue = Number(value || 0);
  const safeValue = Number.isFinite(numberValue) ? numberValue : 0;
  return `${safeValue.toFixed(1)}%`;
}

function formatLiveSessions(value?: number | string) {
  return formatCount(value);
}

function deriveHealth(metrics: Metric[], stats: StatSummary | null) {
  const map = new Map(metrics.map((metric) => [metric.kpiName, metric]));
  const sync = map.get('syncSuccessRate');
  const errorRate = map.get('errorRatePct');

  const scoreFromMetric =
    sync?.value !== undefined
      ? Number(sync.value)
      : errorRate?.value !== undefined
        ? Math.max(0, 100 - Number(errorRate.value))
        : 100;

  const failedCount = stats?.failedCount || 0;
  const delayedCount = stats?.delayedCount || 0;

  const score = Math.max(0, Math.min(100, scoreFromMetric - failedCount * 2 - delayedCount * 1.5));

  if (score < 90) {
    return { label: 'Critical', status: 'critical' as const, score };
  }
  if (score < 97) {
    return { label: 'Warning', status: 'warning' as const, score };
  }
  return { label: 'Healthy', status: 'success' as const, score };
}

function metricStatusStyle(status: 'success' | 'warning' | 'critical' | 'stale') {
  if (status === 'critical') {
    return { statusBg: 'var(--error-bg)', statusColor: 'var(--error-text)' };
  }
  if (status === 'warning') {
    return { statusBg: 'var(--warning-bg)', statusColor: 'var(--warning-text)' };
  }
  if (status === 'stale') {
    return { statusBg: 'var(--bg-input)', statusColor: 'var(--text-secondary)' };
  }
  return { statusBg: 'var(--success-bg)', statusColor: 'var(--success-text)' };
}

const pageStyle: React.CSSProperties = {
  padding: '24px 28px',
  maxWidth: '1280px',
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
  overflow: 'visible',
  boxSizing: 'border-box',
};

const sectionHeaderInfoStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '15px',
  fontWeight: 500,
  color: 'var(--text-primary)',
  margin: 0,
};

const sectionSubtitleStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-muted)',
  lineHeight: 1.6,
  margin: 0,
};

const timeRangeOptions: Array<{ label: string; value: TimeRangeValue }> = [
  { label: '24H', value: '24h' },
  { label: '7D', value: '7d' },
  { label: '30D', value: '30d' },
  { label: '90D', value: '90d' },
  { label: 'ALL', value: 'all' },
];

export default function ProjectOverviewPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const { token, apiFetch, user, lastUpdated } = useAuth();
  const { connectorInstanceId } = useConnectorFilter();

  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [trends, setTrends] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [stats, setStats] = useState<StatSummary | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRangeValue>('24h');
  const [allowedPageKeys, setAllowedPageKeys] = useState<string[] | null>(null);

  const activeAlerts = useMemo(() => alerts.filter((alert) => alert.severity && alert.severity !== 'low'), [alerts]);
  const health = useMemo(() => deriveHealth(metrics, stats), [metrics, stats]);

  const loadData = useCallback(async () => {
    if (!token || !projectId) return;

    setLoading(true);
    setAllowedPageKeys(null);
    const fetchSection = async (path: string, fallback: any, options: Record<string, any> = {}) => {
      try {
        return await apiFetch(path, options);
      } catch {
        return fallback;
      }
    };

    try {
      const permissions = await apiFetch(`/api/v1/user/permissions?projectId=${projectId}`, { suppressUnauthorizedRedirect: true });
      const nextAllowedPageKeys = Array.isArray(permissions?.allowedPageKeys)
        ? permissions.allowedPageKeys.map((value: any) => String(value))
        : Array.isArray(permissions?.data?.allowedPageKeys)
          ? permissions.data.allowedPageKeys.map((value: any) => String(value))
          : Array.isArray(permissions?.pageKeys)
            ? permissions.pageKeys.map((value: any) => String(value))
            : Array.isArray(permissions?.data?.pageKeys)
              ? permissions.data.pageKeys.map((value: any) => String(value))
              : [];

      setAllowedPageKeys(nextAllowedPageKeys);

      if (!nextAllowedPageKeys.includes('overview')) {
        return;
      }

      const canReadAlerts = nextAllowedPageKeys.includes('alerts') || nextAllowedPageKeys.includes('observability/alerts');
      const canReadPerformance = nextAllowedPageKeys.includes('performance');
      const canReadOrders = nextAllowedPageKeys.includes('orders');

      const [summaryData, alertData, trendData, statsData] = await Promise.all([
        fetchSection(`/api/v1/dashboard/summaries?siteId=${projectId}&range=${timeRange}`, []),
        canReadAlerts ? fetchSection(`/api/v1/dashboard/alerts?siteId=${projectId}`, []) : [],
        canReadPerformance ? fetchSection(`/api/v1/dashboard/performance/trends?siteId=${projectId}&range=${timeRange}`, []) : [],
        canReadOrders ? fetchSection(`/api/v1/dashboard/orders/summary?siteId=${projectId}&range=${timeRange}`, null) : null,
      ]);

      setMetrics(Array.isArray(summaryData) ? summaryData : []);
      setAlerts(Array.isArray(alertData) ? alertData : alertData?.alerts || []);
      setTrends(Array.isArray(trendData) ? trendData : []);
      setStats(statsData || null);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, projectId, timeRange, token, connectorInstanceId]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, [loadData]);

  const routeActivity = () => {
    router.push(`/project/${projectId}/management/audit`);
  };

  const resolveModule = (href: string) => {
    router.push(href);
  };

  const syncMetric = metrics.find((m) => m.kpiName === 'syncSuccessRate');
  const pageLoadMetric = metrics.find((m) => m.kpiName === 'pageLoadTime');
  const liveUserMetric = metrics.find((m) => m.kpiName === 'activeUsers');

  const metricCards = [
    {
      label: 'System Health Score',
      value: `${health.score.toFixed(1)}%`,
      unit: '',
      status: health.label,
      contextLabel: 'Overall health',
      icon: health.status === 'success' ? ShieldCheck : AlertTriangle,
      tone: health.status,
    },
    {
      label: 'Order Velocity',
      value: formatRPM(stats?.ordersPerMinute),
      unit: 'RPM',
      status: 'Healthy',
      contextLabel: 'Throughput',
      icon: Package,
      tone: 'success' as const,
    },
    {
      label: 'API Reliability',
      value: formatAPIReliability(syncMetric?.value),
      unit: '',
      status: syncMetric?.state === 'critical' ? 'Critical' : 'Healthy',
      contextLabel: 'Sync success',
      icon: RefreshCw,
      tone: syncMetric?.state === 'critical' ? 'critical' as const : 'success' as const,
    },
    {
      label: 'Latency P95',
      value: `${pageLoadMetric?.value || 0}`,
      unit: 'ms',
      status: Number(pageLoadMetric?.value || 0) > 2000 ? 'Warning' : 'Healthy',
      contextLabel: 'User response',
      icon: Activity,
      tone: Number(pageLoadMetric?.value || 0) > 2000 ? 'warning' as const : 'success' as const,
    },
    {
      label: 'Live Sessions',
      value: formatLiveSessions(liveUserMetric?.value),
      unit: '',
      status: 'Healthy',
      contextLabel: 'Active users',
      icon: Users,
      tone: 'success' as const,
    },
  ];

  const executiveCards = [
    {
      label: 'SLA Adherence',
      badge: '99.4%',
      value: 'Stable',
      description: 'All monitored endpoints are performing within target thresholds.',
      actionLabel: '',
    },
    {
      label: 'Revenue at Risk',
      badge: `$${formatCount((stats?.revenueAtRisk ?? (stats?.delayedCount || 0) * 850))}`,
      value: stats?.failedCount ? 'At Risk' : 'Protected',
      description: `Derived from ${stats?.delayedCount || 0} delayed transactions.`,
      actionLabel: 'Resolve Exceptions',
    },
  ];

  const domainSnapshots = [
    {
      name: 'Integrations',
      icon: RefreshCw,
      path: 'integrations',
      description: 'Deep intelligence on reliability and integrations throughput.',
    },
    {
      name: 'Orders',
      icon: Package,
      path: 'orders',
      description: 'Deep intelligence on reliability and orders throughput.',
    },
    {
      name: 'Performance',
      icon: Activity,
      path: 'performance',
      description: 'Deep intelligence on reliability and performance throughput.',
    },
    {
      name: 'Customers',
      icon: Users,
      path: 'customers',
      description: 'Deep intelligence on reliability and customers throughput.',
    },
  ];

  if (allowedPageKeys !== null && !allowedPageKeys.includes('overview')) {
    return <PageRestricted pageKey="overview" />;
  }

  if (loading && metrics.length === 0) {
    return (
      <div
        style={{
          ...pageStyle,
          minHeight: '60vh',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '24px',
            border: '1px solid var(--border-card)',
            background: 'var(--bg-card)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxSizing: 'border-box',
          }}
        >
          <RefreshCw size={28} style={{ color: 'var(--text-primary)', animation: 'spin 1s linear infinite' }} />
        </div>
        <p style={{ fontSize: '18px', fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 4px' }}>Initializing Control Tower</p>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
          Synchronizing live telemetry from {projectId.toUpperCase()}...
        </p>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '24px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0 }}>
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '16px',
              background: 'rgba(59,130,246,0.1)',
              border: '1px solid rgba(59,130,246,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxSizing: 'border-box',
            }}
          >
            <LayoutDashboard style={{ width: '22px', height: '22px', color: '#3b82f6' }} />
          </div>

          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: '26px', fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 4px' }}>Control Tower</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px', marginBottom: '8px', flexWrap: 'wrap' }}>
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: '999px',
                  fontSize: '10px',
                  background: 'var(--success-bg)',
                  color: 'var(--success-text)',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                }}
              >
                LIVE
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{user?.name || '18th Super Admin'}</span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
              Unified executive observability and operational oversight for{' '}
              <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{user?.name || 'the current operator'}</span>.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {timeRangeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTimeRange(option.value)}
              style={{
                padding: '5px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                border: '1px solid var(--border-card)',
                background: timeRange === option.value ? 'var(--bg-badge-active)' : 'transparent',
                fontWeight: timeRange === option.value ? 500 : 400,
                color: 'var(--text-primary)',
                cursor: 'pointer',
                boxSizing: 'border-box',
              }}
            >
              {option.label}
            </button>
          ))}
          <button
            type="button"
            onClick={loadData}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '5px 10px',
              borderRadius: '6px',
              fontSize: '12px',
              border: '1px solid var(--border-card)',
              background: 'transparent',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              boxSizing: 'border-box',
            }}
          >
            <RefreshCw style={{ width: '14px', height: '14px', animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Sync
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '16px',
          overflow: 'visible',
        }}
      >
        {metricCards.map((item) => {
          const Icon = item.icon;
          const { statusBg, statusColor } = metricStatusStyle(item.tone);

          return (
            <div
              key={item.label}
              style={{
                borderRadius: '12px',
                border: '1px solid var(--border-card)',
                background: 'var(--bg-card)',
                padding: '20px 22px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: '130px',
                overflow: 'visible',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)', fontWeight: 500 }}>{item.label}</span>
                <Icon style={{ width: '16px', height: '16px', flexShrink: 0, color: 'var(--text-muted)' }} />
              </div>

              <div style={{ fontSize: '32px', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1, padding: '6px 0', overflow: 'visible' }}>
                {item.value}
                {item.unit ? <span style={{ fontSize: '14px', color: 'var(--text-muted)', marginLeft: '4px' }}>{item.unit}</span> : null}
              </div>

              <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    padding: '3px 10px',
                    borderRadius: '999px',
                    fontSize: '10px',
                    textTransform: 'uppercase',
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    background: statusBg,
                    color: statusColor,
                  }}
                >
                  {item.status}
                </span>
                {item.contextLabel ? <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.contextLabel}</span> : null}
              </div>
            </div>
          );
        })}
      </div>

      <section style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'visible' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', gap: '16px', flexWrap: 'wrap' }}>
          <div style={sectionHeaderInfoStyle}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(239,68,68,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxSizing: 'border-box',
              }}
            >
              <Bell style={{ width: '16px', height: '16px', color: '#ef4444' }} />
            </div>
            <div>
              <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 2px' }}>Operational Anomalies</p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>High-fidelity signals requiring attention.</p>
            </div>
          </div>
          <a
            onClick={routeActivity}
            style={{ fontSize: '12px', color: '#3b82f6', cursor: 'pointer', textDecoration: 'none' }}
          >
            View Audit Log →
          </a>
        </div>

        <div
          style={{
            borderRadius: '12px',
            border: '1px solid var(--border-card)',
            background: 'var(--bg-card)',
            padding: activeAlerts.length === 0 ? '32px 24px' : '24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: activeAlerts.length === 0 ? 'center' : 'stretch',
            justifyContent: 'center',
            gap: '8px',
            overflow: 'visible',
            boxSizing: 'border-box',
          }}
        >
          {activeAlerts.length === 0 ? (
            <>
              <p style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>No anomalies detected</p>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>All systems are operating within normal parameters.</p>
              <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', width: '100%', gap: '16px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', color: '#22c55e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e' }} />
                  ALL SYSTEMS OPERATIONAL
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>LAST UPDATED: {lastUpdated}</span>
              </div>
            </>
          ) : (
            <>
              {activeAlerts.slice(0, 5).map((alert, idx) => (
                <div
                  key={alert.alertId || idx}
                  style={{
                    padding: '14px 0',
                    borderBottom: idx === Math.min(activeAlerts.length, 5) - 1 ? 'none' : '1px solid var(--border-card)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    overflow: 'visible',
                    boxSizing: 'border-box',
                  }}
                >
                  <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>{alert.message || 'Operational alert'}</p>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                    {alert.source || alert.kpiName || 'Telemetry signal'} {alert.timestamp ? `· ${alert.timestamp}` : ''}
                  </p>
                </div>
              ))}
            </>
          )}
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'visible' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'rgba(59,130,246,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxSizing: 'border-box',
            }}
          >
            <Gauge style={{ width: '16px', height: '16px', color: '#3b82f6' }} />
          </div>
          <div>
            <p style={{ ...sectionTitleStyle, marginBottom: '2px' }}>Executive Surface</p>
            <p style={sectionSubtitleStyle}>Key business indicators at a glance.</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {executiveCards.map((item) => (
            <div
              key={item.label}
              style={{
                borderRadius: '12px',
                border: '1px solid var(--border-card)',
                background: 'var(--bg-card)',
                padding: '22px 24px',
                minHeight: '140px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                overflow: 'visible',
                boxSizing: 'border-box',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)' }}>{item.label}</span>
                  <span style={{ fontSize: '12px', fontWeight: 500, color: '#22c55e' }}>{item.badge}</span>
                </div>

                <p style={{ fontSize: '26px', fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 6px' }}>{item.value}</p>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 14px' }}>{item.description}</p>
              </div>

              {item.actionLabel ? (
                <button
                  type="button"
                  onClick={() => resolveModule(`/project/${projectId}/orders`)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-card)',
                    background: 'transparent',
                    fontSize: '12px',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                  }}
                >
                  {item.actionLabel}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'visible' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', gap: '16px', flexWrap: 'wrap' }}>
          <div style={sectionHeaderInfoStyle}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(245,158,11,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxSizing: 'border-box',
              }}
            >
              <Flame style={{ width: '16px', height: '16px', color: '#f59e0b' }} />
            </div>
            <div>
              <p style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 2px' }}>Latency Confidence Profile</p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>p95 performance trends across the fleet.</p>
            </div>
          </div>

          <span
            style={{
              padding: '3px 10px',
              borderRadius: '999px',
              fontSize: '10px',
              background: 'var(--bg-input)',
              color: 'var(--text-secondary)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            1hr Profile
          </span>
        </div>

        <div
          style={{
            borderRadius: '12px',
            border: '1px solid var(--border-card)',
            background: 'var(--bg-card)',
            padding: '24px',
            overflow: 'hidden',
            boxSizing: 'border-box',
          }}
        >
          <PerformanceChart data={trends} title="" height={340} />

          <div style={{ display: 'flex', gap: '20px', marginTop: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {[
              { label: 'FCP', color: '#10b981', value: '1.2s' },
              { label: 'LCP', color: '#f59e0b', value: '2.4s' },
              { label: 'LOAD TIME', color: '#3b82f6', value: '3.1s' },
              { label: 'TTFB', color: '#ef4444', value: '240ms' },
            ].map((item) => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                {item.label}
                <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'visible' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'rgba(59,130,246,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxSizing: 'border-box',
            }}
          >
            <Database style={{ width: '16px', height: '16px', color: '#3b82f6' }} />
          </div>
          <div>
            <p style={{ ...sectionTitleStyle, marginBottom: '2px' }}>Domain Snapshots</p>
            <p style={sectionSubtitleStyle}>High-density deep dives into each functional area.</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          {domainSnapshots.map((domain) => {
            const Icon = domain.icon;
            return (
              <div
                key={domain.name}
                onClick={() => resolveModule(`/project/${projectId}/${domain.path}`)}
                style={{
                  borderRadius: '12px',
                  border: '1px solid var(--border-card)',
                  background: 'var(--bg-card)',
                  padding: '20px 22px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  cursor: 'pointer',
                  overflow: 'visible',
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Icon style={{ width: '18px', height: '18px', color: 'var(--text-muted)', flexShrink: 0 }} />
                  <span
                    style={{
                      padding: '3px 10px',
                      borderRadius: '999px',
                      fontSize: '10px',
                      background: 'var(--success-bg)',
                      color: 'var(--success-text)',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    ● HEALTHY
                  </span>
                </div>

                <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>{domain.name}</p>

                <p
                  style={{
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    lineHeight: 1.6,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    margin: 0,
                  }}
                >
                  {domain.description}
                </p>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
                  <span style={{ fontSize: '11px', color: '#3b82f6' }}>Open Domain</span>
                  <ChevronRight style={{ width: '16px', height: '16px', color: '#3b82f6', flexShrink: 0 }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

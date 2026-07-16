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
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { type TimeRangeValue } from '@kpi-platform/ui';
import { useConnectorFilter } from '@/hooks/useConnectorFilter';
import { useAuth } from '../../../../context/AuthContext';
import { PerformanceChart } from '../../../../components/ui/PerformanceChart';
import { PageRestricted } from '../../../../components/PageRestricted';
import { PageHero } from '../../../../components/PageHero';

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
  totalOrders?: number;
  totalRevenue?: number;
  failedCount?: number;
  delayedCount?: number;
  ordersPerMinute?: string | number;
  revenueAtRisk?: number;
  atRiskOrderCount?: number;
};

type PerfSummary = {
  p95?: number;
  avg?: number;
  uptime?: number;
  errorRate?: number;
  fcp?: number;
  lcp?: number;
  ttfb?: number;
};

type IntegrationSummary = {
  successRate?: number;
  failureCount24h?: number;
  avgOmsLatency?: number;
  healthScore?: number;
};

type UserActivitySummary = {
  totalUsers?: number;
  activeUsers?: number;
  sessions?: number;
};

type TrendPoint = { timestamp: string; [key: string]: string | number };

function formatCount(value?: number | string) {
  const numberValue = Number(value || 0);
  return new Intl.NumberFormat('en-US').format(Number.isFinite(numberValue) ? numberValue : 0);
}

function formatAPIReliability(value?: number | string) {
  const numberValue = Number(value || 0);
  const safeValue = Number.isFinite(numberValue) ? numberValue : 0;
  return `${safeValue.toFixed(1)}%`;
}

function formatLiveSessions(value?: number | string) {
  return formatCount(value);
}

function formatMs(value?: number) {
  const numberValue = Number(value || 0);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return '—';
  return numberValue >= 1000 ? `${(numberValue / 1000).toFixed(2)}s` : `${Math.round(numberValue)}ms`;
}

// Composite health score derived from the real domain summaries. We anchor on the
// integration sync success rate (or performance uptime when integrations are not
// readable) and then penalise live failed/delayed orders, so the headline score
// tracks the same signals the operator sees in the cards below.
function deriveHealth(
  perf: PerfSummary | null,
  integration: IntegrationSummary | null,
  stats: StatSummary | null
) {
  const baseline =
    integration?.healthScore !== undefined
      ? Number(integration.healthScore)
      : integration?.successRate !== undefined
        ? Number(integration.successRate)
        : perf?.uptime !== undefined
          ? Number(perf.uptime)
          : 100;

  const failedCount = stats?.failedCount || 0;
  const delayedCount = stats?.delayedCount || 0;

  const score = Math.max(0, Math.min(100, baseline - failedCount * 2 - delayedCount * 1.5));

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
  const [perf, setPerf] = useState<PerfSummary | null>(null);
  const [integration, setIntegration] = useState<IntegrationSummary | null>(null);
  const [userActivity, setUserActivity] = useState<UserActivitySummary | null>(null);
  const [liveUsers, setLiveUsers] = useState<number | null>(null);
  const [syncTrends, setSyncTrends] = useState<TrendPoint[]>([]);
  const [orderTrends, setOrderTrends] = useState<TrendPoint[]>([]);
  const [timeRange] = useState<TimeRangeValue>('24h');
  const [allowedPageKeys, setAllowedPageKeys] = useState<string[] | null>(null);

  const activeAlerts = useMemo(() => alerts.filter((alert) => alert.severity && alert.severity !== 'low'), [alerts]);
  const health = useMemo(() => deriveHealth(perf, integration, stats), [perf, integration, stats]);

  const loadData = useCallback(async () => {
    if (!token || !projectId) return;

    setLoading(true);
    setAllowedPageKeys(null);
    const fetchSection = async (path: string, fallback: any, options: Record<string, any> = {}) => {
      try {
        // Suppress the global /unauthorized redirect: a single restricted section
        // (e.g. orders/performance for ops-lead/analyst) must degrade to its fallback,
        // not bounce the entire overview page to the 403 screen.
        return await apiFetch(path, { suppressUnauthorizedRedirect: true, ...options });
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
      const canReadIntegrations = nextAllowedPageKeys.includes('integrations');
      const canReadCustomers = nextAllowedPageKeys.includes('customers');

      const [
        summaryData,
        alertData,
        trendData,
        statsData,
        perfData,
        integrationData,
        userData,
        syncTrendData,
        orderTrendData,
        liveData,
      ] = await Promise.all([
        fetchSection(`/api/v1/dashboard/summaries?siteId=${projectId}&range=${timeRange}`, []),
        canReadAlerts ? fetchSection(`/api/v1/dashboard/alerts?siteId=${projectId}`, []) : [],
        canReadPerformance ? fetchSection(`/api/v1/dashboard/performance/trends?siteId=${projectId}&range=${timeRange}`, []) : [],
        canReadOrders ? fetchSection(`/api/v1/dashboard/orders/summary?siteId=${projectId}&range=${timeRange}`, null) : null,
        canReadPerformance ? fetchSection(`/api/v1/dashboard/performance/summary?siteId=${projectId}&range=${timeRange}`, null) : null,
        canReadIntegrations ? fetchSection(`/api/v1/dashboard/integrations/summary?siteId=${projectId}&range=${timeRange}`, null) : null,
        canReadCustomers ? fetchSection(`/api/v1/dashboard/customers/summary?siteId=${projectId}&range=${timeRange}`, null) : null,
        canReadIntegrations ? fetchSection(`/api/v1/dashboard/integrations/trends?siteId=${projectId}&range=${timeRange}`, []) : [],
        canReadOrders ? fetchSection(`/api/v1/dashboard/orders/trends?siteId=${projectId}&range=${timeRange}`, []) : [],
        canReadCustomers && connectorInstanceId
          ? fetchSection(`/api/track/live?connector_instance_id=${connectorInstanceId}`, null)
          : null,
      ]);

      setMetrics(Array.isArray(summaryData) ? summaryData : []);
      setAlerts(Array.isArray(alertData) ? alertData : alertData?.alerts || []);
      setTrends(Array.isArray(trendData) ? trendData : []);
      setStats(statsData || null);
      setPerf(perfData || null);
      setIntegration(integrationData || null);
      setUserActivity(userData || null);
      setSyncTrends(Array.isArray(syncTrendData) ? syncTrendData : []);
      setOrderTrends(Array.isArray(orderTrendData) ? orderTrendData : []);
      setLiveUsers(typeof liveData?.liveUsers === 'number' ? liveData.liveUsers : null);
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

  // Page-key driven visibility. Admin/super-admin (no explicit rows) get every key,
  // so all cards stay visible; ops-lead / analyst only see cards their permissions allow.
  // While permissions are still loading (null) we optimistically show, the loading
  // spinner covers that window.
  const canSee = useCallback(
    (key: string) => allowedPageKeys === null || allowedPageKeys.includes(key),
    [allowedPageKeys]
  );

  // Real values sourced from the dedicated domain summaries. The legacy
  // `summaries` endpoint only returns revenue/pageLoadTime/orders/aov, so the
  // sync-success / latency / sessions cards now read from their own endpoints.
  const apiReliability = integration?.successRate ?? (perf?.uptime ? 100 - (perf.errorRate || 0) : undefined);
  const latencyP95 = perf?.p95 ?? (metrics.find((m) => m.kpiName === 'pageLoadTime')?.value);
  const liveSessions = userActivity?.activeUsers ?? userActivity?.sessions;

  const latencyTone = Number(latencyP95 || 0) > 3000 ? 'critical' : Number(latencyP95 || 0) > 2000 ? 'warning' : 'success';
  const reliabilityTone = Number(apiReliability ?? 100) < 90 ? 'critical' : Number(apiReliability ?? 100) < 99 ? 'warning' : 'success';

  const metricCards = [
    {
      label: 'System Health Score',
      value: `${health.score.toFixed(1)}%`,
      unit: '',
      status: health.label,
      contextLabel: 'Overall health',
      icon: health.status === 'success' ? ShieldCheck : AlertTriangle,
      tone: health.status,
      pageKey: null,
    },
    {
      label: 'API Reliability',
      value: formatAPIReliability(apiReliability),
      unit: '',
      status: reliabilityTone === 'critical' ? 'Critical' : reliabilityTone === 'warning' ? 'Warning' : 'Healthy',
      contextLabel: 'Sync success',
      icon: RefreshCw,
      tone: reliabilityTone as 'success' | 'warning' | 'critical',
      pageKey: 'integrations',
    },
    {
      label: 'Latency P95',
      value: formatMs(Number(latencyP95 || 0)),
      unit: '',
      status: latencyTone === 'critical' ? 'Critical' : latencyTone === 'warning' ? 'Warning' : 'Healthy',
      contextLabel: 'User response',
      icon: Activity,
      tone: latencyTone as 'success' | 'warning' | 'critical',
      pageKey: 'performance',
    },
    {
      label: 'Live Users',
      value: formatLiveSessions(liveUsers ?? undefined),
      unit: '',
      status: 'Healthy',
      contextLabel: 'Active now',
      icon: Users,
      tone: 'success' as const,
      pageKey: 'customers',
    },
  ].filter((card) => !card.pageKey || canSee(card.pageKey));

  const uptimeValue = perf?.uptime;
  const slaBadge = uptimeValue !== undefined ? `${Number(uptimeValue).toFixed(2)}%` : '—';
  const slaStable = uptimeValue === undefined || Number(uptimeValue) >= 99;

  // Real count of orders contributing to the at-risk revenue figure. Falls back
  // to failed+delayed when the backend hasn't supplied the explicit count yet.
  const atRiskOrderCount = stats?.atRiskOrderCount ?? ((stats?.failedCount || 0) + (stats?.delayedCount || 0));

  const executiveCards = [
    {
      label: 'SLA Adherence',
      badge: slaBadge,
      badgeColor: slaStable ? '#22c55e' : '#ef4444',
      value: slaStable ? 'Stable' : 'Degraded',
      description: slaStable
        ? 'All monitored endpoints are performing within target thresholds.'
        : `Uptime is below target — error rate ${Number(perf?.errorRate || 0).toFixed(2)}%.`,
      actionLabel: '',
      pageKey: null,
    },
    {
      label: 'Revenue at Risk',
      badge: `$${formatCount(stats?.revenueAtRisk || 0)}`,
      badgeColor: atRiskOrderCount > 0 ? '#ef4444' : '#22c55e',
      value: atRiskOrderCount > 0 ? 'At Risk' : 'Protected',
      description: `Tied up in ${formatCount(atRiskOrderCount)} failed / delayed order${atRiskOrderCount === 1 ? '' : 's'}.`,
      actionLabel: 'Resolve Exceptions',
      pageKey: 'orders',
    },
  ].filter((card) => !card.pageKey || canSee(card.pageKey));

  const statusFromTone = (tone: 'success' | 'warning' | 'critical') =>
    tone === 'critical' ? 'CRITICAL' : tone === 'warning' ? 'DEGRADED' : 'HEALTHY';

  const domainSnapshots = [
    {
      name: 'Integrations',
      icon: RefreshCw,
      path: 'integrations',
      tone: reliabilityTone as 'success' | 'warning' | 'critical',
      metric:
        integration?.successRate !== undefined
          ? `${Number(integration.successRate).toFixed(0)}% sync success · ${integration.failureCount24h || 0} failures (24h)`
          : 'Reliability and sync throughput across connectors.',
    },
    {
      name: 'Orders',
      icon: Package,
      path: 'orders',
      tone: (stats?.failedCount ? 'critical' : stats?.delayedCount ? 'warning' : 'success') as
        | 'success'
        | 'warning'
        | 'critical',
      metric:
        stats?.totalOrders !== undefined
          ? `${formatCount(stats.totalOrders)} orders · ${stats.failedCount || 0} failed · ${stats.delayedCount || 0} delayed`
          : 'Order throughput, failures and delays.',
    },
    {
      name: 'Performance',
      icon: Activity,
      path: 'performance',
      tone: latencyTone as 'success' | 'warning' | 'critical',
      metric:
        perf?.p95 !== undefined
          ? `p95 ${formatMs(perf.p95)} · uptime ${Number(perf.uptime || 0).toFixed(2)}%`
          : 'Latency and uptime across the fleet.',
    },
    {
      name: 'Customers',
      icon: Users,
      path: 'customers',
      tone: 'success' as 'success' | 'warning' | 'critical',
      metric:
        liveSessions !== undefined
          ? `${formatCount(liveSessions)} active · ${formatCount(userActivity?.totalUsers)} total users`
          : 'End-user activity and engagement.',
    },
  ].filter((domain) => canSee(domain.path));

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
      <PageHero
        icon={LayoutDashboard}
        accent="#3b82f6"
        eyebrow="Command Center"
        title="Control Tower"
        subtitle={
          <>
            Unified executive observability and operational oversight for{' '}
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{user?.name || 'the current operator'}</span>.
          </>
        }
        live
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.max(metricCards.length, 1)}, 1fr)`,
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
                  <span style={{ fontSize: '12px', fontWeight: 500, color: item.badgeColor }}>{item.badge}</span>
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

      {canSee('performance') && (
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
              { label: 'FCP', color: '#10b981', value: formatMs(perf?.fcp) },
              { label: 'LCP', color: '#f59e0b', value: formatMs(perf?.lcp) },
              { label: 'LOAD TIME', color: '#3b82f6', value: formatMs(perf?.avg) },
              { label: 'TTFB', color: '#ef4444', value: formatMs(perf?.ttfb) },
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
      )}

      {((canSee('integrations') && syncTrends.length > 0) || (canSee('orders') && orderTrends.length > 0)) && (
      <section style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'visible' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'rgba(16,185,129,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxSizing: 'border-box',
            }}
          >
            <Activity style={{ width: '16px', height: '16px', color: '#10b981' }} />
          </div>
          <div>
            <p style={{ ...sectionTitleStyle, marginBottom: '2px' }}>Operational Trends</p>
            <p style={sectionSubtitleStyle}>Live throughput across integrations and order flow.</p>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: canSee('integrations') && syncTrends.length > 0 && canSee('orders') && orderTrends.length > 0 ? '1fr 1fr' : '1fr',
            gap: '16px',
          }}
        >
          {canSee('integrations') && syncTrends.length > 0 && (
            <div
              style={{
                borderRadius: '12px',
                border: '1px solid var(--border-card)',
                background: 'var(--bg-card)',
                padding: '20px 22px',
                boxSizing: 'border-box',
              }}
            >
              <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 16px' }}>Integration Sync Throughput</p>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={syncTrends} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="ovSyncSuccess" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="ovSyncFailure" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-card)" vertical={false} />
                    <XAxis dataKey="timestamp" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--bg-card)',
                        border: '1px solid var(--border-card)',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                    <Area type="monotone" dataKey="success" name="Success" stroke="#10b981" fill="url(#ovSyncSuccess)" strokeWidth={2.5} />
                    <Area type="monotone" dataKey="failure" name="Failure" stroke="#ef4444" fill="url(#ovSyncFailure)" strokeWidth={2} strokeDasharray="5 5" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {canSee('orders') && orderTrends.length > 0 && (
            <div
              style={{
                borderRadius: '12px',
                border: '1px solid var(--border-card)',
                background: 'var(--bg-card)',
                padding: '20px 22px',
                boxSizing: 'border-box',
              }}
            >
              <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 16px' }}>Order Velocity (Online vs Offline)</p>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={orderTrends} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="ovOrdersOnline" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="ovOrdersOffline" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-card)" vertical={false} />
                    <XAxis dataKey="timestamp" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--bg-card)',
                        border: '1px solid var(--border-card)',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                    <Area type="monotone" dataKey="online" name="Online" stroke="#3b82f6" fill="url(#ovOrdersOnline)" strokeWidth={2.5} />
                    <Area type="monotone" dataKey="offline" name="Offline" stroke="#f59e0b" fill="url(#ovOrdersOffline)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </section>
      )}

      {domainSnapshots.length > 0 && (
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
            const { statusBg, statusColor } = metricStatusStyle(domain.tone);
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
                      background: statusBg,
                      color: statusColor,
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    ● {statusFromTone(domain.tone)}
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
                  {domain.metric}
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
      )}
    </div>
  );
}

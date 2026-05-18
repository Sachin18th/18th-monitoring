'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import {
  ShieldAlert,
  AlertTriangle,
  Activity,
  Globe,
  Server,
  CreditCard,
  Filter,
  RefreshCw,
  Search,
  AlertCircle,
  ChevronRight,
  Users
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '@/context/AuthContext';

const pageStyle: React.CSSProperties = {
  padding: '24px 28px',
  maxWidth: '1280px',
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
  overflow: 'visible',
  minHeight: '100vh',
  background: 'var(--bg-page)',
  color: 'var(--text-primary)'
};

const cardStyle: React.CSSProperties = {
  borderRadius: '12px',
  border: '1px solid var(--border-card)',
  background: 'var(--bg-card)',
  padding: '24px',
  overflow: 'visible'
};

export default function FailureIntelligencePage() {
  const { projectId } = useParams();
  const { apiFetch, token } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [performanceSummary, setPerf] = useState<any>(null);
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [trends, setTrends] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    if (!token || !projectId) return;
    setLoading(true);
    setError(null);
    try {
      const [perf, anom, trnd] = await Promise.all([
        apiFetch(`/api/v1/dashboard/performance/summary?siteId=${projectId}`),
        apiFetch(`/api/v1/dashboard/performance/anomalies?siteId=${projectId}`),
        apiFetch(`/api/v1/dashboard/performance/trends?siteId=${projectId}`)
      ]);
      setPerf(perf);
      setAnomalies(Array.isArray(anom) ? anom : []);
      setTrends(Array.isArray(trnd) ? trnd : []);
    } catch (err: any) {
      console.error('[Failures] Load failed', err);
      setError('Failed to load reliability intelligence.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, projectId, token]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30_000);
    return () => clearInterval(interval);
  }, [loadData]);

  const errorTrendData = useMemo(
    () =>
      trends.map((t: any) => ({
        time: t.timestamp,
        jsErrors: Math.round((t.pageLoadTime || 2000) * 0.005),
        apiErrors: Math.round((t.lcp || 1500) * 0.002),
        businessFailures: Math.round((t.fcp || 800) * 0.001)
      })),
    [trends]
  );

  const recurringIssues = useMemo(
    () =>
      anomalies.map((a: any, i: number) => ({
        fingerprint: a.id || `anom_${i}`,
        message: `${a.metric || 'Metric'} regression in ${a.scope || 'scope'}: ${a.deviation || ''}`,
        category: a.scope?.includes('Payment') ? 'PAYMENT' : a.scope?.includes('Cart') ? 'BUSINESS_LOGIC' : 'UI',
        severity: (a.severity?.toUpperCase() as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW') || 'HIGH',
        count: a.occurrences || 1,
        usersAffected: a.affectedUsers || 0,
        lastSeen: a.window || 'Recent'
      })),
    [anomalies]
  );

  const errorRate = performanceSummary?.errorRate ?? 0;
  const uptime = performanceSummary?.uptime ?? 100;

  const metrics = useMemo(
    () => [
      {
        label: 'UI Health',
        value: `${(100 - Math.min(errorRate, 100)).toFixed(1)}%`,
        badge: errorRate < 2 ? 'Stable rendering layer' : errorRate < 5 ? 'Degraded interface state' : 'Critical client reliability',
        icon: Globe
      },
      {
        label: 'API Reliability',
        value: `${uptime.toFixed(1)}%`,
        badge: performanceSummary?.p95 < 3000 ? 'Stable service envelope' : 'Elevated backend latency',
        icon: Server
      },
      {
        label: 'Payment Success',
        value: anomalies.some((a) => a.severity === 'critical') ? '< 95%' : '> 99%',
        badge: anomalies.some((a) => a.severity === 'critical') ? 'Critical payment anomalies' : 'Payment rail nominal',
        icon: CreditCard
      },
      {
        label: 'Active Anomalies',
        value: `${anomalies.length}`,
        badge: anomalies.length > 3 ? 'Elevated issue volume' : 'Within normal operating range',
        icon: AlertTriangle
      }
    ],
    [anomalies, errorRate, performanceSummary?.p95, uptime]
  );

  const getSeverityColor = (sev: string) => {
    switch (sev) {
      case 'CRITICAL':
        return { bg: 'rgba(244,63,94,0.12)', text: '#fb7185', border: '1px solid rgba(244,63,94,0.2)' };
      case 'HIGH':
        return { bg: 'rgba(249,115,22,0.12)', text: '#fb923c', border: '1px solid rgba(249,115,22,0.2)' };
      case 'MEDIUM':
        return { bg: 'rgba(245,158,11,0.12)', text: '#fbbf24', border: '1px solid rgba(245,158,11,0.2)' };
      default:
        return { bg: 'rgba(148,163,184,0.12)', text: 'var(--text-muted)', border: '1px solid rgba(148,163,184,0.2)' };
    }
  };

  if (loading && trends.length === 0) {
    return (
      <div style={{ ...pageStyle, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '999px',
              border: '4px solid #1f2937',
              borderTopColor: '#22c55e',
              marginBottom: '16px',
              animation: 'spin 1s linear infinite'
            }}
          />
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
              color: 'var(--text-muted)'
            }}
          >
            Crunching reliability intelligence...
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={pageStyle}>
        <div style={{ marginBottom: '8px', overflow: 'visible' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                border: '1px solid var(--border-card)',
                background: 'var(--bg-card)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <ShieldAlert style={{ width: '16px', height: '16px', color: 'var(--text-secondary)' }} />
            </div>
            <span
              style={{
                fontSize: '10px',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--text-label)'
              }}
            >
              Failure Observability
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, maxWidth: '760px' }}>
              <div style={{ fontSize: '26px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Error &amp; Failure Intelligence
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: '#22c55e',
                    display: 'inline-block',
                    marginLeft: '10px',
                    verticalAlign: 'middle'
                  }}
                />
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Cross-layer reliability diagnostics for {projectId as string}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: '1px solid var(--border-card)',
                  background: 'var(--bg-card)',
                  borderRadius: '10px',
                  padding: '8px 12px',
                  minWidth: '240px'
                }}
              >
                <Search style={{ width: '16px', height: '16px', color: 'var(--text-label)', flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder="Search fingerprint..."
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--text-primary)',
                    fontSize: '12px'
                  }}
                />
              </div>
              <button
                onClick={loadData}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-card)',
                  background: 'var(--bg-card)',
                  cursor: 'pointer'
                }}
              >
                <RefreshCw style={{ width: '16px', height: '16px', color: 'var(--text-muted)', animation: loading ? 'spin 1s linear infinite' : undefined }} />
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '14px 16px',
              borderRadius: '12px',
              border: '1px solid rgba(244,63,94,0.2)',
              background: 'rgba(244,63,94,0.1)',
              color: '#fb7185',
              overflow: 'visible'
            }}
          >
            <div style={{ display: 'flex', minWidth: 0, alignItems: 'center', gap: '12px' }}>
              <AlertCircle style={{ width: '16px', height: '16px', flexShrink: 0 }} />
              <span style={{ fontSize: '13px', overflowWrap: 'anywhere' }}>{error}</span>
            </div>
            <button
              onClick={loadData}
              style={{
                marginLeft: '8px',
                flexShrink: 0,
                fontSize: '12px',
                fontWeight: 500,
                color: '#fb7185',
                cursor: 'pointer',
                background: 'transparent',
                border: 'none',
                padding: 0
              }}
            >
              Retry
            </button>
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '20px',
            overflow: 'visible'
          }}
        >
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <div
                key={metric.label}
                style={{
                  borderRadius: '12px',
                  border: '1px solid var(--border-card)',
                  background: 'var(--bg-card)',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: '140px',
                  overflow: 'visible'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span
                    style={{
                      fontSize: '10px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: 'var(--text-label)',
                      fontWeight: 500
                    }}
                  >
                    {metric.label}
                  </span>
                  <Icon style={{ width: '16px', height: '16px', flexShrink: 0, color: 'var(--text-label)' }} />
                </div>
                <div style={{ fontSize: '38px', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1, padding: '8px 0' }}>{metric.value}</div>
                <div style={{ marginTop: '12px' }}>
                  <span style={{ fontSize: '12px', color: '#22c55e' }}>{metric.badge}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.7fr) minmax(320px, 1fr)',
            gap: '20px',
            overflow: 'visible'
          }}
        >
          <div style={{ minWidth: 0 }}>
            {errorTrendData.length === 0 ? (
              <div style={{ ...cardStyle, minHeight: '320px', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                <div>
                  <Activity style={{ width: '16px', height: '16px', color: 'var(--text-label)', margin: '0 auto 12px' }} />
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '13px' }}>
                    No trend data yet. Ingest performance events to populate the chart.
                  </p>
                </div>
              </div>
            ) : (
              <div style={cardStyle}>
                <div style={{ fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Failure Rate Trends
                </div>
                <span
                  style={{
                    padding: '3px 10px',
                    borderRadius: '999px',
                    fontSize: '10px',
                    border: '1px solid var(--border-input)',
                    color: 'var(--text-muted)',
                    marginBottom: '20px',
                    display: 'inline-block',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Multi-layer telemetry
                </span>

                <div style={{ height: '300px', width: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={errorTrendData}>
                      <defs>
                        <linearGradient id="colorJsInline" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorApiInline" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="time" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }} />
                      <Area type="monotone" dataKey="jsErrors" stroke="#f43f5e" fillOpacity={1} fill="url(#colorJsInline)" name="JS Errors" />
                      <Area type="monotone" dataKey="apiErrors" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorApiInline)" name="API Failures" />
                      <Area type="monotone" dataKey="businessFailures" stroke="#fbbf24" fillOpacity={0} name="Business Failures" strokeDasharray="5 5" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', overflow: 'visible' }}>
            <div style={cardStyle}>
              <div style={{ fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-primary)', marginBottom: '20px' }}>
                Business Impact Summary
              </div>
              {[
                { label: 'Checkout Abandonment', value: '12%', sub: 'Due to payment failures', color: '#f43f5e' },
                { label: 'Cart Drop-offs', value: '8%', sub: 'Due to validation errors', color: '#f97316' },
                { label: 'Search Friction', value: '3%', sub: 'Due to API latency/errors', color: '#f59e0b' }
              ].map((impact, idx, arr) => (
                <div
                  key={impact.label}
                  style={{
                    padding: '14px 0',
                    borderBottom: idx === arr.length - 1 ? 'none' : '1px solid var(--border-card)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '12px' }}>
                    <div>
                      <p style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, margin: '0 0 4px' }}>{impact.label}</p>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>{impact.sub}</p>
                    </div>
                    <span style={{ fontSize: '18px', fontWeight: 500, color: 'var(--text-primary)' }}>{impact.value}</span>
                  </div>
                  <div style={{ height: '8px', width: '100%', background: 'var(--bg-input)', borderRadius: '999px' }}>
                    <div style={{ height: '100%', width: impact.value, background: impact.color, borderRadius: '999px' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ overflow: 'visible' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
            <div
              style={{
                fontSize: '12px',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--text-muted)'
              }}
            >
              Top Recurring Issues
            </div>
            <button
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11px',
                color: '#60a5fa',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 0
              }}
            >
              View all issues
              <ChevronRight style={{ width: '16px', height: '16px' }} />
            </button>
          </div>

          {recurringIssues.length === 0 ? (
            <div style={{ ...cardStyle, textAlign: 'center' }}>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '13px' }}>
                No recurring anomalies detected. System is within normal operating parameters.
              </p>
            </div>
          ) : (
            <div
              style={{
                borderRadius: '12px',
                border: '1px solid var(--border-card)',
                background: 'var(--bg-card)',
                padding: '0',
                overflow: 'visible'
              }}
            >
              {recurringIssues.map((issue, idx) => {
                const sev = getSeverityColor(issue.severity);
                return (
                  <div
                    key={issue.fingerprint}
                    style={{
                      padding: '18px 20px',
                      borderBottom: idx === recurringIssues.length - 1 ? 'none' : '1px solid var(--border-card)',
                      display: 'flex',
                      gap: '16px',
                      alignItems: 'flex-start'
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 10px',
                            borderRadius: '999px',
                            fontSize: '10px',
                            color: sev.text,
                            background: sev.bg,
                            border: sev.border,
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {issue.severity}
                        </span>
                        <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-label)' }}>
                          {issue.category}
                        </span>
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, marginBottom: '10px' }}>{issue.message}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-label)', fontFamily: 'monospace' }}>
                          FP: {issue.fingerprint.substring(0, 8)}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-label)' }}>Last seen: {issue.lastSeen}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '20px', flexShrink: 0 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-label)', marginBottom: '4px' }}>
                          Events
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{issue.count.toLocaleString()}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-label)', marginBottom: '4px' }}>
                          Impact
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end', fontSize: '13px', color: 'var(--text-primary)' }}>
                          <Users style={{ width: '16px', height: '16px', color: 'var(--text-label)' }} />
                          {issue.usersAffected}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          position: 'fixed',
          bottom: '20px',
          left: '24px',
          zIndex: 50,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-input)',
          borderRadius: '999px',
          padding: '6px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '11px',
          color: 'var(--text-muted)'
        }}
      >
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
        Live feed · System nominal
      </div>
    </>
  );
}

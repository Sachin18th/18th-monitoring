'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../../../../context/AuthContext';
import { useParams } from 'next/navigation';
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Activity,
  Wifi,
  GitMerge,
  BarChart3,
  Clock,
  Bell,
  WifiOff
} from 'lucide-react';

type HealthStatus = 'healthy' | 'warning' | 'degraded' | 'critical' | 'failed';

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

const healthColors: Record<HealthStatus, string> = {
  healthy: '#22c55e',
  warning: '#fbbf24',
  degraded: '#fb923c',
  critical: '#f87171',
  failed: '#f87171'
};

const healthBorders: Record<HealthStatus, string> = {
  healthy: '1px solid rgba(34,197,94,0.2)',
  warning: '1px solid rgba(251,191,36,0.2)',
  degraded: '1px solid rgba(251,146,60,0.2)',
  critical: '1px solid rgba(248,113,113,0.2)',
  failed: '1px solid rgba(248,113,113,0.2)'
};

const layerIcon = (layer: string) => {
  switch (layer) {
    case 'connector':
      return <Wifi style={{ width: '16px', height: '16px' }} />;
    case 'pipeline':
      return <GitMerge style={{ width: '16px', height: '16px' }} />;
    case 'kpi':
      return <BarChart3 style={{ width: '16px', height: '16px' }} />;
    case 'freshness':
      return <Clock style={{ width: '16px', height: '16px' }} />;
    default:
      return <Activity style={{ width: '16px', height: '16px' }} />;
  }
};

export default function MonitoringDashboardPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { token, apiFetch } = useAuth();

  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'active' | 'resolved'>('active');

  const loadData = useCallback(async () => {
    if (!token || !projectId) return;
    setLoading(true);
    try {
      const [healthRes, alertsRes] = await Promise.all([
        apiFetch(`/api/v1/tenants/current/projects/${projectId}/health/snapshot`),
        apiFetch(`/api/v1/tenants/current/projects/${projectId}/alerts`)
      ]);
      setSnapshot(healthRes?.data?.snapshot);
      setAlerts(alertsRes?.data?.alerts || []);
    } catch (err) {
      console.error('Failed to load monitoring data', err);
    } finally {
      setLoading(false);
    }
  }, [projectId, token, apiFetch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAcknowledge = async (alertId: string) => {
    await apiFetch(`/api/v1/tenants/current/projects/${projectId}/alerts/${alertId}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify({ userId: 'current_user' })
    });
    loadData();
  };

  const handleResolve = async (alertId: string) => {
    await apiFetch(`/api/v1/tenants/current/projects/${projectId}/alerts/${alertId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ userId: 'current_user' })
    });
    loadData();
  };

  const filteredAlerts = alerts.filter((a) =>
    activeTab === 'active' ? ['active', 'acknowledged'].includes(a.status) : a.status === 'resolved'
  );

  const healthStatus: HealthStatus = snapshot?.status || 'healthy';
  const healthScore: number = snapshot?.healthScore ?? 100;
  const criticalCount = alerts.filter((a) => a.status === 'active' && a.severity === 'critical').length;
  const warningCount = alerts.filter((a) => a.status === 'active' && a.severity === 'warning').length;

  const severityPill = (severity: string) => {
    const map: Record<string, { color: string; border: string; bg: string }> = {
      critical: { color: '#f87171', border: '1px solid rgba(248,113,113,0.2)', bg: 'rgba(248,113,113,0.08)' },
      warning: { color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)', bg: 'rgba(251,191,36,0.08)' },
      info: { color: '#60a5fa', border: '1px solid rgba(96,165,250,0.2)', bg: 'rgba(96,165,250,0.08)' }
    };
    const style = map[severity] || map.info;
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '3px 10px',
          borderRadius: '999px',
          fontSize: '10px',
          color: style.color,
          border: style.border,
          background: style.bg,
          whiteSpace: 'nowrap'
        }}
      >
        {severity.toUpperCase()}
      </span>
    );
  };

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
            <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)' }}>
              Operations Monitoring
            </span>
          </div>

          <div style={{ fontSize: '26px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
            System Monitoring
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

          <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: '760px' }}>
            Real-time health evaluation, alert management, and operational visibility.
          </div>
        </div>

        <div
          style={{
            ...cardStyle,
            border: healthBorders[healthStatus]
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ fontSize: '52px', fontWeight: 700, color: healthColors[healthStatus], lineHeight: 1 }}>{healthScore}</div>
              <div>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)', marginBottom: '6px' }}>
                  System Health Score
                </div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: healthColors[healthStatus], textTransform: 'uppercase' }}>{healthStatus}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '3px 10px',
                  borderRadius: '999px',
                  fontSize: '10px',
                  border: '1px solid rgba(248,113,113,0.2)',
                  color: criticalCount > 0 ? '#f87171' : 'var(--text-muted)',
                  background: criticalCount > 0 ? 'rgba(248,113,113,0.08)' : 'var(--bg-input)',
                  whiteSpace: 'nowrap'
                }}
              >
                {criticalCount} Critical
              </span>
              <span
                style={{
                  display: 'inline-block',
                  padding: '3px 10px',
                  borderRadius: '999px',
                  fontSize: '10px',
                  border: '1px solid rgba(251,191,36,0.2)',
                  color: warningCount > 0 ? '#fbbf24' : 'var(--text-muted)',
                  background: warningCount > 0 ? 'rgba(251,191,36,0.08)' : 'var(--bg-input)',
                  whiteSpace: 'nowrap'
                }}
              >
                {warningCount} Warnings
              </span>
            </div>
          </div>
        </div>

        {snapshot?.signals && (
          <div>
            <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Health Signal Breakdown
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', overflow: 'visible' }}>
              {snapshot.signals.map((signal: any) => {
                const status = signal.status as HealthStatus;
                return (
                  <div
                    key={signal.name}
                    style={{
                      ...cardStyle,
                      border: healthBorders[status]
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: healthColors[status] }}>
                      {layerIcon(signal.layer)}
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{signal.layer}</span>
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, marginBottom: '6px' }}>{signal.name}</div>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: healthColors[status], marginBottom: signal.detail ? '6px' : 0 }}>
                      {signal.status}
                    </div>
                    {signal.detail && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{signal.detail}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ overflow: 'visible' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
              marginBottom: '16px'
            }}
          >
            <div>
              <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Alert Feed
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Rule-based alerts with lifecycle management.</div>
            </div>

            <div
              style={{
                display: 'flex',
                borderRadius: '10px',
                border: '1px solid var(--border-card)',
                overflow: 'visible'
              }}
            >
              {(['active', 'resolved'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '10px 14px',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    border: 'none',
                    cursor: 'pointer',
                    background: activeTab === tab ? '#2563EB' : 'var(--bg-card)',
                    color: activeTab === tab ? '#fff' : 'var(--text-secondary)'
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div
            style={{
              borderRadius: '12px',
              border: '1px solid var(--border-card)',
              background: 'var(--bg-card)',
              padding: '0',
              overflow: 'visible'
            }}
          >
            {loading ? (
              <div style={{ padding: '24px', display: 'flex', justifyContent: 'center' }}>
                <Activity style={{ width: '16px', height: '16px', color: 'var(--text-label)' }} />
              </div>
            ) : filteredAlerts.length === 0 ? (
              <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', textAlign: 'center' }}>
                <CheckCircle2 style={{ width: '16px', height: '16px', color: '#22c55e' }} />
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  {activeTab === 'active' ? 'No active alerts. System operating nominally.' : 'No resolved alerts to show.'}
                </div>
              </div>
            ) : (
              filteredAlerts.map((alert, idx) => (
                <div
                  key={alert.id}
                  style={{
                    padding: '18px 20px',
                    borderBottom: idx === filteredAlerts.length - 1 ? 'none' : '1px solid var(--border-card)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '16px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', minWidth: 0, flex: 1 }}>
                    <div style={{ marginTop: '2px' }}>
                      {alert.severity === 'critical' ? (
                        <XCircle style={{ width: '16px', height: '16px', color: '#f87171' }} />
                      ) : alert.severity === 'warning' ? (
                        <AlertTriangle style={{ width: '16px', height: '16px', color: '#fbbf24' }} />
                      ) : (
                        <Bell style={{ width: '16px', height: '16px', color: '#60a5fa' }} />
                      )}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                        {severityPill(alert.severity)}
                        {alert.status === 'acknowledged' && (
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '3px 10px',
                              borderRadius: '999px',
                              fontSize: '10px',
                              border: '1px solid var(--border-input)',
                              color: 'var(--text-secondary)',
                              background: 'var(--bg-input)',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            ACK
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, marginBottom: '6px' }}>{alert.message}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Triggered: {new Date(alert.triggeredAt).toLocaleString()}
                        {alert.resolvedAt && ` · Resolved: ${new Date(alert.resolvedAt).toLocaleString()}`}
                      </div>
                    </div>
                  </div>

                  {alert.status === 'active' && (
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      <button
                        onClick={() => handleAcknowledge(alert.id)}
                        style={{
                          padding: '8px 12px',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#fbbf24',
                          border: '1px solid rgba(251,191,36,0.3)',
                          borderRadius: '10px',
                          background: 'transparent',
                          cursor: 'pointer'
                        }}
                      >
                        Ack
                      </button>
                      <button
                        onClick={() => handleResolve(alert.id)}
                        style={{
                          padding: '8px 12px',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#22c55e',
                          border: '1px solid rgba(34,197,94,0.3)',
                          borderRadius: '10px',
                          background: 'transparent',
                          cursor: 'pointer'
                        }}
                      >
                        Resolve
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
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

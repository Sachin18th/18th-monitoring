// 'use client';
// import React, { useEffect, useState, useCallback, useMemo } from 'react';
// import { useParams } from 'next/navigation';
// import {
//    Siren,
//    ShieldAlert,
//    Activity,
//    ScrollText,
//    Clock,
//    RefreshCw,
//    CheckCircle2,
//    ExternalLink,
//    Search,
//    Filter,
//    History,
//    Box,
//    Server,
//    User,
//    Zap,
//    Tag,
//    ArrowRight
// } from 'lucide-react';
// import {
//    PageLayout,
//    Typography,
//    Card,
//    Badge,
//    OperationalTable,
//    DiagnosticDrawer,
//    Column
// } from '@kpi-platform/ui';
// import { useAuth } from '../../../../context/AuthContext';

// // Observability Components
// import { ObservabilityHeader } from '../../../../components/observability/ObservabilityHeader';
// import { UnifiedObservabilityTable } from '../../../../components/observability/UnifiedObservabilityTable';
// import { UnifiedTimelineView } from '../../../../components/observability/UnifiedTimelineView';

// export default function AlertsPage() {
//    const params = useParams();
//    const projectId = params.projectId as string;
//    const { token, apiFetch } = useAuth();

//    // Data State
//    const [loading, setLoading] = useState(true);
//    const [alerts, setAlerts] = useState<any[]>([]);
//    const [auditLogs, setAuditLogs] = useState<any[]>([]);
//    const [activityFeed, setActivityFeed] = useState<any[]>([]);

//    // UI State
//    const [selectedSignal, setSelectedSignal] = useState<{ type: string, data: any } | null>(null);
//    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

//    const loadData = useCallback(async () => {
//       if (!token || !projectId) return;
//       setLoading(true);
//       try {
//          const [alrts, audit, activity] = await Promise.all([
//             apiFetch(`/api/v1/dashboard/alerts?siteId=${projectId}`),
//             apiFetch(`/api/v1/dashboard/audit?siteId=${projectId}`),
//             apiFetch(`/api/v1/dashboard/activity?siteId=${projectId}`)
//          ]);
//           setAlerts(Array.isArray(alrts) ? alrts : alrts?.alerts || []);
//          setAuditLogs(Array.isArray(audit) ? audit : []);
//          setActivityFeed(Array.isArray(activity) ? activity : []);
//       } catch (err) {
//          console.error('Visibility layer failure:', err);
//       } finally {
//          setLoading(false);
//       }
//    }, [projectId, token, apiFetch]);

//    useEffect(() => {
//       loadData();
//       const interval = setInterval(loadData, 30000); // 30s observability window
//       return () => clearInterval(interval);
//    }, [loadData]);

//    const stats = useMemo(() => {
//       const active = alerts.filter(a => a.status === 'active');
//       return {
//          activeAlerts: active.length,
//          criticalAlerts: active.filter(a => a.severity === 'critical').length,
//          unresolvedIncidents: active.length,
//          recentAuditActions: auditLogs.length
//       };
//    }, [alerts, auditLogs]);

//    const timelineEvents = useMemo(() => {
//       const events: any[] = [];

//       alerts.slice(0, 5).forEach(a => events.push({
//          id: `t-al-${a.alertId}`,
//          type: 'alert',
//          title: `${a.kpiName} Breach`,
//          description: a.message,
//          timestamp: a.triggeredAt,
//          severity: a.severity
//       }));

//       auditLogs.slice(0, 3).forEach(a => events.push({
//          id: `t-au-${a.id}`,
//          type: 'audit',
//          title: a.action,
//          description: `${a.actor} modified ${a.entity}`,
//          timestamp: a.timestamp
//       }));

//       activityFeed.slice(0, 2).forEach(a => events.push({
//          id: `t-ac-${a.id}`,
//          type: 'activity',
//          title: a.type,
//          description: a.description,
//          timestamp: a.timestamp
//       }));

//       return events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
//    }, [alerts, auditLogs, activityFeed]);

//    const handleSignalClick = (type: string, data: any) => {
//       setSelectedSignal({ type, data });
//       setIsDrawerOpen(true);
//    };

//    return (
//       <PageLayout
//          title="Alert Center & Observability"
//          subtitle="Unified operational visibility layer for real-time incidents, audit trails, and system behavior."
//          icon={<Siren size={24} />}
//       >

//          <div className="space-y-6 pb-12">
//             {/* 1. Observability Health Header */}
//             <ObservabilityHeader stats={stats} loading={loading} />

//             <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
//                {/* 2. Laboratory Left Column: Multi-Source Table */}
//                <div className="lg:col-span-2 space-y-6">
//                   <UnifiedObservabilityTable
//                      alerts={alerts}
//                      audit={auditLogs}
//                      activity={activityFeed}
//                      onRowClick={handleSignalClick}
//                      loading={loading}
//                   />

//                   {/* 3. Operational Signal Logic (Grouping/Resolution) */}
//                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
//                      <Card className="p-6 border-subtle">
//                         <div className="flex items-center gap-2 mb-6">
//                            <Zap size={18} className="text-primary" />
//                            <Typography variant="body" weight="bold" className="text-sm uppercase tracking-wider text-text-muted">
//                               Incident Resolution Velocity
//                            </Typography>
//                         </div>
//                         <div className="flex items-end gap-2">
//                            <Typography variant="h2" weight="bold" noMargin>14.2m</Typography>
//                            <Typography variant="caption" className="text-success mb-1 font-bold">-4% vs avg</Typography>
//                         </div>
//                         <div className="mt-4 space-y-2">
//                            <div className="flex justify-between text-xs">
//                               <span className="text-text-muted text-[10px] font-bold">MTTR PROGRESS</span>
//                               <span className="font-bold">78% Target Met</span>
//                            </div>
//                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
//                               <div className="h-full bg-success" style={{ width: '78%' }} />
//                            </div>
//                         </div>
//                      </Card>

//                      <Card className="p-6 border-subtle bg-muted/20">
//                         <div className="flex items-center gap-2 mb-6 text-text-muted">
//                            <History size={18} />
//                            <Typography variant="body" weight="bold" className="text-sm uppercase tracking-wider">
//                               Deduplication Intelligence
//                            </Typography>
//                         </div>
//                         <Typography variant="body" weight="bold" className="text-sm block">12 Alerts Suppressed</Typography>
//                         <Typography variant="micro" className="text-text-muted mt-1 block">
//                            Deduplication engine active. Grouping related signals into parent incidents.
//                         </Typography>
//                      </Card>
//                   </div>
//                </div>

//                {/* 4. Laboratory Right Column: Timeline View */}
//                <div className="space-y-6">
//                   <UnifiedTimelineView
//                      events={timelineEvents}
//                      loading={loading}
//                   />

//                   <Card className="p-5 border-dashed border-subtle flex flex-col items-center text-center gap-3">
//                      <div className="p-2 rounded-xl bg-muted text-text-muted">
//                         <Search size={24} />
//                      </div>
//                      <Typography variant="body" weight="bold" className="text-sm">Global Observation Query</Typography>
//                      <Typography variant="micro" className="text-text-muted">
//                         Quickly search across logs, traces, and sessions matching alert IDs.
//                      </Typography>
//                      <button type="button" className="action-btn action-btn--outline action-btn--wide" style={{ marginTop: '0.5rem' }}>
//                         Open Log Explorer
//                      </button>
//                   </Card>
//                </div>
//             </div>
//          </div>

//          {/* Signal Diagnostic Side Panel */}
//          <DiagnosticDrawer
//             isOpen={isDrawerOpen}
//             onClose={() => setIsDrawerOpen(false)}
//             title={`${selectedSignal?.type.toUpperCase()} SIGNAL INVESTIGATION`}
//             subtitle={`Signal ID: ${selectedSignal?.data?.alertId || selectedSignal?.data?.id}`}
//             width="700px"
//          >
//             {selectedSignal && (
//                <div className="space-y-8">
//                   {/* 1. Incident Status Layer */}
//                   <section className={`p-6 rounded-3xl border ${selectedSignal.type === 'alert' ? 'bg-error-bg/20 border-error/10' : 'bg-muted/20 border-subtle'
//                      }`}>
//                      <div className="flex justify-between items-start mb-4">
//                         <div>
//                            <Badge variant={selectedSignal.type === 'alert' ? 'error' : 'default'} size="sm" dot>
//                               {selectedSignal.type.toUpperCase()}
//                            </Badge>
//                            <Typography variant="h2" weight="bold" noMargin className="mt-2">
//                               {selectedSignal.data.kpiName || selectedSignal.data.action || selectedSignal.data.type}
//                            </Typography>
//                         </div>
//                         {selectedSignal.type === 'alert' && (
//                            <div className="text-right">
//                               <Typography variant="micro" weight="bold" className="text-text-muted uppercase">Lifecycle</Typography>
//                               <Badge variant="error" size="sm" className="mt-1">{selectedSignal.data.status.toUpperCase()}</Badge>
//                            </div>
//                         )}
//                      </div>

//                      <Typography variant="body" className="text-text-secondary leading-relaxed">
//                         {selectedSignal.data.message || selectedSignal.data.description || `Transformation of ${selectedSignal.data.entity}`}
//                      </Typography>

//                      {selectedSignal.type === 'alert' && (
//                         <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-error/10">
//                            <div>
//                               <Typography variant="micro" weight="bold" className="text-text-muted uppercase">Affected Entity</Typography>
//                               <Typography variant="body" weight="bold" className="text-sm">{selectedSignal.data.affectedEntity}</Typography>
//                            </div>
//                            <div>
//                               <Typography variant="micro" weight="bold" className="text-text-muted uppercase">Module Signature</Typography>
//                               <Typography variant="body" weight="bold" className="text-sm font-mono">{selectedSignal.data.module}</Typography>
//                            </div>
//                         </div>
//                      )}
//                   </section>

//                   {/* 2. Observability Context (Who, When, Where) */}
//                   <div className="grid grid-cols-2 gap-4">
//                      <div className="p-4 rounded-2xl border border-subtle space-y-3">
//                         <div className="flex items-center gap-2 text-text-muted">
//                            <User size={16} />
//                            <Typography variant="micro" weight="bold" className="uppercase tracking-wider">Trigger Actor</Typography>
//                         </div>
//                         <Typography variant="body" weight="bold" className="text-sm">
//                            {selectedSignal.data.actor || 'Automatic System Rule'}
//                         </Typography>
//                      </div>
//                      <div className="p-4 rounded-2xl border border-subtle space-y-3">
//                         <div className="flex items-center gap-2 text-text-muted">
//                            <Clock size={16} />
//                            <Typography variant="micro" weight="bold" className="uppercase tracking-wider">Detection Event</Typography>
//                         </div>
//                         <Typography variant="body" weight="bold" className="text-sm">
//                            {selectedSignal.data.triggeredAt || selectedSignal.data.timestamp}
//                         </Typography>
//                      </div>
//                   </div>

//                   {/* 3. Event Correlation Log */}
//                   <section>
//                      <div className="flex items-center gap-2 mb-4">
//                         <Box size={18} className="text-text-muted" />
//                         <Typography variant="h3" weight="bold" noMargin className="text-sm">Correlation Intelligence</Typography>
//                      </div>
//                      <div className="space-y-3">
//                         <div className="p-4 bg-muted/30 rounded-xl flex gap-4 border border-subtle transition-all hover:border-primary/20">
//                            <Zap size={20} className="text-primary mt-1" />
//                            <div>
//                               <Typography variant="body" weight="bold" className="text-sm">Performance Anomaly during event</Typography>
//                               <Typography variant="micro" className="text-text-muted block mt-1">
//                                  System detected 420ms p95 latency spike in Checkout API matching this signal window.
//                               </Typography>
//                            </div>
//                         </div>
//                         <div className="p-4 bg-muted/30 rounded-xl flex gap-4 border border-subtle transition-all hover:border-primary/20">
//                            <ScrollText size={20} className="text-warning mt-1" />
//                            <div>
//                               <Typography variant="body" weight="bold" className="text-sm">Matched Audit Trail Entry</Typography>
//                               <Typography variant="micro" className="text-text-muted block mt-1">
//                                  Admin changed Stripe SLA threshold 4m prior to this alert triggering.
//                               </Typography>
//                            </div>
//                         </div>
//                      </div>
//                   </section>

//                   {/* 4. Action Layer */}
//                   <section className="pt-4 border-t border-subtle space-y-4">
//                      <div className="flex items-center gap-2 mb-2">
//                         <Tag size={16} className="text-text-muted" />
//                         <Typography variant="micro" weight="bold" className="uppercase text-text-muted">Resolution Actions</Typography>
//                      </div>
//                      <div className="grid grid-cols-2 gap-4">
//                         <button type="button" className="action-btn action-btn--primary">
//                            <CheckCircle2 size={16} />
//                            Acknowledge & Triage
//                         </button>
//                         <button type="button" className="action-btn action-btn--outline">
//                            <RefreshCw size={16} />
//                            Attempt Auto-Remediation
//                         </button>
//                      </div>
//                      <button type="button" className="action-btn action-btn--ghost action-btn--wide">
//                         View Service Trace <ExternalLink size={16} />
//                      </button>
//                   </section>
//                </div>
//             )}
//          </DiagnosticDrawer>
//       </PageLayout>
//    );
// }

'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import {
  Siren,
  ShieldAlert,
  Activity,
  ScrollText,
  Clock,
  RefreshCw,
  CheckCircle2,
  ExternalLink,
  Filter,
  History,
  Settings,
  Box,
  User,
  Zap,
  Tag,
} from 'lucide-react';
import { Badge, DiagnosticDrawer } from '@kpi-platform/ui';
import { useAuth } from '../../../../context/AuthContext';

const pageStyle: React.CSSProperties = {
  padding: '24px 28px',
  maxWidth: '1280px',
  margin: '0 auto',
  display: 'block',
  overflow: 'visible',
};

const sectionSpacingStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
  overflow: 'visible',
};

const actionButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 16px',
  borderRadius: '8px',
  border: '1px solid var(--border-card)',
  background: 'var(--bg-card)',
  color: 'rgba(255,255,255,0.7)',
  fontSize: '13px',
  fontWeight: 500,
  cursor: 'pointer',
};

const primaryActionButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 16px',
  borderRadius: '8px',
  border: 'none',
  background: '#3b82f6',
  color: 'var(--text-primary)',
  fontSize: '13px',
  fontWeight: 500,
  cursor: 'pointer',
};

const kpiGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: '24px',
  marginBottom: '32px',
  overflow: 'visible',
};

const kpiCardStyle: React.CSSProperties = {
  borderRadius: '12px',
  border: '1px solid var(--border-card)',
  background: 'var(--bg-card)',
  padding: '24px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  minHeight: '140px',
  overflow: 'visible',
};

const kpiLabelStyle: React.CSSProperties = {
  fontSize: '10px',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: 'var(--text-muted)',
  fontWeight: 500,
};

const kpiValueStyle: React.CSSProperties = {
  fontSize: '38px',
  fontWeight: 500,
  color: 'var(--text-primary)',
  lineHeight: 1,
  padding: '8px 0',
};

const panelCardStyle: React.CSSProperties = {
  borderRadius: '12px',
  border: '1px solid var(--border-card)',
  background: 'var(--bg-card)',
  overflow: 'visible',
};

const bottomCardStyle: React.CSSProperties = {
  borderRadius: '12px',
  border: '1px solid var(--border-card)',
  background: 'var(--bg-card)',
  padding: '24px',
};

export default function AlertsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { token, apiFetch } = useAuth();

  // Data State
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [activityFeed, setActivityFeed] = useState<any[]>([]);

  // UI State
  const [selectedSignal, setSelectedSignal] = useState<{ type: string; data: any } | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'Alerts' | 'Audit Logs' | 'Activity'>('Alerts');

  const loadData = useCallback(async () => {
    if (!token || !projectId) return;
    setLoading(true);
    try {
      const [alrts, audit, activity] = await Promise.all([
        apiFetch(`/api/v1/dashboard/alerts?siteId=${projectId}`),
        apiFetch(`/api/v1/dashboard/audit?siteId=${projectId}`),
        apiFetch(`/api/v1/dashboard/activity?siteId=${projectId}`),
      ]);
      setAlerts(Array.isArray(alrts) ? alrts : alrts?.alerts || []);
      setAuditLogs(Array.isArray(audit) ? audit : []);
      setActivityFeed(Array.isArray(activity) ? activity : []);
    } catch (err) {
      console.error('Visibility layer failure:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId, token, apiFetch]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // 30s observability window
    return () => clearInterval(interval);
  }, [loadData]);

  const stats = useMemo(() => {
    const active = alerts.filter((a) => a.status === 'active');
    return {
      activeAlerts: active.length,
      criticalAlerts: active.filter((a) => a.severity === 'critical').length,
      unresolvedIncidents: active.length,
      recentAuditActions: auditLogs.length,
    };
  }, [alerts, auditLogs]);

  const timelineEvents = useMemo(() => {
    const events: any[] = [];

    alerts.slice(0, 5).forEach((a) =>
      events.push({
        id: `t-al-${a.alertId}`,
        type: 'alert',
        title: `${a.kpiName} Breach`,
        description: a.message,
        timestamp: a.triggeredAt,
        severity: a.severity,
      })
    );

    auditLogs.slice(0, 3).forEach((a) =>
      events.push({
        id: `t-au-${a.id}`,
        type: 'audit',
        title: a.action,
        description: `${a.actor} modified ${a.entity}`,
        timestamp: a.timestamp,
      })
    );

    activityFeed.slice(0, 2).forEach((a) =>
      events.push({
        id: `t-ac-${a.id}`,
        type: 'activity',
        title: a.type,
        description: a.description,
        timestamp: a.timestamp,
      })
    );

    return events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [alerts, auditLogs, activityFeed]);

  const handleSignalClick = (type: string, data: any) => {
    setSelectedSignal({ type, data });
    setIsDrawerOpen(true);
  };

  const tableRows = useMemo(() => {
    if (activeTab === 'Alerts') {
      return alerts.map((a, i) => ({
        id: a.alertId || a.id || `alert-${i}`,
        type: 'alert' as const,
        raw: a,
        severity: (a.severity || 'warning').toString().toUpperCase(),
        module: a.module || 'System',
        description: a.message || a.kpiName || 'No description',
        lifecycle: (a.status || 'active').toString().toUpperCase(),
        time: a.triggeredAt || a.timestamp || '—',
      }));
    }
    if (activeTab === 'Audit Logs') {
      return auditLogs.map((a, i) => ({
        id: a.id || `audit-${i}`,
        type: 'audit' as const,
        raw: a,
        severity: 'AUDIT',
        module: a.entity || 'Configuration',
        description: a.action ? `${a.actor || 'System'}: ${a.action}` : 'Audit event',
        lifecycle: 'LOGGED',
        time: a.timestamp || '—',
      }));
    }
    return activityFeed.map((a, i) => ({
      id: a.id || `activity-${i}`,
      type: 'activity' as const,
      raw: a,
      severity: (a.status || 'info').toString().toUpperCase(),
      module: a.entity || a.type || 'Activity',
      description: a.description || a.type || 'Activity signal',
      lifecycle: (a.status || 'recorded').toString().toUpperCase(),
      time: a.timestamp || '—',
    }));
  }, [activeTab, alerts, auditLogs, activityFeed]);

  const timelineItems = useMemo(
    () =>
      timelineEvents.map((item) => ({
        id: item.id,
        type: item.type.toUpperCase() as 'ALERT' | 'AUDIT' | 'ACTIVITY',
        timestamp: item.timestamp || '—',
        title: item.title,
        description: item.description,
      })),
    [timelineEvents]
  );

  const mttr = '14.2m';
  const suppressedAlerts = 12;

  return (
    <>
      <div style={{ ...pageStyle, ...sectionSpacingStyle, minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <Siren style={{ width: '20px', height: '20px', color: 'var(--text-muted)' }} />
            <h1 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Alert Center & Observability
            </h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            Unified operational visibility layer for real-time incidents, audit trails, and system behavior.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
          <button type="button" onClick={loadData} style={actionButtonStyle}>
            <RefreshCw style={{ width: '14px', height: '14px', animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
          </button>
          <button type="button" style={actionButtonStyle}>
            <History style={{ width: '14px', height: '14px' }} /> Audit Log
          </button>
          <button type="button" style={primaryActionButtonStyle}>
            <Settings style={{ width: '14px', height: '14px' }} /> Rule Config
          </button>
        </div>

        <div style={kpiGridStyle}>
          <div style={kpiCardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={kpiLabelStyle}>CRITICAL INCIDENTS</span>
              <ShieldAlert style={{ width: '16px', height: '16px', color: 'var(--text-label)', flexShrink: 0 }} />
            </div>
            <div style={kpiValueStyle}>{stats.criticalAlerts}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
              <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap', flexShrink: 0, background: '#0f2a1a', color: '#4ade80' }}>
                ACTIVE
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-label)' }}>Active Alerts</span>
            </div>
          </div>

          <div style={kpiCardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={kpiLabelStyle}>ACTIVE ALERTS</span>
              <Siren style={{ width: '16px', height: '16px', color: 'var(--text-label)', flexShrink: 0 }} />
            </div>
            <div style={kpiValueStyle}>{stats.activeAlerts}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
              <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap', flexShrink: 0, background: '#0f2a1a', color: '#4ade80' }}>
                ACTIVE
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-label)' }}>Active Alerts</span>
            </div>
          </div>

          <div style={kpiCardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={kpiLabelStyle}>SYSTEM ACTIVITY</span>
              <Activity style={{ width: '16px', height: '16px', color: 'var(--text-label)', flexShrink: 0 }} />
            </div>
            <div style={{ ...kpiValueStyle, fontSize: '32px', fontWeight: 600 }}>Healthy</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
              <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap', flexShrink: 0, background: '#0f2a1a', color: '#4ade80' }}>
                HEALTHY
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-label)' }}>System Activity</span>
            </div>
          </div>

          <div style={kpiCardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={kpiLabelStyle}>RECENT AUDIT ACTIONS</span>
              <History style={{ width: '16px', height: '16px', color: 'var(--text-label)', flexShrink: 0 }} />
            </div>
            <div style={kpiValueStyle}>{stats.recentAuditActions}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
              <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap', flexShrink: 0, background: '#1a1a2e', color: '#818cf8' }}>
                TOTAL
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-label)' }}>Recent Audit Actions</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px', marginBottom: '24px', overflow: 'visible', alignItems: 'start' }}>
          <div
            style={{
              borderRadius: '12px',
              border: '1px solid var(--border-card)',
              background: 'var(--bg-card)',
              overflow: 'visible',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px',
                borderBottom: '1px solid var(--border-card)',
                gap: '12px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                {['Alerts', 'Audit Logs', 'Activity'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab as 'Alerts' | 'Audit Logs' | 'Activity')}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      border: 'none',
                      background: activeTab === tab ? 'rgba(59,130,246,0.15)' : 'transparent',
                      color: activeTab === tab ? '#60a5fa' : 'var(--text-muted)',
                    }}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  placeholder="Search alerts..."
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    border: '1px solid var(--border-card)',
                    background: 'var(--bg-input)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    width: '180px',
                  }}
                />
                <button
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-card)',
                    background: 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <Filter style={{ width: '14px', height: '14px', color: 'var(--text-muted)' }} />
                </button>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '90px 80px 1fr 90px 160px 24px',
                gap: '12px',
                padding: '10px 20px',
                borderBottom: '1px solid var(--border-card)',
              }}
            >
              {['SEVERITY', 'MODULE', 'INCIDENT DESCRIPTION', 'LIFECYCLE', 'TIME', ''].map((h, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: '9px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'rgba(255,255,255,0.3)',
                    fontWeight: 500,
                  }}
                >
                  {h}
                </span>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {tableRows.map((row) => {
                const isCritical = row.severity === 'CRITICAL';
                return (
                  <div
                    key={row.id}
                    onClick={() => handleSignalClick(row.type, row.raw)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '90px 80px 1fr 90px 160px 24px',
                      gap: '12px',
                      padding: '14px 20px',
                      borderBottom: '1px solid var(--border-card)',
                      alignItems: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '999px',
                        fontSize: '10px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        background: isCritical ? '#450a0a' : '#2d1a00',
                        color: isCritical ? '#f87171' : '#f59e0b',
                        border: `1px solid ${isCritical ? 'rgba(248,113,113,0.2)' : 'rgba(245,158,11,0.2)'}`,
                      }}
                    >
                      • {row.severity}
                    </span>

                    <span style={{ fontSize: '11px', color: 'var(--text-label)' }}>{row.module || '—'}</span>

                    <span
                      style={{
                        fontSize: '13px',
                        color: 'var(--text-primary)',
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.description}
                    </span>

                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '999px',
                        fontSize: '10px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        background: 'rgba(59,130,246,0.15)',
                        color: '#60a5fa',
                        border: '1px solid rgba(59,130,246,0.2)',
                      }}
                    >
                      {row.lifecycle}
                    </span>

                    <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                      {row.time}
                    </span>

                    <span style={{ color: 'var(--text-label)', fontSize: '12px' }}>›</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div
            style={{
              borderRadius: '12px',
              border: '1px solid var(--border-card)',
              background: 'var(--bg-card)',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '0',
              overflow: 'visible',
              minHeight: '400px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '20px',
                gap: '8px',
                flexWrap: 'nowrap',
              }}
            >
              <span
                style={{
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'var(--text-muted)',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                UNIFIED OPERATIONAL TIMELINE
              </span>
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '3px 8px',
                  borderRadius: '999px',
                  fontSize: '9px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  background: 'rgba(74,222,128,0.1)',
                  color: '#4ade80',
                  border: '1px solid rgba(74,222,128,0.2)',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    width: '5px',
                    height: '5px',
                    borderRadius: '50%',
                    background: '#4ade80',
                    flexShrink: 0,
                    animation: 'pulse 2s infinite',
                  }}
                />
                LIVE
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0',
                overflowY: 'auto',
                maxHeight: '520px',
                paddingRight: '4px',
              }}
            >
              {timelineItems.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    gap: '12px',
                    padding: '12px 0',
                    borderBottom: '1px solid var(--border-card)',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: '0',
                      top: '0',
                      bottom: '0',
                      width: '2px',
                      background:
                        item.type === 'ALERT'
                          ? 'rgba(248,113,113,0.4)'
                          : item.type === 'AUDIT'
                            ? 'rgba(96,165,250,0.4)'
                            : 'rgba(129,140,248,0.4)',
                      borderRadius: '1px',
                    }}
                  />

                  <div style={{ paddingLeft: '12px', flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        marginBottom: '4px',
                      }}
                    >
                      <span
                        style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '9px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                          background:
                            item.type === 'ALERT'
                              ? 'rgba(248,113,113,0.12)'
                              : item.type === 'AUDIT'
                                ? 'rgba(96,165,250,0.12)'
                                : 'rgba(129,140,248,0.12)',
                          color:
                            item.type === 'ALERT'
                              ? '#f87171'
                              : item.type === 'AUDIT'
                                ? '#60a5fa'
                                : '#818cf8',
                        }}
                      >
                        {item.type}
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          color: 'var(--text-label)',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                          fontFamily: 'monospace',
                        }}
                      >
                        {item.timestamp}
                      </span>
                    </div>

                    <p
                      style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: 'rgba(255,255,255,0.85)',
                        margin: '0 0 3px 0',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.title}
                    </p>

                    <p
                      style={{
                        fontSize: '11px',
                        color: 'rgba(255,255,255,0.3)',
                        margin: 0,
                        lineHeight: 1.4,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', overflow: 'visible' }}>
          <div style={bottomCardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Zap style={{ width: '14px', height: '14px', color: '#f59e0b', flexShrink: 0 }} />
              <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)', fontWeight: 500 }}>
                INCIDENT RESOLUTION VELOCITY
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '4px' }}>
              <span style={{ fontSize: '32px', fontWeight: 600, color: 'var(--text-primary)' }}>{mttr}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-label)' }}>-4% vs avg</span>
            </div>

            <div style={{ marginTop: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.3)' }}>MTTR PROGRESS</span>
                <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)' }}>78% Target Met</span>
              </div>
              <div style={{ height: '4px', borderRadius: '999px', background: 'var(--bg-input)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '78%', borderRadius: '999px', background: '#4ade80' }} />
              </div>
            </div>
          </div>

          <div style={bottomCardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <History style={{ width: '14px', height: '14px', color: '#818cf8', flexShrink: 0 }} />
              <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)', fontWeight: 500 }}>
                DEDUPLICATION INTELLIGENCE
              </span>
            </div>

            <p style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px', marginTop: 0 }}>
              {suppressedAlerts} Alerts Suppressed
            </p>
            <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.3)', lineHeight: 1.6, margin: 0 }}>
              Deduplication engine active. Grouping related signals into parent incidents.
            </p>
          </div>
        </div>
      </div>

      <DiagnosticDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={`${selectedSignal?.type.toUpperCase()} SIGNAL INVESTIGATION`}
        subtitle={`Signal ID: ${selectedSignal?.data?.alertId || selectedSignal?.data?.id}`}
        width="700px"
      >
        {selectedSignal && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <section
              style={{
                padding: '24px',
                borderRadius: '24px',
                border: selectedSignal.type === 'alert' ? '1px solid rgba(239,68,68,0.2)' : '1px solid var(--border-card)',
                background: selectedSignal.type === 'alert' ? 'rgba(239,68,68,0.08)' : 'var(--bg-input)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div>
                  <Badge variant={selectedSignal.type === 'alert' ? 'error' : 'default'} size="sm" dot>
                    {selectedSignal.type.toUpperCase()}
                  </Badge>
                  <h2 style={{ margin: '8px 0 0', fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {selectedSignal.data.kpiName || selectedSignal.data.action || selectedSignal.data.type}
                  </h2>
                </div>
                {selectedSignal.type === 'alert' && (
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                      Lifecycle
                    </p>
                    <div style={{ marginTop: '4px' }}>
                      <Badge variant="error" size="sm">
                        {selectedSignal.data.status.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                )}
              </div>

              <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.7, color: 'rgba(255,255,255,0.75)' }}>
                {selectedSignal.data.message || selectedSignal.data.description || `Transformation of ${selectedSignal.data.entity}`}
              </p>

              {selectedSignal.type === 'alert' && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '16px',
                    marginTop: '24px',
                    paddingTop: '24px',
                    borderTop: '1px solid rgba(239,68,68,0.2)',
                  }}
                >
                  <div>
                    <p style={{ margin: '0 0 6px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                      Affected Entity
                    </p>
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{selectedSignal.data.affectedEntity}</p>
                  </div>
                  <div>
                    <p style={{ margin: '0 0 6px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                      Module Signature
                    </p>
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{selectedSignal.data.module}</p>
                  </div>
                </div>
              )}
            </section>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={{ padding: '16px', borderRadius: '16px', border: '1px solid var(--border-card)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                  <User size={16} />
                  <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Trigger Actor</p>
                </div>
                <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{selectedSignal.data.actor || 'Automatic System Rule'}</p>
              </div>

              <div style={{ padding: '16px', borderRadius: '16px', border: '1px solid var(--border-card)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                  <Clock size={16} />
                  <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Detection Event</p>
                </div>
                <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{selectedSignal.data.triggeredAt || selectedSignal.data.timestamp}</p>
              </div>
            </div>

            <section>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <Box size={18} style={{ color: 'var(--text-muted)' }} />
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Correlation Intelligence</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ padding: '16px', background: 'var(--bg-input)', borderRadius: '12px', display: 'flex', gap: '16px', border: '1px solid var(--border-card)' }}>
                  <Zap size={20} style={{ color: '#60a5fa', marginTop: '4px' }} />
                  <div>
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Performance Anomaly during event</p>
                    <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                      System detected 420ms p95 latency spike in Checkout API matching this signal window.
                    </p>
                  </div>
                </div>
                <div style={{ padding: '16px', background: 'var(--bg-input)', borderRadius: '12px', display: 'flex', gap: '16px', border: '1px solid var(--border-card)' }}>
                  <ScrollText size={20} style={{ color: '#f59e0b', marginTop: '4px' }} />
                  <div>
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Matched Audit Trail Entry</p>
                    <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                      Admin changed Stripe SLA threshold 4m prior to this alert triggering.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section style={{ paddingTop: '16px', borderTop: '1px solid var(--border-card)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Tag size={16} style={{ color: 'var(--text-muted)' }} />
                <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Resolution Actions</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <button
                  type="button"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: 'none',
                    background: '#3b82f6',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '13px',
                  }}
                >
                  <CheckCircle2 size={16} />
                  Acknowledge & Triage
                </button>
                <button
                  type="button"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'transparent',
                    color: 'rgba(255,255,255,0.8)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '13px',
                  }}
                >
                  <RefreshCw size={16} />
                  Attempt Auto-Remediation
                </button>
              </div>
              <button
                type="button"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.8)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '13px',
                }}
              >
                View Service Trace <ExternalLink size={16} />
              </button>
            </section>
          </div>
        )}
      </DiagnosticDrawer>

      <style jsx global>{`
        @keyframes pulse {
          0% { opacity: 0.5; }
          50% { opacity: 1; }
          100% { opacity: 0.5; }
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}

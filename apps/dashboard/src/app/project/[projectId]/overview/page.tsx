'use client';
import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '../../../../context/AuthContext';
import { 
  ShieldCheck, 
  Zap, 
  AlertTriangle, 
  Settings, 
  PlayCircle, 
  ChevronRight 
} from 'lucide-react';
import { PerformanceChart } from '../../../../components/ui/PerformanceChart';
import { MetricCard } from '../../../../components/ui/MetricCard';

export default function ProjectOverviewPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { token, apiFetch, user, outageStatus, lastUpdated } = useAuth();
  const [metrics, setMetrics] = useState<any[]>([]);
  const [trends, setTrends] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isExpired = outageStatus === 'expired';

  useEffect(() => {
    // Proactive Guard: If token or projectId are missing, wait for AuthProvider/Routing to stabilize.
    if (!token || !projectId) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setErrorMsg(null);

    Promise.allSettled([
      apiFetch(`/api/v1/dashboard/summaries?siteId=${projectId}`),
      apiFetch(`/api/v1/dashboard/alerts?siteId=${projectId}`),
      apiFetch(`/api/v1/dashboard/performance/trends?siteId=${projectId}`)
    ]).then((results) => {
      if (!isMounted) return;

      const errors = results.filter(r => r.status === 'rejected');
      if (errors.length > 0) {
        console.error('[Dashboard] Some endpoints failed:', errors);
        const firstError = (errors[0] as PromiseRejectedResult).reason;
        setErrorMsg(firstError?.message || 'Failed to fetch dashboard data. Please try again.');
      }

      const [m, a, t] = results.map(r => r.status === 'fulfilled' ? r.value : []);
      
      setMetrics(Array.isArray(m) ? m : []);
      setAlerts(Array.isArray(a) ? a : []);
      setTrends(Array.isArray(t) ? t : []);
      setLoading(false);
    });

    return () => { isMounted = false; };
  }, [projectId, token, apiFetch]);

  if (loading) return <div style={{ color: 'var(--text-secondary)', padding: '40px', textAlign: 'center' }}>Gathering project context...</div>;

  const activeAlerts = (alerts || []).filter((a: any) => a.status === 'active');

  const metricLabelMap: Record<string, { title: string, icon: string, unit?: string }> = {
    'pageLoadTime':      { title: 'Page Load Avg', icon: '⚡', unit: 'ms' },
    'errorRatePct':       { title: 'Client Errors', icon: '⚠️', unit: 'events' },
    'activeUsers':        { title: 'Active Users',   icon: '👥' },
    'ordersTotal':        { title: 'Total Orders',   icon: '🛍️' },
    'ordersDelayCount':   { title: 'Delayed Orders', icon: '⏳' },
    'syncSuccessRate':    { title: 'Integrations Sync', icon: '🔗', unit: '%' },
  };

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '60px', position: 'relative' }}>
      {isExpired && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.4)',
          backdropFilter: 'blur(4px)',
          zIndex: 50,
          borderRadius: '24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px',
          textAlign: 'center',
          border: '1px solid rgba(239, 68, 68, 0.2)'
        }}>
           <div style={{
             width: '80px', height: '80px', borderRadius: '30px',
             background: 'rgba(239, 68, 68, 0.1)',
             display: 'flex', alignItems: 'center', justifyContent: 'center',
             marginBottom: '24px',
             border: '1px solid rgba(239, 68, 68, 0.2)'
           }}>
             <AlertTriangle size={40} color="var(--accent-red)" />
           </div>
           <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#fff', marginBottom: '16px' }}>Data Lifecycle Expired</h2>
           <p style={{ maxWidth: '400px', color: 'rgba(255,255,255,0.7)', lineHeight: '1.6', marginBottom: '32px' }}>
             The dashboard has been disconnected from live services for more than 24 hours. 
             Last successful sync: <strong style={{ color: '#fff' }}>{lastUpdated ? new Date(lastUpdated).toLocaleString() : 'Unknown'}</strong>.
           </p>
           <button 
             onClick={() => window.location.reload()}
             style={{
               padding: '12px 32px',
               background: 'var(--accent-red)',
               color: '#fff',
               border: 'none',
               borderRadius: '12px',
               fontWeight: '800',
               cursor: 'pointer',
               boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
             }}
           >
             Attempt Reconnection
           </button>
        </div>
      )}

      <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: isExpired ? 0.3 : 1 }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px', letterSpacing: '-0.4px' }}>
            Project Dashboard
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>PROJECT ID: <code style={{ color: 'var(--accent-blue)', fontWeight: '700' }}>{projectId}</code></span>
            <span style={{ width: '4px', height: '4px', background: 'var(--border)', borderRadius: '50%' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: 'var(--accent-green)', fontWeight: '700' }}>
              <ShieldCheck size={14} /> System Operational
            </div>
          </div>
        </div>
        
        {user?.role !== 'CUSTOMER' && (
          <div style={{ display: 'flex', gap: '12px' }}>
            <button style={{ padding: '10px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Settings size={16} /> Manage
            </button>
            <button 
              onClick={() => {
                apiFetch('/api/v1/simulate', { method: 'POST', body: JSON.stringify({ siteId: projectId }) })
                  .then(() => window.location.reload())
                  .catch(e => alert('Simulation failed: ' + e.message));
              }}
              style={{ padding: '10px 16px', background: 'var(--accent-blue)', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <PlayCircle size={16} /> Simulate Traffic
            </button>
          </div>
        )}
      </header>

      {errorMsg && (
        <div style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent-red)', borderRadius: '12px', marginBottom: '24px', color: 'var(--accent-red)', fontWeight: '700' }}>
          <AlertTriangle size={18} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'text-bottom' }} />
          {errorMsg}
        </div>
      )}

      {/* Main Grid: Metrics & Trend */}
      <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr', gap: '24px', marginBottom: '32px' }}>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px'
          }}>
             {Array.isArray(metrics) && metrics.length === 0 ? (
               <div style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', background: 'var(--bg-surface)', borderRadius: '20px', border: '1px solid var(--border)' }}>
                 <ShieldCheck size={48} color="rgba(148, 163, 184, 0.5)" style={{ margin: '0 auto 16px' }} />
                 <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-secondary)', marginBottom: '8px' }}>Waiting for Telemetry</h3>
                 <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>No live events tracked yet. Click "Simulate Traffic" to generate synthetic data.</p>
               </div>
             ) : (
               Array.isArray(metrics) && metrics.map((m: any) => {
                 const cfg = metricLabelMap[m?.kpiName] || { title: m?.kpiName || 'Unknown KPI', icon: '📈', unit: undefined };
                 return (
                   <MetricCard
                     key={m?.kpiName || Math.random()}
                     title={cfg.title}
                     value={m?.value}
                     unit={cfg.unit}
                     state={m?.state || 'healthy'}
                     icon={cfg.icon}
                     trendPct={m?.trendPct}
                   />
                 );
               })
             )}
          </div>
          
          <PerformanceChart data={trends || []} title="Global Latency Trend" />
        </div>

        {/* Sidebar: Alerts & Activity */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '20px', padding: '24px' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '800', color: 'var(--text-secondary)' }}>ACTIVE ALERTS</h3>
                <span style={{ fontSize: '10px', padding: '2px 8px', background: activeAlerts.length > 0 ? 'var(--accent-red)' : 'var(--border)', color: '#fff', borderRadius: '10px' }}>
                  {activeAlerts.length}
                </span>
             </div>
             
             {activeAlerts.length === 0 ? (
               <div style={{ textAlign: 'center', padding: '24px 0' }}>
                 <ShieldCheck size={32} color="var(--accent-green)" style={{ opacity: 0.5, marginBottom: '8px' }} />
                 <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No critical breaches detected</p>
               </div>
             ) : (
               <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {activeAlerts.slice(0, 3).map((a: any) => (
                    <div key={a?.alertId || Math.random()} style={{ padding: '12px', background: 'rgba(220, 38, 38, 0.05)', border: '1px solid rgba(220, 38, 38, 0.1)', borderRadius: '12px' }}>
                       <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontSize: '12px', fontWeight: '800', color: 'var(--accent-red)' }}>{a?.kpiName}</span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>2m ago</span>
                       </div>
                       <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>{a?.message}</p>
                    </div>
                  ))}
                  <a href={`/project/${projectId}/alerts`} style={{ marginTop: '8px', fontSize: '12px', fontWeight: '700', color: 'var(--accent-blue)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    View all alerts <ChevronRight size={14} />
                  </a>
               </div>
             )}
          </div>

          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '20px', padding: '24px' }}>
             <h3 style={{ fontSize: '14px', fontWeight: '800', color: 'var(--text-secondary)', marginBottom: '16px' }}>GOVERNANCE</h3>
             <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <li style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px' }}>
                  <Zap size={14} color="var(--accent-orange)" />
                  Trend Ingestion: <span style={{ fontWeight: '700', marginLeft: 'auto' }}>Active</span>
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px' }}>
                  <AlertTriangle size={14} color="var(--accent-red)" />
                  Auto-Recovery: <span style={{ fontWeight: '700', marginLeft: 'auto' }}>Enabled</span>
                </li>
             </ul>
          </div>

        </div>

      </div>
    </div>
  );
}

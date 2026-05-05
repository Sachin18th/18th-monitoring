// 'use client';

// import React, { useState, useEffect, useCallback } from 'react';
// import { useParams } from 'next/navigation';
// import { EventStream } from '@/components/rum/EventStream';
// import { DeviceDistribution } from '@/components/rum/DeviceDistribution';
// import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
// import { Globe, Users, AlertCircle, RefreshCw } from 'lucide-react';
// import { useAuth } from '@/context/AuthContext';

// const pageStyle: React.CSSProperties = {
//   padding: '24px 28px',
//   maxWidth: '1280px',
//   margin: '0 auto',
//   display: 'block',
//   overflow: 'visible',
// };

// const sectionSpacingStyle: React.CSSProperties = {
//   display: 'flex',
//   flexDirection: 'column',
//   gap: '24px',
//   overflow: 'visible',
// };

// const actionButtonStyle: React.CSSProperties = {
//   display: 'flex',
//   alignItems: 'center',
//   gap: '8px',
//   padding: '8px 16px',
//   borderRadius: '8px',
//   border: '1px solid var(--border-input)',
//   background: 'var(--bg-input)',
//   color: 'var(--text-primary)',
//   fontSize: '14px',
//   fontWeight: 500,
//   cursor: 'pointer',
//   flexShrink: 0,
// };

// const metricGridStyle: React.CSSProperties = {
//   display: 'grid',
//   gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
//   gap: '24px',
//   marginBottom: '24px',
//   width: '100%',
//   overflow: 'visible',
// };

// const metricCardStyle: React.CSSProperties = {
//   borderRadius: '12px',
//   border: '1px solid var(--border-card)',
//   background: 'var(--bg-card)',
//   padding: '24px',
//   paddingTop: '24px',
//   display: 'flex',
//   flexDirection: 'column',
//   justifyContent: 'space-between',
//   minHeight: '140px',
//   overflow: 'visible',
// };

// const chartSectionGridStyle: React.CSSProperties = {
//   display: 'grid',
//   gridTemplateColumns: '1fr 320px',
//   gap: '24px',
//   marginBottom: '24px',
//   overflow: 'visible',
// };

// const sectionCardStyle: React.CSSProperties = {
//   borderRadius: '12px',
//   border: '1px solid var(--border-card)',
//   background: 'var(--bg-card)',
//   padding: '24px',
//   overflow: 'visible',
// };

// const bottomSectionGridStyle: React.CSSProperties = {
//   display: 'grid',
//   gridTemplateColumns: '1fr 1fr',
//   gap: '24px',
//   overflow: 'visible',
// };

// const errorBannerStyle: React.CSSProperties = {
//   width: '100%',
//   display: 'flex',
//   alignItems: 'center',
//   justifyContent: 'space-between',
//   gap: '12px',
//   borderRadius: '8px',
//   border: '1px solid rgba(244,63,94,0.2)',
//   background: 'rgba(244,63,94,0.1)',
//   padding: '12px 16px',
//   color: '#fb7185',
//   overflow: 'visible',
// };

// export default function RumDashboardPage() {
//   const { projectId } = useParams();
//   const { apiFetch, token } = useAuth();
  
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState<string | null>(null);
  
//   const [webVitals, setWebVitals] = useState<any[]>([]);
//   const [devices, setDevices] = useState<any[]>([]);
//   const [loadTimeTrend, setLoadTimeTrend] = useState<any[]>([]);
//   const [events, setEvents] = useState<any[]>([]);
//   const [analytics, setAnalytics] = useState<any>(null);
//   const [topPages, setTopPages] = useState<any[]>([]);

//   const loadData = useCallback(async () => {
//     if (!token || !projectId) return;
    
//     setLoading(true);
//     setError(null);
    
//     try {
//       const [perfSummary, deviceData, trendData, userAnalytics, slowestPages] = await Promise.all([
//         apiFetch(`/api/v1/dashboard/performance/summary?siteId=${projectId}`),
//         apiFetch(`/api/v1/dashboard/performance/device?siteId=${projectId}`),
//         apiFetch(`/api/v1/dashboard/performance/trends?siteId=${projectId}`),
//         apiFetch(`/api/v1/dashboard/customers/analytics?siteId=${projectId}`),
//         apiFetch(`/api/v1/dashboard/performance/slowest-pages?siteId=${projectId}`)
//       ]);

//       setWebVitals([
//         { name: 'LCP', value: perfSummary?.lcp || 0, unit: 'ms', rating: (perfSummary?.lcp < 2500 ? 'good' : 'poor') as any, description: 'Largest Contentful Paint measures when the largest content element becomes visible.' },
//         { name: 'FID', value: perfSummary?.fid || 0, unit: 'ms', rating: (perfSummary?.fid < 100 ? 'good' : 'poor') as any, description: 'First Input Delay measures responsiveness to user input.' },
//         { name: 'CLS', value: perfSummary?.cls || 0, unit: '', rating: (perfSummary?.cls < 0.1 ? 'good' : 'poor') as any, description: 'Cumulative Layout Shift measures visual stability.' },
//         { name: 'TTFB', value: perfSummary?.ttfb || 0, unit: 'ms', rating: (perfSummary?.ttfb < 600 ? 'good' : 'poor') as any, description: 'Time to First Byte measures server response time.' },
//       ]);

//       setDevices(Array.isArray(deviceData) ? deviceData : []);
//       setLoadTimeTrend(Array.isArray(trendData) ? trendData : []);
//       setAnalytics(userAnalytics);
//       setTopPages(Array.isArray(slowestPages) ? slowestPages : []);
//       setEvents([]); // Real events stream would go here
      
//     } catch (err: any) {
//       console.error('[RUM] Load failed', err);
//       setError('Failed to synchronize frontend telemetry. Please check integration health.');
//     } finally {
//       setLoading(false);
//     }
//   }, [apiFetch, projectId, token]);

//   useEffect(() => {
//     loadData();
//     const interval = setInterval(loadData, 30000); // Auto-refresh every 30s
//     return () => clearInterval(interval);
//   }, [loadData]);

//   if (loading && !analytics) {
//     return (
//       <div style={{ ...pageStyle, ...sectionSpacingStyle, minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
//         <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
//           <div style={{ width: '48px', height: '48px', borderRadius: '999px', border: '4px solid #1e293b', borderTopColor: '#6366f1', marginBottom: '16px' }} />
//           <span style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em' }}>Synchronizing Frontend Telemetry...</span>
//         </div>
//       </div>
//     );
//   }

//   return (
//     <div style={{ ...pageStyle, ...sectionSpacingStyle, minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
//       {/* Header */}
//       <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
//         <div style={{ maxWidth: '42rem', minWidth: 0 }}>
//           <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px', fontSize: '20px', lineHeight: 1.25, fontWeight: 500, color: 'var(--text-primary)' }}>
//             <Globe style={{ width: '20px', height: '20px', color: '#818cf8', flexShrink: 0 }} />
//             Frontend Observability (RUM)
//           </h1>
//           <p style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.6, overflowWrap: 'anywhere' }}>
//             Real-time user experience monitoring for {projectId as string}
//           </p>
//         </div>
        
//         <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
//           <div style={actionButtonStyle}>
//             <Users style={{ width: '16px', height: '16px', color: '#818cf8', flexShrink: 0 }} />
//             <span>{analytics?.activeUsers || 0} Active Sessions</span>
//           </div>
//           <button
//             onClick={loadData}
//             style={actionButtonStyle}
//           >
//             <RefreshCw style={{ width: '16px', height: '16px', flexShrink: 0 }} className={loading ? 'animate-spin' : ''} />
//             Refresh
//           </button>
//         </div>
//       </div>

//       {/* Error banner */}
//       {error && (
//         <div style={errorBannerStyle}>
//           <div style={{ display: 'flex', minWidth: 0, alignItems: 'center', gap: '12px' }}>
//             <AlertCircle style={{ width: '16px', height: '16px', flexShrink: 0 }} />
//             <span style={{ fontSize: '14px', textAlign: 'center', overflowWrap: 'anywhere' }}>{error}</span>
//           </div>
//           <button onClick={loadData} style={{ marginLeft: '8px', flexShrink: 0, fontSize: '14px', fontWeight: 500, textDecoration: 'underline', color: '#fb7185', cursor: 'pointer', background: 'transparent', border: 'none' }}>Retry</button>
//         </div>
//       )}

//       {/* Core Web Vitals Grid */}
//       <div style={metricGridStyle}>
//         {webVitals.map((vital) => {
//           const isGood = vital.rating === 'good';
//           const badgeBg = isGood ? 'var(--success-bg)' : 'var(--error-bg)';
//           const badgeColor = isGood ? 'var(--success-text)' : 'var(--error-text)';
//           return (
//             <div key={vital.name} style={metricCardStyle}>
//               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
//                 <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', fontWeight: 500 }}>
//                   {vital.name}
//                 </span>
//                 <Globe style={{ width: '16px', height: '16px', flexShrink: 0, color: 'var(--text-label)' }} />
//               </div>

//               <div style={{ fontSize: '38px', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1, padding: '8px 0' }}>
//                 {vital.value}
//                 {vital.unit ? <span style={{ fontSize: '14px', color: 'var(--text-muted)', marginLeft: '4px' }}>{vital.unit}</span> : null}
//               </div>

//               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', gap: '8px', minWidth: 0 }}>
//                 <span
//                   style={{
//                     padding: '3px 10px',
//                     borderRadius: '999px',
//                     fontSize: '10px',
//                     textTransform: 'uppercase',
//                     letterSpacing: '0.08em',
//                     whiteSpace: 'nowrap',
//                     flexShrink: 0,
//                     background: badgeBg,
//                     color: badgeColor,
//                   }}
//                 >
//                   {isGood ? 'GOOD' : 'POOR'}
//                 </span>
//                 <span style={{ fontSize: '11px', color: 'var(--text-label)', marginLeft: '8px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
//                   {vital.description}
//                 </span>
//               </div>
//             </div>
//           );
//         })}
//       </div>

//       <div style={chartSectionGridStyle}>
//         {/* Performance Trend */}
//         <div style={sectionCardStyle}>
//           <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)', fontWeight: 500, marginBottom: '16px' }}>
//             AVERAGE PAGE LOAD TIME (MS)
//           </p>
//           <div style={{ width: '100%', height: '300px' }}>
//             <ResponsiveContainer width="100%" height="100%">
//               <LineChart data={loadTimeTrend}>
//                 <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
//                 <XAxis dataKey="timestamp" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
//                 <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}ms`} />
//                 <Tooltip 
//                   contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '8px' }}
//                   itemStyle={{ color: '#818cf8' }}
//                 />
//                 <Line 
//                   type="monotone" 
//                   dataKey="pageLoadTime" 
//                   stroke="#6366f1" 
//                   strokeWidth={3} 
//                   dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: 'var(--bg-card)' }}
//                   activeDot={{ r: 6, strokeWidth: 0 }}
//                 />
//               </LineChart>
//             </ResponsiveContainer>
//           </div>
//         </div>

//         {/* Device Split */}
//         <div style={sectionCardStyle}>
//           <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)', fontWeight: 500, marginBottom: '16px' }}>
//             DEVICE DISTRIBUTION
//           </p>
//           <DeviceDistribution data={devices} title="Device Distribution" />
//         </div>
//       </div>

//       <div style={bottomSectionGridStyle}>
//         {/* Event Stream */}
//         <div style={{ ...sectionCardStyle, minHeight: '400px' }}>
//           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
//             <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)', fontWeight: 500 }}>
//               REAL-TIME EVENT STREAM
//             </p>
//             <span style={{ fontSize: '10px', color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.08em' }}>LIVE</span>
//           </div>
//           <EventStream events={events} />
//         </div>

//         {/* Route Performance */}
//         <div style={{ ...sectionCardStyle, minHeight: '400px' }}>
//           <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)', fontWeight: 500, marginBottom: '16px' }}>
//             ROUTE PERFORMANCE
//           </p>
//           <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px', gap: '16px', padding: '8px 0', borderBottom: '1px solid var(--border-card)', marginBottom: '8px' }}>
//             <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-label)' }}>PATH</span>
//             <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-label)', textAlign: 'right' }}>AVG LOAD</span>
//             <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-label)', textAlign: 'right' }}>STATUS</span>
//           </div>

//           <div style={{ display: 'flex', flexDirection: 'column' }}>
//             {topPages.map((row) => {
//               const normalized = String(row.status || '').toLowerCase();
//               const badgeBg = normalized === 'healthy' ? 'var(--success-bg)' : normalized === 'warning' ? 'var(--warning-bg)' : 'var(--error-bg)';
//               const badgeColor = normalized === 'healthy' ? 'var(--success-text)' : normalized === 'warning' ? 'var(--warning-text)' : 'var(--error-text)';
//               return (
//                 <div key={row.url} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px', gap: '16px', padding: '12px 0', borderBottom: '1px solid var(--border-card)', alignItems: 'center' }}>
//                   <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.url}</span>
//                   <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, textAlign: 'right' }}>{row.avgLoadTime}ms</span>
//                   <span style={{ textAlign: 'right' }}>
//                     <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '10px', textTransform: 'uppercase', background: badgeBg, color: badgeColor, whiteSpace: 'nowrap', flexShrink: 0 }}>
//                       {row.status}
//                     </span>
//                   </span>
//                 </div>
//               );
//             })}
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }


// apps/dashboard/src/app/project/[projectId]/rum/page.tsx


'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { EventStream } from '@/components/rum/EventStream';
import { DeviceDistribution } from '@/components/rum/DeviceDistribution';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Globe, Users, AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

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
  border: '1px solid var(--border-input)',
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  fontSize: '14px',
  fontWeight: 500,
  cursor: 'pointer',
  flexShrink: 0,
};

const metricGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: '24px',
  marginBottom: '24px',
  width: '100%',
  overflow: 'visible',
};

const metricCardStyle: React.CSSProperties = {
  borderRadius: '12px',
  border: '1px solid var(--border-card)',
  background: 'var(--bg-card)',
  padding: '24px',
  paddingTop: '24px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  minHeight: '140px',
  overflow: 'visible',
};

const chartSectionGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 320px',
  gap: '24px',
  marginBottom: '24px',
  overflow: 'visible',
};

const sectionCardStyle: React.CSSProperties = {
  borderRadius: '12px',
  border: '1px solid var(--border-card)',
  background: 'var(--bg-card)',
  padding: '24px',
  overflow: 'visible',
};

const bottomSectionGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '24px',
  overflow: 'visible',
};

const errorBannerStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  borderRadius: '8px',
  border: '1px solid rgba(244,63,94,0.2)',
  background: 'rgba(244,63,94,0.1)',
  padding: '12px 16px',
  color: '#fb7185',
  overflow: 'visible',
};

type RoutePerformanceRow = {
  key: string;
  url: string;
  avgLoadTime: number;
  status: 'healthy' | 'warning' | 'critical';
};

const getRouteStatus = (avgLoadTime: number, status?: string): RoutePerformanceRow['status'] => {
  const normalized = status?.toLowerCase();
  if (normalized === 'healthy' || normalized === 'warning' || normalized === 'critical') {
    return normalized;
  }

  if (avgLoadTime > 4000) return 'critical';
  if (avgLoadTime > 3000) return 'warning';
  return 'healthy';
};

const normalizeRoutePerformanceRows = (rows: any[]): RoutePerformanceRow[] => {
  return rows.map((row, index) => {
    const url = String(row?.url || row?.route || row?.page || row?.path || row?.dimension || '/unknown').trim() || '/unknown';
    const rawLoadTime = Number(row?.avgLoadTime ?? row?.loadTime ?? row?.pageLoadTime ?? row?.p95 ?? 0);
    const avgLoadTime = Number.isFinite(rawLoadTime) ? rawLoadTime : 0;

    return {
      key: `${url}-${index}`,
      url,
      avgLoadTime,
      status: getRouteStatus(avgLoadTime, row?.status),
    };
  });
};

export default function RumDashboardPage() {
  const { projectId } = useParams();
  const { apiFetch, token } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [webVitals, setWebVitals] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [loadTimeTrend, setLoadTimeTrend] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [topPages, setTopPages] = useState<RoutePerformanceRow[]>([]);

  const loadData = useCallback(async () => {
    if (!token || !projectId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const [perfSummary, deviceData, trendData, userAnalytics, slowestPages] = await Promise.all([
        apiFetch(`/api/v1/dashboard/performance/summary?siteId=${projectId}`),
        apiFetch(`/api/v1/dashboard/performance/device?siteId=${projectId}`),
        apiFetch(`/api/v1/dashboard/performance/trends?siteId=${projectId}`),
        apiFetch(`/api/v1/dashboard/customers/analytics?siteId=${projectId}`),
        apiFetch(`/api/v1/dashboard/performance/slowest-pages?siteId=${projectId}`)
      ]);

      setWebVitals([
        { name: 'LCP', value: perfSummary?.lcp || 0, unit: 'ms', rating: (perfSummary?.lcp < 2500 ? 'good' : 'poor') as any, description: 'Largest Contentful Paint measures when the largest content element becomes visible.' },
        { name: 'FID', value: perfSummary?.fid || 0, unit: 'ms', rating: (perfSummary?.fid < 100 ? 'good' : 'poor') as any, description: 'First Input Delay measures responsiveness to user input.' },
        { name: 'CLS', value: perfSummary?.cls || 0, unit: '', rating: (perfSummary?.cls < 0.1 ? 'good' : 'poor') as any, description: 'Cumulative Layout Shift measures visual stability.' },
        { name: 'TTFB', value: perfSummary?.ttfb || 0, unit: 'ms', rating: (perfSummary?.ttfb < 600 ? 'good' : 'poor') as any, description: 'Time to First Byte measures server response time.' },
      ]);

      setDevices(Array.isArray(deviceData) ? deviceData : []);
      setLoadTimeTrend(Array.isArray(trendData) ? trendData : []);
      setAnalytics(userAnalytics);
      setTopPages(Array.isArray(slowestPages) ? normalizeRoutePerformanceRows(slowestPages) : []);
      setEvents([]); // Real events stream would go here
      
    } catch (err: any) {
      console.error('[RUM] Load failed', err);
      setError('Failed to synchronize frontend telemetry. Please check integration health.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, projectId, token]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // Auto-refresh every 30s
    return () => clearInterval(interval);
  }, [loadData]);

  if (loading && !analytics) {
    return (
      <div style={{ ...pageStyle, ...sectionSpacingStyle, minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '999px', border: '4px solid #1e293b', borderTopColor: '#6366f1', marginBottom: '16px' }} />
          <span style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em' }}>Synchronizing Frontend Telemetry...</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...pageStyle, ...sectionSpacingStyle, minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ maxWidth: '42rem', minWidth: 0 }}>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px', fontSize: '20px', lineHeight: 1.25, fontWeight: 500, color: 'var(--text-primary)' }}>
            <Globe style={{ width: '20px', height: '20px', color: '#818cf8', flexShrink: 0 }} />
            Frontend Observability (RUM)
          </h1>
          <p style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.6, overflowWrap: 'anywhere' }}>
            Real-time user experience monitoring for {projectId as string}
          </p>
        </div>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <div style={actionButtonStyle}>
            <Users style={{ width: '16px', height: '16px', color: '#818cf8', flexShrink: 0 }} />
            <span>{analytics?.activeUsers || 0} Active Sessions</span>
          </div>
          <button
            onClick={loadData}
            style={actionButtonStyle}
          >
            <RefreshCw style={{ width: '16px', height: '16px', flexShrink: 0 }} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={errorBannerStyle}>
          <div style={{ display: 'flex', minWidth: 0, alignItems: 'center', gap: '12px' }}>
            <AlertCircle style={{ width: '16px', height: '16px', flexShrink: 0 }} />
            <span style={{ fontSize: '14px', textAlign: 'center', overflowWrap: 'anywhere' }}>{error}</span>
          </div>
          <button onClick={loadData} style={{ marginLeft: '8px', flexShrink: 0, fontSize: '14px', fontWeight: 500, textDecoration: 'underline', color: '#fb7185', cursor: 'pointer', background: 'transparent', border: 'none' }}>Retry</button>
        </div>
      )}

      {/* Core Web Vitals Grid */}
      <div style={metricGridStyle}>
        {webVitals.map((vital) => {
          const isGood = vital.rating === 'good';
          const badgeBg = isGood ? 'var(--success-bg)' : 'var(--error-bg)';
          const badgeColor = isGood ? 'var(--success-text)' : 'var(--error-text)';
          return (
            <div key={vital.name} style={metricCardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', fontWeight: 500 }}>
                  {vital.name}
                </span>
                <Globe style={{ width: '16px', height: '16px', flexShrink: 0, color: 'var(--text-label)' }} />
              </div>

              <div style={{ fontSize: '38px', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1, padding: '8px 0' }}>
                {vital.value}
                {vital.unit ? <span style={{ fontSize: '14px', color: 'var(--text-muted)', marginLeft: '4px' }}>{vital.unit}</span> : null}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', gap: '8px', minWidth: 0 }}>
                <span
                  style={{
                    padding: '3px 10px',
                    borderRadius: '999px',
                    fontSize: '10px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    background: badgeBg,
                    color: badgeColor,
                  }}
                >
                  {isGood ? 'GOOD' : 'POOR'}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-label)', marginLeft: '8px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {vital.description}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={chartSectionGridStyle}>
        {/* Performance Trend */}
        <div style={sectionCardStyle}>
          <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)', fontWeight: 500, marginBottom: '16px' }}>
            AVERAGE PAGE LOAD TIME (MS)
          </p>
          <div style={{ width: '100%', height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={loadTimeTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="timestamp" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}ms`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '8px' }}
                  itemStyle={{ color: '#818cf8' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="pageLoadTime" 
                  stroke="#6366f1" 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: 'var(--bg-card)' }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Device Split */}
        <div style={sectionCardStyle}>
          <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)', fontWeight: 500, marginBottom: '16px' }}>
            DEVICE DISTRIBUTION
          </p>
          <DeviceDistribution data={devices} title="Device Distribution" />
        </div>
      </div>

      <div style={bottomSectionGridStyle}>
        {/* Event Stream */}
        <div style={{ ...sectionCardStyle, minHeight: '400px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)', fontWeight: 500 }}>
              REAL-TIME EVENT STREAM
            </p>
            <span style={{ fontSize: '10px', color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.08em' }}>LIVE</span>
          </div>
          <EventStream events={events} />
        </div>

        {/* Route Performance */}
        <div style={{ ...sectionCardStyle, minHeight: '400px' }}>
          <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-label)', fontWeight: 500, marginBottom: '16px' }}>
            ROUTE PERFORMANCE
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px', gap: '16px', padding: '8px 0', borderBottom: '1px solid var(--border-card)', marginBottom: '8px' }}>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-label)' }}>PATH</span>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-label)', textAlign: 'right' }}>AVG LOAD</span>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-label)', textAlign: 'right' }}>STATUS</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {topPages.map((row) => {
              const normalized = String(row.status || '').toLowerCase();
              const badgeBg = normalized === 'healthy' ? 'var(--success-bg)' : normalized === 'warning' ? 'var(--warning-bg)' : 'var(--error-bg)';
              const badgeColor = normalized === 'healthy' ? 'var(--success-text)' : normalized === 'warning' ? 'var(--warning-text)' : 'var(--error-text)';
              return (
                <div key={row.key} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px', gap: '16px', padding: '12px 0', borderBottom: '1px solid var(--border-card)', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.url}</span>
                  <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, textAlign: 'right' }}>{row.avgLoadTime}ms</span>
                  <span style={{ textAlign: 'right' }}>
                    <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '10px', textTransform: 'uppercase', background: badgeBg, color: badgeColor, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {row.status}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
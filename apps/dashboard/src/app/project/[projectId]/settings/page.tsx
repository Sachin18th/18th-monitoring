// 'use client';
// import React, { useEffect, useState, useCallback } from 'react';
// import { useParams } from 'next/navigation';
// import { 
//   Settings, 
//   ShieldCheck, 
//   Database, 
//   Users, 
//   Box, 
//   KeyRound, 
//   History,
//   AlertCircle,
//   CheckCircle2,
//   Lock,
//   ChevronRight,
//   Info,
//   Clock,
//   RotateCcw
// } from 'lucide-react';
// import { 
//   PageLayout, 
//   Typography, 
//   Card, 
//   Badge, 
//   Button,
//   DiagnosticDrawer
// } from '@kpi-platform/ui';
// import { useAuth } from '../../../../context/AuthContext';
// import { RoleGuard } from '../../../../components/auth/RoleGuard';

// // Governance Components
// import { GovernancePanel } from '../../../../components/administration/GovernancePanel';
// import { IntegrationsConfig } from '../../../../components/administration/IntegrationsConfig';
// import { RBACControl } from '../../../../components/administration/RBACControl';

// export default function AdministrationPage() {
//   const params = useParams();
//   const projectId = params.projectId as string;
//   const { token, apiFetch } = useAuth();
  
//   // Governance State
//   const [loading, setLoading] = useState(true);
//   const [activeSection, setActiveSection] = useState('integrations');
//   const [config, setConfig] = useState<any>(null);
//   const [connectors, setConnectors] = useState<any[]>([]);

//   // Safety State
//   const [pendingAction, setPendingAction] = useState<any>(null);
//   const [isDrawerOpen, setIsDrawerOpen] = useState(false);

//   const loadData = useCallback(async () => {
//     if (!token || !projectId) return;
//     setLoading(true);
//     try {
//       const [govConfig, connData] = await Promise.all([
//         apiFetch(`/api/v1/dashboard/governance?siteId=${projectId}`),
//         apiFetch(`/api/v1/dashboard/integrations/list?siteId=${projectId}`)
//       ]);
//       setConfig(govConfig);
//       setConnectors(Array.isArray(connData) ? connData : []);
//     } catch (err) {
//       console.error('Governance fetch failure:', err);
//     } finally {
//       setLoading(false);
//     }
//   }, [projectId, token, apiFetch]);

//   useEffect(() => {
//     loadData();
//   }, [loadData]);

//   const handleActionRequest = (action: any) => {
//     setPendingAction(action);
//     setIsDrawerOpen(true);
//   };

//   return (
//     <RoleGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
//       <PageLayout
//         title="Governance & System Control"
//         subtitle="Manage the platform's central control plane: integrations, identity policies, and project environments."
//         icon={<Settings size={24} />}
//       >
//          <div className="space-y-6 pb-24">
//             {/* 1. Control Plane Navigation */}
//             <GovernancePanel 
//               activeTab={activeSection} 
//               onTabChange={(id) => setActiveSection(id)} 
//             />

//             <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
//                {/* 2. Focused Configuration Zone */}
//                <div className="lg:col-span-3 space-y-8">
                  
//                   {activeSection === 'integrations' && (
//                     <IntegrationsConfig 
//                       connectors={connectors}
//                       loading={loading}
//                       onAdd={() => handleActionRequest({ type: 'setup', title: 'New Connector Setup' })}
//                     />
//                   )}

//                   {activeSection === 'rbac' && (
//                     <RBACControl 
//                       users={config?.rbac?.users || []}
//                       roles={config?.rbac?.roles || []}
//                       loading={loading}
//                       onAddUser={() => handleActionRequest({ type: 'invite', title: 'Identity Invitation' })}
//                     />
//                   )}

//                   {activeSection === 'projects' && (
//                     <div className="space-y-6">
//                        <Card className="p-8 border-subtle">
//                           <div className="flex justify-between items-start mb-8">
//                              <div>
//                                 <Typography variant="h3" weight="bold" noMargin>Project Metadata</Typography>
//                                 <Typography variant="micro" className="text-text-muted mt-1">Configuring regional residency and environment mapping.</Typography>
//                              </div>
//                              <Badge variant="success" size="sm">ACTIVE SCOPE</Badge>
//                           </div>
//                           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
//                              <div className="space-y-2">
//                                 <Typography variant="micro" weight="bold" className="text-text-muted uppercase">ENVIRONMENT TYPE</Typography>
//                                 <Typography variant="body" weight="bold" className="text-sm border-b border-subtle pb-2 block">Enterprise Production</Typography>
//                              </div>
//                              <div className="space-y-2">
//                                 <Typography variant="micro" weight="bold" className="text-text-muted uppercase">DATA RESIDENCY</Typography>
//                                 <Typography variant="body" weight="bold" className="text-sm border-b border-subtle pb-2 block">{config?.project?.region}</Typography>
//                              </div>
//                           </div>
//                        </Card>
//                        <Card className="p-8 border-subtle bg-muted/20">
//                           <Typography variant="h3" weight="bold" className="mb-4">Environmental Guardrails</Typography>
//                           <div className="space-y-4">
//                              {config?.project?.environments.map((env: string) => (
//                                 <div key={env} className="flex items-center justify-between p-3 bg-surface border border-subtle rounded-xl group hover:border-primary/30 transition-all cursor-pointer">
//                                    <div className="flex items-center gap-3">
//                                       <Box className="text-text-muted transition-colors group-hover:text-primary" size={18} />
//                                       <Typography variant="body" weight="bold" className="text-sm capitalize">{env}</Typography>
//                                    </div>
//                                    <Badge variant={env === 'production' ? 'success' : 'default'} size="sm">ISOLATED</Badge>
//                                 </div>
//                              ))}
//                           </div>
//                        </Card>
//                     </div>
//                   )}

//                   {['api', 'alerts', 'preferences'].includes(activeSection) && (
//                     <Card className="p-12 border-dashed border-subtle flex flex-col items-center text-center">
//                        <div className="p-4 rounded-full bg-muted text-text-muted mb-4">
//                           <Lock size={32} />
//                        </div>
//                        <Typography variant="h3" weight="bold">Module under Governance</Typography>
//                        <Typography variant="body" className="text-text-muted mt-2 max-w-sm">
//                           This configuration section is currently locked following the {config?.versioning?.currentVersion} security hardening policy. 
//                           Contact your Security Lead for override access.
//                        </Typography>
//                        <button type="button" className="mt-6 text-primary font-bold hover:underline flex items-center gap-1 text-sm">
//                            Request Temporary Escalation <ChevronRight size={14} />
//                         </button>
//                     </Card>
//                   )}
//                </div>

//                {/* 3. Governance Signals & History */}
//                <div className="space-y-6">
//                   <Card className="p-6 border-subtle">
//                      <div className="flex items-center gap-2 mb-6 text-text-muted">
//                         <History size={18} />
//                         <Typography variant="body" weight="bold" className="text-sm uppercase tracking-wider">
//                            Configuration History
//                         </Typography>
//                      </div>
//                      <div className="space-y-6 relative border-l border-subtle ml-2 pl-6">
//                         <div className="relative">
//                            <div className="absolute left-[-31px] top-1 w-2.5 h-2.5 rounded-full bg-primary" />
//                            <Typography variant="body" weight="bold" className="text-xs">Current Version</Typography>
//                            <Typography variant="body" weight="bold" className="text-[10px] text-primary">{config?.versioning?.currentVersion}</Typography>
//                            <div className="mt-2 p-3 bg-muted/30 rounded-lg border border-subtle">
//                               <Typography variant="micro" weight="bold" className="block text-text-primary">
//                                  {config?.versioning?.lastChange?.change}
//                               </Typography>
//                               <div className="flex items-center gap-2 mt-2">
//                                  <div className="w-4 h-4 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[8px] font-bold">J</div>
//                                  <Typography variant="micro" className="text-text-muted">{config?.versioning?.lastChange?.who} • {config?.versioning?.lastChange?.timestamp}</Typography>
//                               </div>
//                            </div>
//                         </div>
//                         <div className="relative opacity-60">
//                            <div className="absolute left-[-31px] top-1 w-2.5 h-2.5 rounded-full bg-surface border-2 border-subtle" />
//                            <Typography variant="body" weight="bold" className="text-xs">v2.4.0</Typography>
//                            <Typography variant="micro" className="text-text-muted block mt-1">
//                               Major environment mapping update for Q2.
//                            </Typography>
//                         </div>
//                      </div>
//                       <button type="button" className="action-btn action-btn--ghost action-btn--wide" style={{ marginTop: '2rem', fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
//                          <RotateCcw size={12} /> Rollback Plane
//                       </button>
//                   </Card>

//                   <Card className="p-6 border-subtle bg-primary/5 border-primary/20">
//                      <div className="flex items-start gap-4">
//                         <div className="p-2 bg-primary/10 text-primary rounded-lg shrink-0">
//                            <ShieldCheck size={20} />
//                         </div>
//                         <div>
//                            <Typography variant="body" weight="bold" className="text-sm">Compliance Active</Typography>
//                            <Typography variant="micro" className="text-text-muted mt-1 block leading-relaxed">
//                               This environment is currently governed by **ISO-27001** and **SOC2** security policies.
//                            </Typography>
//                         </div>
//                      </div>
//                   </Card>
//                </div>
//             </div>
//          </div>

//          {/* Governance Action Safety Drawer */}
//          <DiagnosticDrawer
//             isOpen={isDrawerOpen}
//             onClose={() => setIsDrawerOpen(false)}
//             title={pendingAction?.title || 'Governance Confirmation'}
//             subtitle={`Action Request: ${pendingAction?.type.toUpperCase()} • System Scope: ${projectId}`}
//             width="600px"
//          >
//             {pendingAction && (
//               <div className="space-y-8">
//                  <div className="p-6 bg-warning/5 border border-warning/20 rounded-3xl flex gap-4">
//                     <div className="shrink-0 p-3 bg-warning/10 text-warning rounded-2xl h-fit">
//                        <AlertCircle size={24} />
//                     </div>
//                     <div>
//                         <Typography variant="body" weight="bold" className="text-base text-warning-text">Privileged Action Required</Typography>
//                        <Typography variant="body" className="text-sm mt-1 text-text-secondary leading-relaxed">
//                           You are about to perform a configuration update that affects the stability and visibility of the **{projectId}** environment.
//                        </Typography>
//                     </div>
//                  </div>

//                  <section className="space-y-4">
//                     <Typography variant="body" weight="bold" className="text-sm text-text-muted uppercase tracking-wider">Review Change Scope</Typography>
//                     <div className="p-4 bg-muted/20 border border-subtle rounded-2xl space-y-3">
//                        <div className="flex justify-between">
//                           <Typography variant="body" className="text-sm">Actor</Typography>
//                           <Typography variant="body" weight="bold" className="text-sm">System Admin</Typography>
//                        </div>
//                        <div className="flex justify-between">
//                           <Typography variant="body" className="text-sm">Region Impact</Typography>
//                           <Typography variant="body" weight="bold" className="text-sm">Global (Multi-Environment)</Typography>
//                        </div>
//                        <div className="flex justify-between">
//                           <Typography variant="body" className="text-sm">Audit Persistence</Typography>
//                           <Typography variant="body" weight="bold" className="text-sm text-success">Immutable Log (365d)</Typography>
//                        </div>
//                     </div>
//                  </section>

//                  <div className="space-y-4">
//                     <div className="flex items-center gap-2 text-text-muted p-1">
//                        <Info size={14} />
//                        <Typography variant="micro" weight="bold">Confirmation will create a new configuration version.</Typography>
//                     </div>
//                     <div className="flex gap-4">
//                         <button type="button" className="action-btn action-btn--primary" style={{ flex: 1, padding: '1rem' }}>
//                            <CheckCircle2 size={18} />
//                            Confirm Governance Action
//                         </button>
//                         <button 
//                           type="button"
//                           onClick={() => setIsDrawerOpen(false)}
//                           className="action-btn action-btn--outline" style={{ flex: 1, padding: '1rem' }}
//                         >
//                            Cancel
//                         </button>
//                     </div>
//                  </div>
//               </div>
//             )}
//          </DiagnosticDrawer>
//       </PageLayout>
//     </RoleGuard>
//   );
// }


'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { 
   Settings as SettingsIcon,
   ShieldCheck as ShieldCheckIcon,
   Shield as ShieldIcon,
   Database as DatabaseIcon,
   Users as UsersIcon,
   Layers as LayersIcon,
   Plug as PlugIcon,
   Bell as BellIcon,
   KeyRound as KeyIcon,
   SlidersHorizontal as SlidersIcon,
  AlertCircle,
  CheckCircle2,
  Lock,
   ArrowRight as ArrowRightIcon,
  Info,
   Clock as ClockIcon,
   RotateCcw as RotateIcon,
   Plus as PlusIcon,
   Activity as HealthIcon,
   RefreshCw as SyncIcon,
   Inbox as InboxIcon
} from 'lucide-react';
import { 
  DiagnosticDrawer
} from '@kpi-platform/ui';
import { useAuth } from '../../../../context/AuthContext';
import { RoleGuard } from '../../../../components/auth/RoleGuard';

import { RBACControl } from '../../../../components/administration/RBACControl';

const pageStyle: React.CSSProperties = {
   padding: '24px 28px',
   maxWidth: '1280px',
   margin: '0 auto',
   display: 'block',
   overflow: 'visible'
};

const sectionSpacingStyle: React.CSSProperties = {
   display: 'flex',
   flexDirection: 'column',
   gap: '24px',
   overflow: 'visible'
};

export default function AdministrationPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { token, apiFetch } = useAuth();
  
  // Governance State
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('integrations');
  const [config, setConfig] = useState<any>(null);
  const [connectors, setConnectors] = useState<any[]>([]);

  // Safety State
  const [pendingAction, setPendingAction] = useState<any>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const loadData = useCallback(async () => {
    if (!token || !projectId) return;
    setLoading(true);
    try {
      const [govConfig, connData] = await Promise.all([
        apiFetch(`/api/v1/dashboard/governance?siteId=${projectId}`),
        apiFetch(`/api/v1/dashboard/integrations/list?siteId=${projectId}`)
      ]);
      setConfig(govConfig);
      setConnectors(Array.isArray(connData) ? connData : []);
    } catch (err) {
      console.error('Governance fetch failure:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId, token, apiFetch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleActionRequest = (action: any) => {
    setPendingAction(action);
    setIsDrawerOpen(true);
  };

   const navCards = [
      {
         id: 'integrations',
         title: 'Integrations & Connectors',
         subtitle: 'MANAGE ERP, CRM, AND API CONNECTIONS.',
         Icon: PlugIcon
      },
      {
         id: 'rbac',
         title: 'Identity & Access (RBAC)',
         subtitle: 'USER ROLES, PERMISSIONS AND AUDITS.',
         Icon: UsersIcon
      },
      {
         id: 'projects',
         title: 'Project Environments',
         subtitle: 'MANAGE PROD, STAGING AND QA SETUPS.',
         Icon: LayersIcon
      },
      {
         id: 'alerts',
         title: 'Alerting Rules',
         subtitle: 'THRESHOLDS, ROUTING AND SLAS.',
         Icon: BellIcon
      },
      {
         id: 'api',
         title: 'API & Security Keys',
         subtitle: 'ACCESS KEYS AND SECURITY POLICIES.',
         Icon: KeyIcon
      },
      {
         id: 'preferences',
         title: 'System Preferences',
         subtitle: 'GLOBAL DEFAULTS AND VISUAL BRANDING.',
         Icon: SlidersIcon
      }
   ];

   const renderConnectorStatus = (status: string) => {
      const normalized = String(status || '').toLowerCase();
      if (normalized === 'active') {
         return {
            background: '#0f2a1a',
            color: '#4ade80',
            border: '1px solid rgba(74,222,128,0.2)'
         };
      }

      if (normalized === 'degraded') {
         return {
            background: 'rgba(245,158,11,0.12)',
            color: '#f59e0b',
            border: '1px solid rgba(245,158,11,0.2)'
         };
      }

      return {
         background: 'var(--bg-input)',
         color: 'var(--text-secondary)',
         border: '1px solid var(--border-input)'
      };
   };

  return (
    <RoleGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
         <div
            style={{
               ...pageStyle,
               ...sectionSpacingStyle,
               minHeight: '100vh',
               background: 'var(--bg-page)',
               color: 'var(--text-primary)',
               paddingBottom: '96px'
            }}
         >
            <div style={{ marginBottom: '8px' }}>
               <div style={{ marginBottom: '32px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                     <div
                        style={{
                           width: '40px',
                           height: '40px',
                           borderRadius: '10px',
                           background: 'rgba(99,102,241,0.15)',
                           border: '1px solid rgba(99,102,241,0.25)',
                           display: 'flex',
                           alignItems: 'center',
                           justifyContent: 'center',
                           flexShrink: 0
                        }}
                     >
                        <SettingsIcon style={{ width: '18px', height: '18px', color: '#818cf8' }} />
                     </div>
                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h1 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                           Governance & System Control
                        </h1>
                        <span
                           style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              background: '#4ade80',
                              flexShrink: 0,
                              boxShadow: '0 0 6px rgba(74,222,128,0.5)'
                           }}
                        />
                     </div>
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 0 52px' }}>
                     Manage the platform&apos;s central control plane: integrations, identity policies, and project environments.
                  </p>
               </div>

               <div
                  style={{
                     display: 'grid',
                     gridTemplateColumns: 'repeat(3, 1fr)',
                     gap: '16px',
                     marginBottom: '32px',
                     overflow: 'visible'
                  }}
               >
                  {navCards.map(({ id, title, subtitle, Icon }) => (
                     <div
                        key={id}
                        onClick={() => setActiveSection(id)}
                        style={{
                           borderRadius: '12px',
                           border:
                              activeSection === id
                                 ? '1px solid rgba(99,102,241,0.4)'
                                 : '1px solid var(--border-card)',
                           background: 'var(--bg-card)',
                           padding: '24px',
                           display: 'flex',
                           flexDirection: 'column',
                           gap: '12px',
                           cursor: 'pointer',
                           transition: 'border-color 0.15s ease',
                           position: 'relative',
                           overflow: 'hidden'
                        }}
                        onMouseEnter={(e) => {
                           e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)';
                        }}
                        onMouseLeave={(e) => {
                           e.currentTarget.style.borderColor =
                              activeSection === id ? 'rgba(99,102,241,0.4)' : 'var(--border-card)';
                        }}
                     >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                           <div
                              style={{
                                 width: '32px',
                                 height: '32px',
                                 borderRadius: '8px',
                                 background: 'rgba(99,102,241,0.12)',
                                 display: 'flex',
                                 alignItems: 'center',
                                 justifyContent: 'center'
                              }}
                           >
                              <Icon style={{ width: '16px', height: '16px', color: '#818cf8' }} />
                           </div>
                           <ArrowRightIcon style={{ width: '14px', height: '14px', color: 'var(--text-label)' }} />
                        </div>

                        <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{title}</p>

                        <p
                           style={{
                              fontSize: '10px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.08em',
                              color: 'rgba(255,255,255,0.3)',
                              margin: 0,
                              fontWeight: 500
                           }}
                        >
                           {subtitle}
                        </p>
                     </div>
                  ))}
               </div>
            </div>

            {activeSection === 'integrations' && (
               <div
                  style={{
                     display: 'grid',
                     gridTemplateColumns: '1fr 300px',
                     gap: '24px',
                     overflow: 'visible',
                     alignItems: 'start'
                  }}
               >
                  <div
                     style={{
                        borderRadius: '12px',
                        border: '1px solid var(--border-card)',
                        background: 'var(--bg-card)',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column'
                     }}
                  >
                     <div
                        style={{
                           display: 'flex',
                           alignItems: 'center',
                           justifyContent: 'space-between',
                           padding: '16px 24px',
                           borderBottom: '1px solid var(--border-card)'
                        }}
                     >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                           <ShieldIcon style={{ width: '14px', height: '14px', color: '#4ade80' }} />
                           <span
                              style={{
                                 fontSize: '10px',
                                 textTransform: 'uppercase',
                                 letterSpacing: '0.1em',
                                 color: 'var(--text-muted)',
                                 fontWeight: 500
                              }}
                           >
                              SYSTEM CONNECTORS & AUTH
                           </span>
                        </div>
                        <button
                           type="button"
                           onClick={() => handleActionRequest({ type: 'setup', title: 'New Connector Setup' })}
                           style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '6px 12px',
                              borderRadius: '6px',
                              border: 'none',
                              background: '#3b82f6',
                              color: 'var(--text-primary)',
                              fontSize: '12px',
                              fontWeight: 500,
                              cursor: 'pointer'
                           }}
                        >
                           <PlusIcon style={{ width: '12px', height: '12px' }} />
                           New Connector
                        </button>
                     </div>

                     <div
                        style={{
                           display: 'grid',
                           gridTemplateColumns: '1fr 1fr',
                           gap: '0',
                           borderBottom: '1px solid var(--border-card)'
                        }}
                     >
                        <div
                           style={{
                              padding: '16px 24px',
                              borderRight: '1px solid var(--border-card)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px'
                           }}
                        >
                           <div
                              style={{
                                 width: '32px',
                                 height: '32px',
                                 borderRadius: '8px',
                                 background: 'rgba(74,222,128,0.1)',
                                 display: 'flex',
                                 alignItems: 'center',
                                 justifyContent: 'center',
                                 flexShrink: 0
                              }}
                           >
                              <HealthIcon style={{ width: '14px', height: '14px', color: '#4ade80' }} />
                           </div>
                           <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px 0' }}>
                                 Health Governance
                              </p>
                              <p
                                 style={{
                                    fontSize: '10px',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.06em',
                                    color: 'rgba(255,255,255,0.3)',
                                    margin: 0
                                 }}
                              >
                                 AUTO-DISABLE CONNECTORS FAILING FOR &gt;10M.
                              </p>
                           </div>
                           <span
                              style={{
                                 padding: '3px 8px',
                                 borderRadius: '999px',
                                 fontSize: '10px',
                                 textTransform: 'uppercase',
                                 letterSpacing: '0.06em',
                                 whiteSpace: 'nowrap',
                                 flexShrink: 0,
                                 background: '#0f2a1a',
                                 color: '#4ade80',
                                 border: '1px solid rgba(74,222,128,0.2)'
                              }}
                           >
                              ENABLED
                           </span>
                        </div>

                        <div
                           style={{
                              padding: '16px 24px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px'
                           }}
                        >
                           <div
                              style={{
                                 width: '32px',
                                 height: '32px',
                                 borderRadius: '8px',
                                 background: 'rgba(99,102,241,0.1)',
                                 display: 'flex',
                                 alignItems: 'center',
                                 justifyContent: 'center',
                                 flexShrink: 0
                              }}
                           >
                              <SyncIcon style={{ width: '14px', height: '14px', color: '#818cf8' }} />
                           </div>
                           <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px 0' }}>
                                 Sync Policy
                              </p>
                              <p
                                 style={{
                                    fontSize: '10px',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.06em',
                                    color: 'rgba(255,255,255,0.3)',
                                    margin: 0
                                 }}
                              >
                                 AGGRESSIVE DIFFING: 1M INTERVAL.
                              </p>
                           </div>
                           <span
                              style={{
                                 padding: '3px 8px',
                                 borderRadius: '999px',
                                 fontSize: '10px',
                                 textTransform: 'uppercase',
                                 letterSpacing: '0.06em',
                                 whiteSpace: 'nowrap',
                                 flexShrink: 0,
                                 background: 'rgba(99,102,241,0.12)',
                                 color: '#818cf8',
                                 border: '1px solid rgba(99,102,241,0.2)'
                              }}
                           >
                              OPTIMO
                           </span>
                        </div>
                     </div>

                     <div style={{ padding: 0, minHeight: '200px' }}>
                        {connectors.length === 0 ? (
                           <div
                              style={{
                                 display: 'flex',
                                 flexDirection: 'column',
                                 alignItems: 'center',
                                 justifyContent: 'center',
                                 padding: '48px 24px',
                                 gap: '10px'
                              }}
                           >
                              <div
                                 style={{
                                    width: '44px',
                                    height: '44px',
                                    borderRadius: '12px',
                                    background: 'var(--bg-input)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                 }}
                              >
                                 <InboxIcon style={{ width: '20px', height: '20px', color: 'var(--text-label)' }} />
                              </div>
                              <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-muted)', margin: 0 }}>
                                 No data found
                              </p>
                              <p style={{ fontSize: '12px', color: 'var(--text-label)', margin: 0 }}>
                                 There are no records available at this time.
                              </p>
                           </div>
                        ) : (
                           connectors.map((c, i) => {
                              const statusStyle = renderConnectorStatus(c.status);
                              return (
                                 <div
                                    key={i}
                                    style={{
                                       display: 'flex',
                                       alignItems: 'center',
                                       justifyContent: 'space-between',
                                       padding: '14px 24px',
                                       gap: '16px',
                                       borderBottom: '1px solid var(--border-card)'
                                    }}
                                 >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                                       <div
                                          style={{
                                             width: '32px',
                                             height: '32px',
                                             borderRadius: '8px',
                                             background: 'rgba(255,255,255,0.05)',
                                             display: 'flex',
                                             alignItems: 'center',
                                             justifyContent: 'center',
                                             flexShrink: 0
                                          }}
                                       >
                                          <DatabaseIcon style={{ width: '16px', height: '16px', color: 'rgba(255,255,255,0.6)' }} />
                                       </div>
                                       <div style={{ minWidth: 0 }}>
                                          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>{c.name}</p>
                                          <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-label)' }}>{c.provider}</p>
                                       </div>
                                    </div>

                                    <p style={{ margin: 0, fontSize: '11px', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase' }}>
                                       {c.type}
                                    </p>

                                    <span
                                       style={{
                                          ...statusStyle,
                                          padding: '3px 8px',
                                          borderRadius: '999px',
                                          fontSize: '10px',
                                          textTransform: 'uppercase',
                                          letterSpacing: '0.06em',
                                          whiteSpace: 'nowrap',
                                          flexShrink: 0
                                       }}
                                    >
                                       {String(c.status || 'unknown').toUpperCase()}
                                    </span>

                                    <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-label)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                       {c.lastSync}
                                    </p>
                                 </div>
                              );
                           })
                        )}
                     </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                     <div
                        style={{
                           borderRadius: '12px',
                           border: '1px solid var(--border-card)',
                           background: 'var(--bg-card)',
                           overflow: 'hidden'
                        }}
                     >
                        <div
                           style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '16px 20px',
                              borderBottom: '1px solid var(--border-card)'
                           }}
                        >
                           <ClockIcon style={{ width: '14px', height: '14px', color: 'rgba(255,255,255,0.3)' }} />
                           <span
                              style={{
                                 fontSize: '10px',
                                 textTransform: 'uppercase',
                                 letterSpacing: '0.1em',
                                 color: 'var(--text-muted)',
                                 fontWeight: 500
                              }}
                           >
                              CONFIGURATION HISTORY
                           </span>
                        </div>

                        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-card)' }}>
                           <p
                              style={{
                                 fontSize: '10px',
                                 textTransform: 'uppercase',
                                 letterSpacing: '0.08em',
                                 color: 'rgba(255,255,255,0.3)',
                                 margin: '0 0 10px 0',
                                 fontWeight: 500
                              }}
                           >
                              Current Version
                           </p>

                           <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                              <span
                                 style={{
                                    width: '20px',
                                    height: '20px',
                                    borderRadius: '6px',
                                    background: 'rgba(99,102,241,0.2)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '10px',
                                    color: '#818cf8',
                                    fontWeight: 700,
                                    flexShrink: 0
                                 }}
                              >
                                 v
                              </span>
                              <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                 {config?.versioning?.currentVersion || 'v2.4.0'}
                              </span>
                           </div>

                           <p
                              style={{
                                 fontSize: '11px',
                                 color: 'var(--text-label)',
                                 textTransform: 'uppercase',
                                 letterSpacing: '0.06em',
                                 margin: 0
                              }}
                           >
                              {(config?.versioning?.lastChange?.change || 'Major environment mapping update for Q2.').toUpperCase()}
                           </p>
                        </div>

                        <div style={{ padding: '12px 20px' }}>
                           <button
                              type="button"
                              style={{
                                 display: 'flex',
                                 alignItems: 'center',
                                 justifyContent: 'center',
                                 gap: '6px',
                                 width: '100%',
                                 padding: '8px 16px',
                                 borderRadius: '8px',
                                 border: '1px solid var(--border-card)',
                                 background: 'var(--bg-input)',
                                 color: 'rgba(255,255,255,0.6)',
                                 fontSize: '12px',
                                 fontWeight: 500,
                                 cursor: 'pointer'
                              }}
                           >
                              <RotateIcon style={{ width: '12px', height: '12px' }} />
                              ROLLBACK PLANE
                           </button>
                        </div>
                     </div>

                     <div
                        style={{
                           borderRadius: '12px',
                           border: '1px solid rgba(74,222,128,0.15)',
                           background: 'rgba(74,222,128,0.04)',
                           padding: '20px'
                        }}
                     >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                           <ShieldCheckIcon style={{ width: '14px', height: '14px', color: '#4ade80' }} />
                           <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Compliance Active</span>
                        </div>
                        <p
                           style={{
                              fontSize: '10px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.07em',
                              color: 'var(--text-label)',
                              margin: 0,
                              lineHeight: 1.7
                           }}
                        >
                           THIS ENVIRONMENT IS CURRENTLY GOVERNED BY{' '}
                           <span style={{ color: '#4ade80' }}>ISO-27001</span>
                           {' '}AND{' '}
                           <span style={{ color: '#4ade80' }}>SOC2</span>
                           {' '}SECURITY POLICIES.
                        </p>
                     </div>
                  </div>
               </div>
            )}

            {activeSection === 'rbac' && (
               <div style={{ borderRadius: '12px', overflow: 'hidden' }}>
                  <RBACControl
                     users={config?.rbac?.users || []}
                     roles={config?.rbac?.roles || []}
                     loading={loading}
                     onAddUser={() => handleActionRequest({ type: 'invite', title: 'Identity Invitation' })}
                  />
               </div>
            )}

            {activeSection === 'projects' && (
               <div
                  style={{
                     borderRadius: '12px',
                     border: '1px solid var(--border-card)',
                     background: 'var(--bg-card)',
                     padding: '24px',
                     display: 'grid',
                     gap: '16px'
                  }}
               >
                  <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Project Metadata</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                     <div>
                        <p
                           style={{
                              margin: '0 0 8px 0',
                              fontSize: '10px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.08em',
                              color: 'rgba(255,255,255,0.3)'
                           }}
                        >
                           ENVIRONMENT TYPE
                        </p>
                        <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>Enterprise Production</p>
                     </div>
                     <div>
                        <p
                           style={{
                              margin: '0 0 8px 0',
                              fontSize: '10px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.08em',
                              color: 'rgba(255,255,255,0.3)'
                           }}
                        >
                           DATA RESIDENCY
                        </p>
                        <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>{config?.project?.region}</p>
                     </div>
                  </div>
                  <div>
                     <p
                        style={{
                           margin: '0 0 8px 0',
                           fontSize: '10px',
                           textTransform: 'uppercase',
                           letterSpacing: '0.08em',
                           color: 'rgba(255,255,255,0.3)'
                        }}
                     >
                        ENVIRONMENTAL GUARDRAILS
                     </p>
                     <div style={{ display: 'grid', gap: '8px' }}>
                        {(config?.project?.environments || []).map((env: string) => (
                           <div
                              key={env}
                              style={{
                                 display: 'flex',
                                 alignItems: 'center',
                                 justifyContent: 'space-between',
                                 padding: '10px 12px',
                                 borderRadius: '8px',
                                 border: '1px solid var(--border-card)',
                                 background: 'var(--bg-input)'
                              }}
                           >
                              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-primary)', textTransform: 'capitalize' }}>{env}</p>
                              <span
                                 style={{
                                    padding: '3px 8px',
                                    borderRadius: '999px',
                                    fontSize: '10px',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.06em',
                                    whiteSpace: 'nowrap',
                                    flexShrink: 0,
                                    background: env === 'production' ? '#0f2a1a' : 'var(--bg-input)',
                                    color: env === 'production' ? '#4ade80' : 'var(--text-secondary)',
                                    border:
                                       env === 'production'
                                          ? '1px solid rgba(74,222,128,0.2)'
                                          : '1px solid var(--border-input)'
                                 }}
                              >
                                 ISOLATED
                              </span>
                           </div>
                        ))}
                     </div>
                  </div>
               </div>
            )}

            {['api', 'alerts', 'preferences'].includes(activeSection) && (
               <div
                  style={{
                     borderRadius: '12px',
                     border: '1px dashed var(--border-input)',
                     background: 'var(--bg-card)',
                     padding: '48px 24px',
                     display: 'flex',
                     flexDirection: 'column',
                     alignItems: 'center',
                     textAlign: 'center'
                  }}
               >
                  <div
                     style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '999px',
                        background: 'var(--bg-input)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '14px'
                     }}
                  >
                     <Lock style={{ width: '24px', height: '24px', color: 'rgba(255,255,255,0.55)' }} />
                  </div>
                  <p style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>Module under Governance</p>
                  <p
                     style={{
                        margin: '10px 0 0 0',
                        maxWidth: '520px',
                        fontSize: '13px',
                        lineHeight: 1.6,
                        color: 'var(--text-muted)'
                     }}
                  >
                     This configuration section is currently locked following the{' '}
                     {config?.versioning?.currentVersion || 'latest'} security hardening policy. Contact your Security Lead for
                     override access.
                  </p>
                  <button
                     type="button"
                     style={{
                        marginTop: '16px',
                        border: 'none',
                        background: 'transparent',
                        color: '#818cf8',
                        fontWeight: 600,
                        fontSize: '12px',
                        letterSpacing: '0.02em',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer'
                     }}
                  >
                     Request Temporary Escalation
                     <ArrowRightIcon style={{ width: '14px', height: '14px' }} />
                  </button>
               </div>
            )}
         </div>

         {/* Governance Action Safety Drawer */}
         <DiagnosticDrawer
            isOpen={isDrawerOpen}
            onClose={() => setIsDrawerOpen(false)}
            title={pendingAction?.title || 'Governance Confirmation'}
            subtitle={`Action Request: ${pendingAction?.type.toUpperCase()} • System Scope: ${projectId}`}
            width="600px"
         >
            {pendingAction && (
                     <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        <div
                           style={{
                              padding: '24px',
                              background: 'rgba(245,158,11,0.08)',
                              border: '1px solid rgba(245,158,11,0.25)',
                              borderRadius: '16px',
                              display: 'flex',
                              gap: '16px'
                           }}
                        >
                           <div
                              style={{
                                 flexShrink: 0,
                                 width: '44px',
                                 height: '44px',
                                 borderRadius: '12px',
                                 background: 'rgba(245,158,11,0.14)',
                                 display: 'flex',
                                 alignItems: 'center',
                                 justifyContent: 'center'
                              }}
                           >
                              <AlertCircle style={{ width: '20px', height: '20px', color: '#f59e0b' }} />
                           </div>
                           <div>
                              <p style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#fbbf24' }}>Privileged Action Required</p>
                              <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>
                                 You are about to perform a configuration update that affects the stability and visibility of the {projectId} environment.
                              </p>
                           </div>
                        </div>

                        <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                           <p
                              style={{
                                 margin: 0,
                                 fontSize: '11px',
                                 textTransform: 'uppercase',
                                 letterSpacing: '0.08em',
                                 color: 'var(--text-muted)',
                                 fontWeight: 600
                              }}
                           >
                              Review Change Scope
                           </p>
                           <div
                              style={{
                                 padding: '16px',
                                 background: 'var(--bg-input)',
                                 border: '1px solid var(--border-card)',
                                 borderRadius: '12px',
                                 display: 'flex',
                                 flexDirection: 'column',
                                 gap: '12px'
                              }}
                           >
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                 <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.65)' }}>Actor</p>
                                 <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>System Admin</p>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                 <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.65)' }}>Region Impact</p>
                                 <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>Global (Multi-Environment)</p>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                 <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.65)' }}>Audit Persistence</p>
                                 <p style={{ margin: 0, fontSize: '13px', color: '#4ade80', fontWeight: 600 }}>Immutable Log (365d)</p>
                              </div>
                           </div>
                        </section>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                           <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Info style={{ width: '14px', height: '14px', color: 'var(--text-muted)' }} />
                              <p style={{ margin: 0, fontSize: '11px', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>
                                 Confirmation will create a new configuration version.
                              </p>
                           </div>
                           <div style={{ display: 'flex', gap: '12px' }}>
                              <button
                                 type="button"
                                 style={{
                                    flex: 1,
                                    padding: '12px 16px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: '#3b82f6',
                                    color: 'var(--text-primary)',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    cursor: 'pointer'
                                 }}
                              >
                                 <CheckCircle2 style={{ width: '16px', height: '16px' }} />
                                 Confirm Governance Action
                              </button>
                              <button
                                 type="button"
                                 onClick={() => setIsDrawerOpen(false)}
                                 style={{
                                    flex: 1,
                                    padding: '12px 16px',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(255,255,255,0.15)',
                                    background: 'transparent',
                                    color: 'var(--text-secondary)',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                 }}
                              >
                                 Cancel
                              </button>
                           </div>
                        </div>
              </div>
            )}
         </DiagnosticDrawer>
    </RoleGuard>
  );
}

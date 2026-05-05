<<<<<<< HEAD

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
            background: '#9bd9b1',
            color: '#000000',
            border: '1px solid rgba(74,222,128,0.2)'
         };
      }

      if (normalized === 'degraded') {
         return {
            background: 'rgba(255, 191, 81, 0.73)',
            color: '#080500',
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
                              background: '#2563EB',
                              color: '#fff',
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
                                 background: '#9ed3b1',
                                 color: '#000000',
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
                                 background: 'rgba(172, 174, 244, 0.77)',
                                 color: '#000108',
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
=======
'use client';
import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '../../../../context/AuthContext';
import { RoleGuard } from '../../../../components/auth/RoleGuard';
import { IntegrationCatalog } from '../../../../components/ui/IntegrationCatalog';
import { AccessControlTab } from '../../../../components/ui/AccessControlTab';
import { 
  Settings, 
  Shield, 
  Key, 
  RefreshCcw, 
  Trash2,
  Sliders,
  Database,
  Info
} from 'lucide-react';

export default function SettingsPage() {
    const params = useParams();
    const projectId = params.projectId as string;
    const { apiFetch } = useAuth();
    const [activeTab, setActiveTab] = useState<'general' | 'integrations' | 'access'>('general');

    return (
        <RoleGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
            <div className="animate-fade-in" style={{ paddingBottom: '80px' }}>
                <header style={{ marginBottom: '32px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <div style={{ padding: '8px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                            <Shield size={20} color="var(--accent-blue)" />
                        </div>
                        <h2 style={{ fontSize: '24px', fontWeight: '900', color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>Project Governance & Configuration</h2>
                    </div>
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Master control center for security policies, third-party connectors, and system-wide SLAs for {projectId}.</p>
                </header>

                <div style={{ display: 'flex', gap: '32px', marginBottom: '40px', borderBottom: '1px solid var(--border)' }}>
                    {[
                        { id: 'general', label: 'General & Thresholds', icon: <Sliders size={16} /> },
                        { id: 'integrations', label: 'Connections & Integrations', icon: <Database size={16} /> },
                        { id: 'access', label: 'Access Control', icon: <Key size={16} /> }
                    ].map(tab => (
                        <button 
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px', padding: '16px 4px',
                                background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: '700',
                                color: activeTab === tab.id ? 'var(--accent-blue)' : 'var(--text-secondary)',
                                borderBottom: activeTab === tab.id ? '2px solid var(--accent-blue)' : '2px solid transparent',
                                transition: 'all 0.2s',
                                position: 'relative',
                                top: '1px'
                            }}>
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>

                <div style={{ minHeight: '600px' }}>
                    {activeTab === 'general' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                             <div style={sectionStyle}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                                    <Settings size={20} color="var(--accent-blue)" />
                                    <h3 style={{ fontSize: '18px', fontWeight: '800' }}>Baseline Monitoring Thresholds</h3>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    {[
                                        { label: 'Project-Level Rate Limit Ceiling (RPM)', value: 5000, color: 'var(--accent-blue)' },
                                        { label: 'LCP Critical Threshold (ms)', value: 4000, color: 'var(--accent-red)' },
                                        { label: 'Sync Timeout SLA (secs)', value: 300, color: 'var(--accent-orange)' }
                                    ].map(item => (
                                        <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid var(--border-light)' }}>
                                            <div>
                                                <div style={{ fontSize: '14px', fontWeight: '700' }}>{item.label}</div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Baseline policy enforced across all unprivileged keys</div>
                                            </div>
                                            <input type="number" defaultValue={item.value} style={miniInputStyle} />
                                        </div>
                                    ))}
                                </div>
                                
                                <div style={infoBanner}>
                                    <Info size={16} />
                                    <span>Global ceilings act as a secondary hard-block for standard keys, while VIP-tagged tokens may bypass these thresholds.</span>
                                </div>

                                <button style={primaryBtnStyle}>Commit Calibration</button>
                            </div>

                            <div style={dangerSectionStyle}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                    <Trash2 size={20} color="var(--accent-red)" />
                                    <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--accent-red)' }}>Security Deprecation</h3>
                                </div>
                                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '32px' }}>Permanent actions that impact project scope, data retention, or connector legacy mapping.</p>
                                <button style={dangerBtnStyle}>Archive Managed Scope</button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'integrations' && (
                        <div>
                            <IntegrationCatalog projectId={projectId} apiFetch={apiFetch} />
                        </div>
                    )}

                    {activeTab === 'access' && (
                        <div>
                            <AccessControlTab projectId={projectId} apiFetch={apiFetch} />
                        </div>
                    )}
                </div>
            </div>
        </RoleGuard>
    );
}

const sectionStyle: React.CSSProperties = {
    background: 'white', border: '1px solid var(--border)', borderRadius: '24px', padding: '32px', boxShadow: 'var(--shadow-sm)'
};

const infoBanner: React.CSSProperties = {
    marginTop: '24px', padding: '16px', background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: '12px',
    display: 'flex', gap: '12px', alignItems: 'center', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4'
};

const dangerSectionStyle: React.CSSProperties = {
    background: 'rgba(239, 68, 68, 0.03)', border: '1px solid rgba(239, 68, 68, 0.1)', borderRadius: '24px', padding: '32px', marginTop: '32px'
};

const miniInputStyle: React.CSSProperties = {
    padding: '10px 16px', background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: '10px',
    color: 'var(--text-primary)', width: '120px', textAlign: 'right', fontWeight: '800'
};

const primaryBtnStyle: React.CSSProperties = {
    marginTop: '32px', padding: '12px 32px', background: 'var(--accent-blue)', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '800', cursor: 'pointer', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
};

const dangerBtnStyle: React.CSSProperties = {
    padding: '12px 32px', background: 'transparent', border: '1px solid var(--accent-red)', color: 'var(--accent-red)', borderRadius: '12px', fontWeight: '800', cursor: 'pointer'
};
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb

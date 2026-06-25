
'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
   Settings as SettingsIcon,
   Database as DatabaseIcon,
   Users as UsersIcon,
   Layers as LayersIcon,
   Plug as PlugIcon,
   Shield as ShieldIcon,
  AlertCircle,
  CheckCircle2,
   ArrowRight as ArrowRightIcon,
  Info,
   Plus as PlusIcon,
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

const labelStyle: React.CSSProperties = {
   fontSize: '10px',
   textTransform: 'uppercase',
   letterSpacing: '0.08em',
   color: 'var(--text-label)',
   margin: 0,
   fontWeight: 500
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

   const normalizeConnectorRecords = (records: any[]) => {
      return records.map((record) => ({
         ...record,
         name: record?.name || record?.label || record?.providerId || 'Unknown Connector',
         provider: record?.provider || record?.providerId || 'Unknown Provider',
         type: record?.type || record?.family || record?.category || record?.providerId || 'unknown',
         status: record?.status || record?.healthStatus || 'unknown',
         lastSync:
            record?.lastSync ||
            record?.lastSyncAt ||
            record?.lastSuccessfulSync ||
            record?.lastAttemptAt ||
            record?.lastAttemptedSync ||
            'Never',
      }));
   };

  const loadData = useCallback(async () => {
    if (!token || !projectId) return;
    setLoading(true);
    try {
      const [govConfig, connData] = await Promise.all([
        apiFetch(`/api/v1/dashboard/governance?siteId=${projectId}`),
            apiFetch(`/api/v1/tenants/current/projects/${projectId}/integrations`)
      ]);
      setConfig(govConfig);
         const connectorsData = Array.isArray(connData)
            ? connData
            : Array.isArray(connData?.data)
               ? connData.data
               : [];
         setConnectors(normalizeConnectorRecords(connectorsData));
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

  const projectName = config?.project?.name || projectId;
  const projectEnvironments: string[] = Array.isArray(config?.project?.environments)
     ? config.project.environments
     : [];
  const primaryEnvironment = projectEnvironments[0] || 'production';

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
         subtitle: 'ENVIRONMENT, RESIDENCY AND RETENTION.',
         Icon: LayersIcon
      }
   ];

   const renderConnectorStatus = (status: string) => {
      const normalized = String(status || '').toLowerCase();
      if (normalized === 'active' || normalized === 'healthy') {
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
   <RoleGuard allowedRoles={['SUPER_ADMIN', 'PROJECT_ADMIN']}>
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
                     Manage <strong style={{ color: 'var(--text-secondary)' }}>{projectName}</strong>: integrations, identity policies, and project environments.
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

                        <p style={labelStyle}>{subtitle}</p>
                     </div>
                  ))}
               </div>
            </div>

            {activeSection === 'integrations' && (
               <div style={{ overflow: 'visible' }}>
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
                              SYSTEM CONNECTORS &amp; AUTH
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
                                 No connectors found
                              </p>
                              <p style={{ fontSize: '12px', color: 'var(--text-label)', margin: 0 }}>
                                 Connect a store from the Integrations page to see it here.
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
                                             background: 'var(--bg-input)',
                                             display: 'flex',
                                             alignItems: 'center',
                                             justifyContent: 'center',
                                             flexShrink: 0
                                          }}
                                       >
                                          <DatabaseIcon style={{ width: '16px', height: '16px', color: 'var(--text-secondary)' }} />
                                       </div>
                                       <div style={{ minWidth: 0 }}>
                                          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>{c.name}</p>
                                          <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-label)' }}>{c.provider}</p>
                                       </div>
                                    </div>

                                    <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
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
                        <p style={{ ...labelStyle, marginBottom: '8px' }}>PROJECT NAME</p>
                        <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>{projectName}</p>
                     </div>
                     <div>
                        <p style={{ ...labelStyle, marginBottom: '8px' }}>ENVIRONMENT</p>
                        <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600, textTransform: 'capitalize' }}>
                           {primaryEnvironment}
                        </p>
                     </div>
                     <div>
                        <p style={{ ...labelStyle, marginBottom: '8px' }}>DATA RESIDENCY</p>
                        <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>
                           {config?.project?.region || '—'}
                        </p>
                     </div>
                     <div>
                        <p style={{ ...labelStyle, marginBottom: '8px' }}>DATA RETENTION</p>
                        <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>
                           {config?.project?.retentionDays ? `${config.project.retentionDays} days` : '—'}
                        </p>
                     </div>
                  </div>
                  <div>
                     <p style={{ ...labelStyle, marginBottom: '8px' }}>ENVIRONMENTAL GUARDRAILS</p>
                     <div style={{ display: 'grid', gap: '8px' }}>
                        {projectEnvironments.length === 0 ? (
                           <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-label)' }}>No environments configured.</p>
                        ) : (
                           projectEnvironments.map((env: string) => (
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
                           ))
                        )}
                     </div>
                  </div>
               </div>
            )}
         </div>

         {/* Governance Action Safety Drawer */}
         <DiagnosticDrawer
            isOpen={isDrawerOpen}
            onClose={() => setIsDrawerOpen(false)}
            title={pendingAction?.title || 'Governance Confirmation'}
            subtitle={`Action Request: ${pendingAction?.type?.toUpperCase?.() || ''} • System Scope: ${projectName}`}
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
                              <p style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#d97706' }}>Privileged Action Required</p>
                              <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                 You are about to perform a configuration update that affects the stability and visibility of the {projectName} environment.
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
                                 <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>Project</p>
                                 <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>{projectName}</p>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                 <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>Environment</p>
                                 <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600, textTransform: 'capitalize' }}>{primaryEnvironment}</p>
                              </div>
                           </div>
                        </section>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                           <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Info style={{ width: '14px', height: '14px', color: 'var(--text-muted)' }} />
                              <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>
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
                                    color: '#fff',
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
                                    border: '1px solid var(--border-input)',
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

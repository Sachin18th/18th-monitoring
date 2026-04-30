
'use client';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { useParams } from 'next/navigation';
import { 
  FilterBar, 
  InformationState,
  DiagnosticDrawer,
  OperationalTable,
  Column
} from '@kpi-platform/ui';
import { 
    AlertCircle, 
    ArrowRightLeft, 
    Activity, 
    RefreshCw,
    MoreHorizontal,
    Plus,
    Plug,
    ShoppingBag,
    Store as StoreIcon
} from 'lucide-react';
import { useConnectorPlatform } from '../../../../context/ConnectorPlatformContext';

// Integration specific components
import { IntegrationSummary } from '../../../../components/integrations/IntegrationSummary';
import { ConnectorCard, ConnectorHealth } from '../../../../components/integrations/ConnectorCard';
import { DiagnosticDrawerContent } from '../../../../components/integrations/DiagnosticDrawerContent';
import { SyncTrendChart } from '../../../../components/ui/SyncTrendChart';

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

const panelStyle: React.CSSProperties = {
    borderRadius: '12px',
    border: '1px solid var(--border-card)',
    background: 'var(--bg-card)',
    padding: '24px',
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
};

const secondaryActionButtonStyle: React.CSSProperties = {
    ...actionButtonStyle,
};

const primaryActionButtonStyle: React.CSSProperties = {
    ...actionButtonStyle,
    border: 'none',
    background: '#2563EB',
    color: '#fff',
};

const errorBannerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    borderRadius: '8px',
    border: '1px solid rgba(244,63,94,0.2)',
    background: 'rgba(244,63,94,0.1)',
    padding: '12px 16px',
    color: '#fb7185',
};

export default function IntegrationsPage() {
    const params = useParams();
    const projectId = params.projectId as string;
    const { token, apiFetch } = useAuth();
    
    // State
    const [loading, setLoading] = useState(true);
    const [connectors, setConnectors] = useState<any[]>([]);
    const [summary, setSummary] = useState<any>({
        total: 0, healthy: 0, degraded: 0, critical: 0, stale: 0, successRate: 0, avgLatency: 0
    });
    const [trends, setTrends] = useState<any[]>([]);
    const [failedSyncs, setFailedSyncs] = useState<any[]>([]);
    
    // UI State
    const [selectedConnector, setSelectedConnector] = useState<any>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const { connectedStores, connectorCatalog, openConnectorSetupModal } = useConnectorPlatform();

    const loadData = useCallback(async () => {
        if (!token || !projectId) return;
        setLoading(true);
        try {
            // Fetch from the new productized endpoint
            const response = await apiFetch(`/api/v1/tenants/current/projects/${projectId}/integrations`);
            const integrations = response?.data || [];
            
            const [summ, trend, failed] = await Promise.all([
                apiFetch(`/api/v1/dashboard/integrations/summary?siteId=${projectId}`),
                apiFetch(`/api/v1/dashboard/integrations/trends?siteId=${projectId}`),
                apiFetch(`/api/v1/dashboard/integrations/failed?siteId=${projectId}`)
            ]);
            
            const mappedConnectors = integrations.map((s: any) => ({
                id: s.id,
                name: s.label,
                provider: s.providerId || 'External Service',
                type: s.family || s.category || 'REST API',
                status: (s.healthStatus?.toLowerCase() === 'healthy' ? 'healthy' : s.healthStatus?.toLowerCase() || 'degraded') as ConnectorHealth,
                healthScore: s.healthScore || 100,
                lastSync: s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleTimeString() : 'Never synced',
                lastWebhook: s.lastWebhookAt ? new Date(s.lastWebhookAt).toLocaleTimeString() : 'No activity',
                metrics: {
                    syncSuccess: s.healthScore || 100,
                    webhookLatency: s.avgLatency ? `${s.avgLatency}ms` : summ.avgOmsLatency ? `${summ.avgOmsLatency}ms` : 'N/A',
                    freshness: (s.healthScore > 90 ? 'fresh' : s.healthScore > 70 ? 'delayed' : 'stale') as any
                },
                dimensions: {
                    connectivity: s.status === 'ACTIVE',
                    auth: true,
                    sync: (s.healthScore || 100) > 50,
                    webhook: !!s.lastWebhookAt
                }
            }));

            setConnectors(mappedConnectors);
            setSummary({
                total: mappedConnectors.length,
                healthy: mappedConnectors.filter((c:any) => c.status === 'healthy').length,
                degraded: mappedConnectors.filter((c:any) => c.status === 'degraded').length,
                critical: mappedConnectors.filter((c:any) => c.status === 'critical').length,
                stale: mappedConnectors.filter((c:any) => c.status === 'stale').length,
                successRate: summ.successRate ?? 100,
                avgLatency: summ.avgOmsLatency || 420
            });
            setTrends(trend);
            setFailedSyncs(failed);
        } catch (err) {
            console.error('Failed to load integration metrics', err);
        } finally {
            setLoading(false);
        }
    }, [projectId, token, apiFetch]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleInspect = (connector: any) => {
        setSelectedConnector(connector);
        setIsDrawerOpen(true);
    };

    const handleAction = async (action: string) => {
        if (!selectedConnector) return;
        
        if (action === 'resync') {
            try {
                await apiFetch(`/api/v1/tenants/current/projects/${projectId}/integrations/${selectedConnector.id}/sync`, {
                    method: 'POST'
                });
                loadData();
            } catch (e) {
                console.error('Action failed', e);
            }
        }
    };

    const filteredConnectors = useMemo(() => {
        return connectors.filter(c => {
            const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                  c.provider.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesStatus = !filterStatus || c.status === filterStatus;
            return matchesSearch && matchesStatus;
        });
    }, [connectors, searchQuery, filterStatus]);

    const failedColumns: Column<any>[] = [
        { key: 'system', header: 'System', render: (val) => <span className="font-bold">{val}</span> },
        { 
            key: 'error', 
            header: 'Failure Reason', 
            render: (val) => <span className="text-error font-medium">{val}</span> 
        },
        { key: 'timestamp', header: 'Time', render: (val) => new Date(val).toLocaleString() },
        { 
            key: 'actions', 
            header: '', 
            align: 'right',
            render: () => (
                <button className="p-1 hover:bg-muted rounded">
                    <MoreHorizontal size={16} />
                </button>
            ) 
        }
    ];

    return (
        <>
            <div className="integrations-backend-theme" style={{ ...pageStyle, ...sectionSpacingStyle, minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ maxWidth: '42rem', minWidth: 0 }}>
                        <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px', fontSize: '20px', lineHeight: 1.25, fontWeight: 500, color: 'var(--text-primary)' }}>
                            <ArrowRightLeft style={{ width: '20px', height: '20px', color: '#818cf8', flexShrink: 0 }} />
                            Integrations Command Center
                        </h1>
                        <p style={{ marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.6, overflowWrap: 'anywhere' }}>
                            Deep operational visibility and control over all connector health and activity.
                        </p>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <button onClick={loadData} style={actionButtonStyle}>
                            <RefreshCw style={{ width: '14px', height: '14px', animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
                        </button>
                        <button style={secondaryActionButtonStyle}>Audit Log</button>
                        <button style={primaryActionButtonStyle}>Rule Config</button>
                        <button onClick={() => openConnectorSetupModal()} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '8px', background: '#2563EB', color: '#fff', border: 'none', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
                            <Plus style={{ width: '14px', height: '14px' }} />
                            Connect Store
                        </button>
                    </div>
                </div>

                {/* 1. Global Integration Health Header */}
                <IntegrationSummary stats={summary} loading={loading} />

                {/* 2. Critical Alerts & Anomalies / Insights */}
                {summary.critical > 0 && (
                    <div style={errorBannerStyle}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '999px', background: 'rgba(244,63,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f87171', flexShrink: 0 }}>
                            <AlertCircle style={{ width: '20px', height: '20px' }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: '14px', fontWeight: 700, color: '#fecdd3', margin: 0, marginBottom: '4px' }}>
                                Critical System Failure Detected
                            </p>
                            <p style={{ fontSize: '12px', color: '#fda4af', margin: 0 }}>
                                {summary.critical} connectors are currently offline or failing critical heartbeats.
                            </p>
                        </div>
                        <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap', background: '#450a0a', color: '#f87171', flexShrink: 0 }}>
                            Action Required
                        </span>
                    </div>
                )}

                {/* 3. Unified Filter Bar */}
                <div style={panelStyle}>
                    <FilterBar 
                        searchPlaceholder="Search system name or provider..."
                        searchValue={searchQuery}
                        onSearchChange={setSearchQuery}
                        filters={[
                            {
                                id: 'status',
                                label: 'Status',
                                value: filterStatus,
                                options: [
                                    { label: 'Healthy', value: 'healthy' },
                                    { label: 'Degraded', value: 'degraded' },
                                    { label: 'Critical', value: 'critical' },
                                    { label: 'Stale', value: 'stale' }
                                ]
                            }
                        ]}
                        onFilterChange={(_, val) => setFilterStatus(val)}
                        activeFilterCount={filterStatus ? 1 : 0}
                        onClearFilters={() => { setFilterStatus(''); setSearchQuery(''); }}
                    />
                </div>

                {/* 4. Connector Grid */}
                <section style={panelStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Activity style={{ width: '18px', height: '18px', color: 'rgba(255,255,255,0.45)' }} />
                            <p style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                Connector Reliability Matrix
                            </p>
                        </div>
                        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                            Showing {filteredConnectors.length} of {connectors.length} total
                        </span>
                    </div>

                    {loading ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '24px' }}>
                            {[1, 2, 3].map((i) => (
                                <div key={i} style={{ height: '256px', borderRadius: '12px', border: '1px solid var(--border-card)', background: 'var(--bg-card)', animation: 'pulse 1.4s ease-in-out infinite' }} />
                            ))}
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '24px' }}>
                            {filteredConnectors.map(connector => (
                                <ConnectorCard 
                                    key={connector.id}
                                    {...connector}
                                    onInspect={() => handleInspect(connector)}
                                />
                            ))}
                            {filteredConnectors.length === 0 && (
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 24px', gap: '12px' }}>
                                        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Plug style={{ width: '22px', height: '22px', color: 'var(--text-muted)' }} />
                                        </div>
                                        <p style={{ fontSize: '15px', fontWeight: 500 }}>No stores connected yet</p>
                                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', maxWidth: '300px' }}>Connect your first Shopify or Adobe Commerce store to begin monitoring.</p>
                                        <button onClick={() => openConnectorSetupModal()} style={{ padding: '8px 20px', borderRadius: '8px', background: '#2563EB', color: '#fff', border: 'none', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
                                            Connect your first store
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </section>

                {/* 5. Activity & Trends */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start', overflow: 'visible' }}>
                    {/* Sync Success Trend */}
                    <div style={panelStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                            <RefreshCw style={{ width: '18px', height: '18px', color: 'rgba(255,255,255,0.45)' }} />
                            <p style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                Synchronization Confidence
                            </p>
                        </div>
                        <SyncTrendChart data={trends} height={240} title="Synchronization Confidence" />
                    </div>

                    {/* Critical Failure Logs */}
                    <div style={{ ...panelStyle, padding: 0, overflow: 'hidden' }}>
                        <div style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <AlertCircle style={{ width: '18px', height: '18px', color: '#f87171' }} />
                                <p style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    Critical Failure Audit
                                </p>
                            </div>
                            <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap', background: '#f70e0e59', color: '#390d0d' }}>
                                {failedSyncs.length} Errors
                            </span>
                        </div>
                        <OperationalTable 
                            columns={failedColumns} 
                            data={failedSyncs} 
                            isDense
                            isEmpty={failedSyncs.length === 0}
                            emptyTitle="No critical failures"
                        />
                    </div>
                </div>
            </div>

            {/* Diagnostic Side Panel */}
            <DiagnosticDrawer
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                title={selectedConnector?.name || 'Connector Details'}
                subtitle={`${selectedConnector?.provider} • Last activity ${selectedConnector?.lastSync}`}
                width="520px"
            >
                <DiagnosticDrawerContent 
                    connector={selectedConnector}
                    syncHistory={[
                        { timestamp: new Date().toISOString(), type: 'Scheduled', status: 'success', records: 142 },
                        { timestamp: new Date(Date.now() - 3600000).toISOString(), type: 'Scheduled', status: 'success', records: 89 },
                        { timestamp: new Date(Date.now() - 7200000).toISOString(), type: 'Manual', status: 'error', records: 0 },
                    ]}
                    webhookActivity={[
                        { id: 'wh_91283', event: 'order.created', status: 'processed' },
                        { id: 'wh_91282', event: 'inventory.updated', status: 'processed' },
                        { id: 'wh_91281', event: 'order.cancelled', status: 'error' },
                    ]}
                    onAction={handleAction}
                />
            </DiagnosticDrawer>

            <style jsx global>{`
                .integrations-backend-theme [class*='bg-slate-'],
                .integrations-backend-theme [class*='bg-muted'] {
                    background-color: #111318 !important;
                }

                .integrations-backend-theme [class*='border-slate-'],
                .integrations-backend-theme [class*='border-subtle'] {
                    border-color: rgba(255, 255, 255, 0.08) !important;
                }

                .integrations-backend-theme [class*='text-slate-'],
                .integrations-backend-theme [class*='text-text-muted'] {
                    color: #94a3b8 !important;
                }

                .integrations-backend-theme [class*='text-indigo-'],
                .integrations-backend-theme [class*='bg-indigo-'] {
                    color: #a5b4fc !important;
                    background-color: rgba(79, 70, 229, 0.2) !important;
                }

                .integrations-backend-theme [class*='backdrop-blur'] {
                    backdrop-filter: none !important;
                }
            `}</style>
        </>
    );
}
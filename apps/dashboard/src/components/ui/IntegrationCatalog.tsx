'use client';
import React, { useState, useEffect } from 'react';
import { 
    Cloud, 
    Settings, 
    CheckCircle2, 
    AlertCircle, 
    ShieldCheck, 
    Database,
    Plus,
    Trash2,
    Layers,
    ArrowRight,
    Package,
    Users,
    Truck,
    CreditCard,
    LayoutDashboard,
    Activity,
    ClipboardList,
    Code,
    Share2,
    Monitor,
    Server,
    Globe
} from 'lucide-react';

export const IntegrationCatalog = ({ projectId, apiFetch }: { projectId: string, apiFetch: any }) => {
    const [categories, setCategories] = useState<any[]>([]);
    const [catalog, setCatalog] = useState<any[]>([]);
    const [instances, setInstances] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<string>('overview');

    const loadData = async () => {
        try {
            const catRes = await apiFetch(`/api/v1/config/p/${projectId}/integrations/categories`);
            setCategories(catRes || []);

            const [catData, instData] = await Promise.all([
                apiFetch(`/api/v1/config/p/${projectId}/integrations/catalog`),
                apiFetch(`/api/v1/config/p/${projectId}/integrations/instances`)
            ]);
            setCatalog(catData || []);
            setInstances(instData || []);
        } catch (e) {
            console.error('Failed to load integration hub data', e);
        }
    };

    useEffect(() => { loadData(); }, [projectId]);

    const getIconForNav = (iconStr: string) => {
        switch (iconStr) {
            case 'package': return <Package size={18} />;
            case 'layers': return <Layers size={18} />;
            case 'users': return <Users size={18} />;
            case 'truck': return <Truck size={18} />;
            case 'credit-card': return <CreditCard size={18} />;
            case 'share-2': return <Share2 size={18} />;
            case 'code': return <Code size={18} />;
            default: return <Database size={18} />;
        }
    };

    const renderContent = () => {
        if (activeTab === 'overview') {
            return <OverviewDashboard instances={instances} />;
        }
        if (activeTab === 'health') {
            return <ConnectionHealthDashboard instances={instances} />;
        }
        if (activeTab === 'audit') {
            return <IntegrationAuditLogs projectId={projectId} apiFetch={apiFetch} />;
        }
        
        // Dynamic Category View
        const catInfo = categories.find(c => c.id === activeTab);
        if (catInfo) {
            return (
                <CategoryProviderView 
                    projectId={projectId} 
                    apiFetch={apiFetch} 
                    category={catInfo} 
                    catalog={catalog.filter(c => c.category === activeTab)} 
                    instances={instances.filter(i => i.category === activeTab)}
                    reload={loadData}
                />
            );
        }

        return <div style={{ padding: '40px' }}>Select a category from the menu.</div>;
    };

    return (
        <div style={{ display: 'flex', minHeight: '80vh', border: '1px solid var(--border)', borderRadius: '24px', overflow: 'hidden', background: 'var(--bg-surface)' }}>
            {/* Left Navigation */}
            <div style={{ width: '280px', background: 'var(--bg-app)', borderRight: '1px solid var(--border)', padding: '24px 0', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '0 24px', marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '13px', fontWeight: '900', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Enterprise Hub
                    </h3>
                </div>

                <div style={navSectionStyle}>
                    <NavButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} icon={<LayoutDashboard size={18} />} label="Overview" />
                </div>

                <div style={{ padding: '0 24px', margin: '24px 0 12px' }}>
                    <h3 style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Connected Systems</h3>
                </div>
                <div style={navSectionStyle}>
                    {categories.map(cat => (
                        <NavButton 
                            key={cat.id} 
                            active={activeTab === cat.id} 
                            onClick={() => setActiveTab(cat.id)} 
                            icon={getIconForNav(cat.icon)} 
                            label={cat.label} 
                        />
                    ))}
                </div>

                <div style={{ padding: '0 24px', margin: '24px 0 12px' }}>
                    <h3 style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Governance & Ops</h3>
                </div>
                <div style={navSectionStyle}>
                    <NavButton active={activeTab === 'health'} onClick={() => setActiveTab('health')} icon={<Activity size={18} />} label="Connection Health" />
                    <NavButton active={activeTab === 'audit'} onClick={() => setActiveTab('audit')} icon={<ClipboardList size={18} />} label="Sync Audit Logs" />
                </div>
            </div>

            {/* Main Content Area */}
            <div style={{ flex: 1, padding: '32px', background: 'white', overflowY: 'auto' }}>
                {renderContent()}
            </div>
        </div>
    );
};

// --------------------------------------------------------------------------------
// Shared UI Components
// --------------------------------------------------------------------------------

const NavButton = ({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: any, label: string }) => (
    <button onClick={onClick} style={{
        display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px 24px', background: active ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
        border: 'none', borderRight: active ? '3px solid var(--accent-blue)' : '3px solid transparent',
        color: active ? 'var(--accent-blue)' : 'var(--text-secondary)', fontWeight: '800', fontSize: '14px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.1s'
    }}>
        {icon} {label}
    </button>
);

const OverviewDashboard = ({ instances }: { instances: any[] }) => {
    const activeCount = instances.filter(i => i.enabled).length;
    const errorCount = instances.filter(i => i.health < 80).length;

    return (
        <div className="animate-fade-in">
            <header style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '24px', fontWeight: '900', marginBottom: '8px' }}>Integration Console</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>High-level overview of all ecosystem connections and active data pipelines.</p>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '40px' }}>
                <div style={statCardStyle}>
                    <div style={statLabel}>Total Connected Systems</div>
                    <div style={{ fontSize: '32px', fontWeight: '900' }}>{instances.length}</div>
                </div>
                <div style={statCardStyle}>
                    <div style={statLabel}>Active Pipelines</div>
                    <div style={{ fontSize: '32px', fontWeight: '900', color: 'var(--accent-green)' }}>{activeCount}</div>
                </div>
                <div style={{ ...statCardStyle, background: errorCount > 0 ? 'rgba(239, 68, 68, 0.05)' : 'white' }}>
                    <div style={statLabel}>SLA Breaches / Degraded</div>
                    <div style={{ fontSize: '32px', fontWeight: '900', color: errorCount > 0 ? 'var(--accent-red)' : 'var(--text-primary)' }}>{errorCount}</div>
                </div>
            </div>

            <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '16px' }}>System Distribution</h3>
            <div style={{ padding: '24px', border: '1px solid var(--border)', borderRadius: '16px', display: 'flex', gap: '32px' }}>
                {['oms', 'erp', 'crm', 'logistics', 'payments'].map(cat => {
                    const count = instances.filter(i => i.category === cat || (cat === 'oms' && (i.category === 'Commerce' || i.category === 'Retail'))).length;
                    return (
                        <div key={cat} style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                            <div style={{ padding: '16px', background: 'var(--bg-app)', borderRadius: '50%' }}>
                                <Server size={20} color="var(--text-muted)" />
                            </div>
                            <div style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase' }}>{cat}</div>
                            <div style={{ fontSize: '16px', fontWeight: '900' }}>{count}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// --------------------------------------------------------------------------------
// Category Specific Workspace
// --------------------------------------------------------------------------------

const CategoryProviderView = ({ projectId, apiFetch, category, catalog, instances, reload }: any) => {
    const [selectedProviderId, setSelectedProviderId] = useState<string>('');
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [editConfig, setEditConfig] = useState<any>(null);
    const [env, setEnv] = useState<'prod' | 'staging'>('prod');
    const [testing, setTesting] = useState(false);

    const handleConnectClick = () => {
        if (!selectedProviderId) return alert('Select a provider first');
        const provider = catalog.find((c: any) => c.id === selectedProviderId);
        
        // Initialize an empty layout for the drawer
        setEditConfig({
            id: 'NEW',
            connectorId: provider.id,
            label: `${provider.label} Integration`,
            enabled: false,
            config: { prod: {}, staging: {} },
            syncSettings: { frequency: '1h', timeout: 30 }
        });
        setIsDrawerOpen(true);
    };

    const handleEditInstance = (inst: any) => {
        setEditConfig({
            ...inst,
            config: { prod: inst.config.prod || {}, staging: inst.config.staging || {} },
            syncSettings: inst.syncSettings || { frequency: '1h', timeout: 30 }
        });
        setIsDrawerOpen(true);
    };

    const handleSave = async () => {
        try {
            if (editConfig.id === 'NEW') {
                await apiFetch(`/api/v1/config/p/${projectId}/integrations/instances`, {
                    method: 'POST',
                    body: JSON.stringify({
                        connectorId: editConfig.connectorId,
                        label: editConfig.label,
                        category: category.id,
                        config: editConfig.config,
                        syncSettings: editConfig.syncSettings,
                        enabled: editConfig.enabled
                    })
                });
            } else {
                await apiFetch(`/api/v1/config/p/${projectId}/integrations/instances/${editConfig.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify(editConfig)
                });
            }
            setIsDrawerOpen(false);
            reload();
        } catch (e) {
            alert('Failed to save configuration');
        }
    };

    const handleTest = async () => {
        if (editConfig.id === 'NEW') return alert('Please save the connection before probing.');
        setTesting(true);
        try {
            await apiFetch(`/api/v1/config/p/${projectId}/integrations/instances/${editConfig.id}/test`, {
                method: 'POST',
                body: JSON.stringify({ env })
            });
            alert('Probe executed! Check Health logs.');
        } catch (e) {
            alert('Probe execution failed.');
        } finally {
            setTesting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Permanent system disconnect. This halts all data pipelines related to this provider. Continue?')) return;
        try {
            await apiFetch(`/api/v1/config/p/${projectId}/integrations/instances/${id}`, { method: 'DELETE' });
            reload();
        } catch (e) {
            alert('Disconnect failed');
        }
    };

    return (
        <div className="animate-fade-in">
            <header style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '24px', fontWeight: '900', marginBottom: '8px' }}>{category.label} Master Settings</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>{category.description}</p>
            </header>

            {/* Top Provider Picker */}
            <div style={{ display: 'flex', gap: '16px', background: 'var(--bg-app)', padding: '24px', borderRadius: '16px', marginBottom: '40px', alignItems: 'flex-end', border: '1px solid var(--border)' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Select Provider Platform</label>
                    <select 
                        style={{ padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}
                        value={selectedProviderId}
                        onChange={(e) => setSelectedProviderId(e.target.value)}
                    >
                        <option value="" disabled>--- Select a Provider ---</option>
                        {catalog.map((c: any) => (
                            <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                    </select>
                </div>
                <button onClick={handleConnectClick} style={{ padding: '12px 24px', background: 'var(--accent-blue)', color: 'white', fontWeight: '800', borderRadius: '10px', border: 'none', cursor: 'pointer' }}>
                    Establish Connection
                </button>
            </div>

            <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '16px' }}>Active Configured Systems</h3>
            
            {/* Enterprise Data Table */}
            <div style={{ border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                    <thead>
                        <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border)' }}>
                            <th style={thStyle}>Provider Identity</th>
                            <th style={thStyle}>Environment</th>
                            <th style={thStyle}>Status</th>
                            <th style={thStyle}>Health</th>
                            <th style={thStyle}>Last Sync</th>
                            <th style={thStyle}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {instances.length === 0 ? (
                            <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No active {category.label} connections mapped to this project.</td></tr>
                        ) : (
                            instances.map((inst: any) => (
                                <tr key={inst.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={tdStyle}>
                                        <div style={{ fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Globe size={14} color="var(--accent-blue)" /> {inst.label}
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{inst.connectorId}</div>
                                    </td>
                                    <td style={tdStyle}>
                                        <span style={{ padding: '2px 8px', background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '11px', fontWeight: '700' }}>Hybrid</span>
                                    </td>
                                    <td style={tdStyle}>{inst.enabled ? <span style={{ color: 'var(--accent-green)', fontWeight: '800' }}>Active</span> : <span style={{ color: 'var(--text-muted)' }}>Paused</span>}</td>
                                    <td style={tdStyle}>
                                        {inst.health > 90 ? <span style={{ color: 'var(--accent-green)', fontWeight: '800' }}>{inst.health}% Optimal</span> : <span style={{ color: 'var(--accent-orange)', fontWeight: '800' }}>{inst.health}% Degraded</span>}
                                    </td>
                                    <td style={tdStyle}>{inst.lastSyncAt ? new Date(inst.lastSyncAt).toLocaleTimeString() : 'Pending'}</td>
                                    <td style={tdStyle}>
                                        <div style={{ display: 'flex', gap: '12px' }}>
                                            <button onClick={() => handleEditInstance(inst)} style={linkBtn}>Configure</button>
                                            <button onClick={() => handleDelete(inst.id)} style={{ ...linkBtn, color: 'var(--accent-red)' }}>Disconnect</button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Right Sliding Drawer */}
            {isDrawerOpen && editConfig && (
                <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9999, display: 'flex', justifyContent: 'flex-end', backdropFilter: 'blur(2px)' }}>
                    <div className="animate-slide-in-right" style={{ width: '600px', background: 'white', height: '100%', boxShadow: '-4px 0 24px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column' }}>
                        
                        <header style={{ padding: '24px 32px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)' }}>
                            <h3 style={{ fontSize: '18px', fontWeight: '900' }}>{editConfig.id === 'NEW' ? 'New Integration' : 'Manage Connection'}</h3>
                            <button onClick={() => setIsDrawerOpen(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: 'var(--text-muted)' }}>&times;</button>
                        </header>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
                            <div style={{ display: 'flex', gap: '8px', padding: '4px', background: 'var(--bg-app)', borderRadius: '12px', marginBottom: '32px' }}>
                                {(['prod', 'staging'] as const).map(t => (
                                    <button key={t} onClick={() => setEnv(t)} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: env === t ? 'white' : 'transparent', color: env === t ? 'var(--accent-blue)' : 'var(--text-muted)', fontWeight: '800', fontSize: '12px', cursor: 'pointer', boxShadow: env === t ? '0 2px 8px rgba(0,0,0,0.05)' : 'none' }}>
                                        {t === 'prod' ? 'Production Tier' : 'Sandbox Tier'}
                                    </button>
                                ))}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                <div>
                                    <label style={labelStyle}>Instance Assignment Name</label>
                                    <input style={inputStyle} value={editConfig.label} onChange={e => setEditConfig({...editConfig, label: e.target.value})} />
                                </div>
                                
                                <div>
                                    <label style={labelStyle}>Target Website / Store Scope</label>
                                    <select style={inputStyle}>
                                        <option value="all">All Stores in Project</option>
                                        <option value="s1">US Main Storefront</option>
                                    </select>
                                </div>

                                <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0' }}></div>
                                <h4 style={{ fontSize: '14px', fontWeight: '800' }}>API Connectivity</h4>
                                
                                <div>
                                    <label style={labelStyle}>Endpoint URL ({env})</label>
                                    <input style={inputStyle} value={editConfig.config[env]?.endpoint || ''} onChange={e => setEditConfig({...editConfig, config: {...editConfig.config, [env]: {...editConfig.config[env], endpoint: e.target.value}}})} placeholder="https://api.system.com/..." />
                                </div>

                                <div style={{ display: 'flex', gap: '16px' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={labelStyle}>Client ID / Token Username</label>
                                        <input style={inputStyle} value={editConfig.config[env]?.clientId || ''} onChange={e => setEditConfig({...editConfig, config: {...editConfig.config, [env]: {...editConfig.config[env], clientId: e.target.value}}})} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={labelStyle}>Secret Credential</label>
                                        <input style={inputStyle} type="password" value={editConfig.config[env]?.apiKey || ''} onChange={e => setEditConfig({...editConfig, config: {...editConfig.config, [env]: {...editConfig.config[env], apiKey: e.target.value}}})} placeholder="••••••••" />
                                    </div>
                                </div>

                                <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0' }}></div>
                                <h4 style={{ fontSize: '14px', fontWeight: '800' }}>Orchestration Rules</h4>

                                <div style={{ display: 'flex', gap: '16px' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={labelStyle}>Sync Polling Interval</label>
                                        <select style={inputStyle} value={editConfig.syncSettings.frequency} onChange={e => setEditConfig({...editConfig, syncSettings: {...editConfig.syncSettings, frequency: e.target.value}})}>
                                            <option value="5m">Aggressive (5m)</option>
                                            <option value="15m">Standard (15m)</option>
                                            <option value="1h">Relaxed (1h)</option>
                                        </select>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={labelStyle}>Timeout SLA</label>
                                        <input style={inputStyle} type="number" value={editConfig.syncSettings.timeout || 30} onChange={e => setEditConfig({...editConfig, syncSettings: {...editConfig.syncSettings, timeout: parseInt(e.target.value)}})} />
                                    </div>
                                </div>

                                <div style={{ padding: '16px', background: 'var(--bg-app)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px', border: '1px solid var(--border)' }}>
                                    <input type="checkbox" checked={editConfig.enabled} onChange={e => setEditConfig({...editConfig, enabled: e.target.checked})} style={{ width: '18px', height: '18px' }} />
                                    <div>
                                        <div style={{ fontSize: '14px', fontWeight: '800' }}>Activate Connection in {env.toUpperCase()}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>If enabled, the monitoring engine will immediately begin data flow tasks.</div>
                                    </div>
                                </div>

                            </div>
                        </div>

                        <footer style={{ padding: '24px 32px', borderTop: '1px solid var(--border)', display: 'flex', gap: '16px', background: 'var(--bg-surface)' }}>
                            <button onClick={handleTest} style={{ padding: '12px 24px', background: 'white', border: '1px solid var(--border)', borderRadius: '10px', fontWeight: '800', cursor: 'pointer', flex: 0.5 }} disabled={testing}>
                                {testing ? 'Testing...' : 'Probe Target'}
                            </button>
                            <button onClick={handleSave} style={{ padding: '12px 24px', background: 'var(--accent-blue)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '800', cursor: 'pointer', flex: 1 }}>
                                Commit Map & Save
                            </button>
                        </footer>
                    </div>
                </div>
            )}
        </div>
    );
};

// --------------------------------------------------------------------------------
// Connection Health & Audit Sub-Views
// --------------------------------------------------------------------------------

const ConnectionHealthDashboard = ({ instances }: { instances: any[] }) => (
    <div className="animate-fade-in">
        <header style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '900', marginBottom: '8px' }}>Connection Health Registry</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Real-time telemetry for all established third-party data pipelines.</p>
        </header>

        <div style={{ border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                    <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border)' }}>
                        <th style={thStyle}>Integration Node</th>
                        <th style={thStyle}>Ping Status</th>
                        <th style={thStyle}>Error Rate</th>
                        <th style={thStyle}>Last Outage</th>
                    </tr>
                </thead>
                <tbody>
                    {instances.map(inst => (
                        <tr key={inst.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={tdStyle}>
                                <div style={{ fontWeight: '800' }}>{inst.label}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{inst.category}</div>
                            </td>
                            <td style={tdStyle}>
                                {inst.health > 80 ? (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-green)', fontWeight: '800' }}><Activity size={14} /> Responsive</span>
                                ) : (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-orange)', fontWeight: '800' }}><AlertCircle size={14} /> Degraded Ping</span>
                                )}
                            </td>
                            <td style={tdStyle}>{inst.errorCount || 0} recent</td>
                            <td style={tdStyle}>No recent outages</td>
                        </tr>
                    ))}
                    {instances.length === 0 && (<tr><td colSpan={4} style={{ padding: '24px', textAlign: 'center' }}>No telemetry available.</td></tr>)}
                </tbody>
            </table>
        </div>
    </div>
);

const IntegrationAuditLogs = ({ projectId, apiFetch }: { projectId: string, apiFetch: any }) => {
    return (
        <div className="animate-fade-in">
            <header style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '24px', fontWeight: '900', marginBottom: '8px' }}>Integration Audit Trail</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Immutable ledger tracking connection edits, key rotations, and SLA adjustments.</p>
            </header>
            
            <div style={{ padding: '40px', textAlign: 'center', background: 'var(--bg-app)', border: '1px dashed var(--border)', borderRadius: '16px' }}>
                <ClipboardList size={32} color="var(--text-muted)" style={{ marginBottom: '16px' }} />
                <h4 style={{ fontSize: '16px', fontWeight: '800' }}>Sync Audits Initializing</h4>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '400px', margin: '8px auto 0' }}>
                    Tracking has been enabled. Activity relating to Integration creation, edits, and connection status changes will populate here.
                </p>
            </div>
        </div>
    );
};

// --------------------------------------------------------------------------------
// Shared Styles
// --------------------------------------------------------------------------------

const navSectionStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column' };
const statCardStyle: React.CSSProperties = { padding: '24px', border: '1px solid var(--border)', borderRadius: '16px', background: 'white' };
const statLabel: React.CSSProperties = { fontSize: '12px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' };

const thStyle: React.CSSProperties = { padding: '16px 24px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.5px' };
const tdStyle: React.CSSProperties = { padding: '16px 24px', verticalAlign: 'middle' };
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: 'var(--accent-blue)', fontWeight: '800', cursor: 'pointer', fontSize: '13px', padding: 0 };
const labelStyle: React.CSSProperties = { fontSize: '11px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' };
const inputStyle: React.CSSProperties = { padding: '14px', background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '14px', fontWeight: '600', width: '100%', outline: 'none' };

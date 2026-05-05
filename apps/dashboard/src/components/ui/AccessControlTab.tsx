'use client';
import React, { useState, useEffect } from 'react';
import { 
    Key, 
    Shield, 
    Trash2, 
    RefreshCcw, 
    Plus, 
    FileText, 
    Globe, 
    Lock, 
    Zap, 
    CheckCircle2, 
    AlertCircle,
    Copy,
    Eye,
    EyeOff
} from 'lucide-react';

export const AccessControlTab = ({ projectId, apiFetch }: { projectId: string, apiFetch: any }) => {
    const [keys, setKeys] = useState<any[]>([]);
    const [auditLogs, setAuditLogs] = useState<any[]>([]);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [activeSecurityTab, setActiveSecurityTab] = useState<'inventory' | 'audit'>('inventory');

    // New Key Logic
    const [newKeyParams, setNewKeyParams] = useState({
        label: '',
        purpose: '',
        environment: 'production',
        isVip: false,
        scopes: ['ingestion'],
        allowedIps: '0.0.0.0/0',
        limit: 1000
    });
    const [generatedKey, setGeneratedKey] = useState<{ prefix: string, secret: string } | null>(null);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [keyData, logData] = await Promise.all([
                apiFetch(`/api/v1/config/p/${projectId}/access-control/keys`),
                apiFetch(`/api/v1/config/p/${projectId}/access-control/audit`)
            ]);
            setKeys(keyData || []);
            setAuditLogs(logData || []);
        } catch (e) {
            console.error('Failed to load governance data', e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { loadData(); }, [projectId]);

    const handleCreateKey = async () => {
        try {
            const res = await apiFetch(`/api/v1/config/p/${projectId}/access-control/keys`, {
                method: 'POST',
                body: JSON.stringify({
                    label: newKeyParams.label,
                    purpose: newKeyParams.purpose,
                    environment: newKeyParams.environment,
                    isVip: newKeyParams.isVip,
                    scopes: newKeyParams.scopes,
                    allowedIps: [newKeyParams.allowedIps],
                    rateLimit: { max: newKeyParams.limit, windowMs: 60000 }
                })
            });
            setGeneratedKey({ prefix: res.key.prefix, secret: res.rawSecret });
            loadData();
        } catch (e) {
            alert('Failed to generate key');
        }
    };

    const handleRevoke = async (keyId: string) => {
        if (!confirm('Are you sure you want to revoke this key? This action is irreversible.')) return;
        try {
            await apiFetch(`/api/v1/config/p/${projectId}/access-control/keys/${keyId}`, { method: 'DELETE' });
            loadData();
        } catch (e) {
            alert('Revocation failed');
        }
    };

    const handleRotate = async (keyId: string) => {
        if (!confirm('Rotating this key will invalidate the current secret. Continue?')) return;
        try {
            const res = await apiFetch(`/api/v1/config/p/${projectId}/access-control/keys/${keyId}/rotate`, { method: 'POST' });
            setGeneratedKey({ prefix: keys.find(k => k.id === keyId)?.prefix, secret: res.rawSecret });
            loadData();
        } catch (e) {
            alert('Rotation failed');
        }
    };

    if (isLoading) return <div style={{ padding: '40px', color: 'var(--text-secondary)' }}>Loading governance vault...</div>;

    return (
        <div className="animate-fade-in">
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                    <h3 style={{ fontSize: '18px', fontWeight: '800' }}>Project Access Governance</h3>
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Manage headless API keys and multi-environment ingestion tokens</p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button 
                        onClick={() => setActiveSecurityTab(activeSecurityTab === 'inventory' ? 'audit' : 'inventory')}
                        style={{ padding: '10px 18px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                        {activeSecurityTab === 'inventory' ? <FileText size={16} /> : <Shield size={16} />}
                        {activeSecurityTab === 'inventory' ? 'View Audit Trail' : 'Back to Inventory'}
                    </button>
                    {activeSecurityTab === 'inventory' && (
                        <button 
                            onClick={() => { setGeneratedKey(null); setIsCreateModalOpen(true); }}
                            style={{ padding: '10px 18px', background: 'var(--accent-blue)', color: 'white', border: 'none', borderRadius: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                            <Plus size={16} /> Create Service Key
                        </button>
                    )}
                </div>
            </header>

            {activeSecurityTab === 'inventory' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
                    {keys.length === 0 ? (
                        <div style={emptyStateStyle}>
                            <Lock size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
                            <p>No active service keys found for this project</p>
                        </div>
                    ) : (
                        keys.map(key => (
                            <div key={key.id} style={keyCardStyle}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                        <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: key.status === 'active' ? 'rgba(37, 99, 235, 0.05)' : 'var(--bg-app)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Key size={20} color={key.status === 'active' ? 'var(--accent-blue)' : 'var(--text-muted)'} />
                                        </div>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <h4 style={{ fontSize: '15px', fontWeight: '800' }}>{key.label}</h4>
                                                {key.isVip && <span style={vipBadgeStyle}>VIP</span>}
                                                <span style={envBadgeStyle(key.environment)}>{key.environment}</span>
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                                {key.prefix}••••••••••••• | Created {new Date(key.createdAt).toLocaleDateString()}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button onClick={() => handleRotate(key.id)} style={iconBtnStyle} title="Rotate Secret"><RefreshCcw size={14} /></button>
                                        <button onClick={() => handleRevoke(key.id)} style={iconBtnStyleRed} title="Revoke Key"><Trash2 size={14} /></button>
                                    </div>
                                </div>
                                
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', background: 'var(--bg-app)', padding: '12px', borderRadius: '8px' }}>
                                    <div>
                                        <div style={statLabelStyle}>Status</div>
                                        <div style={{ fontSize: '12px', fontWeight: '800', color: key.status === 'active' ? 'var(--accent-green)' : 'var(--accent-red)', textTransform: 'uppercase' }}>{key.status}</div>
                                    </div>
                                    <div>
                                        <div style={statLabelStyle}>IP Restricted</div>
                                        <div style={{ fontSize: '12px', fontWeight: '800' }}>{key.allowedIps?.[0] || 'Unrestricted'}</div>
                                    </div>
                                    <div>
                                        <div style={statLabelStyle}>Rate Limit</div>
                                        <div style={{ fontSize: '12px', fontWeight: '800' }}>{key.rateLimit?.max} RPM</div>
                                    </div>
                                    <div>
                                        <div style={statLabelStyle}>Last Used</div>
                                        <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)' }}>{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleTimeString() : 'Never'}</div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            ) : (
                /* Audit Trail Table */
                <div style={tableContainerStyle}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                                <th style={thStyle}>Event</th>
                                <th style={thStyle}>Message</th>
                                <th style={thStyle}>Timestamp</th>
                                <th style={thStyle}>Metadata</th>
                            </tr>
                        </thead>
                        <tbody>
                            {auditLogs.map(log => (
                                <tr key={log.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                    <td style={tdStyle}><span style={logTypeBadgeStyle(log.type)}>{log.type}</span></td>
                                    <td style={tdStyle}>{log.message}</td>
                                    <td style={tdStyle}>{new Date(log.timestamp).toLocaleString()}</td>
                                    <td style={tdStyle}><code style={{ fontSize: '10px', background: 'var(--bg-app)', padding: '2px 4px' }}>{JSON.stringify(log.metadata)}</code></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Create Key Modal */}
            {isCreateModalOpen && (
                <div style={modalOverlayStyle}>
                    <div style={modalContentStyle}>
                        {!generatedKey ? (
                            <>
                                <h3 style={{ fontSize: '20px', fontWeight: '900', marginBottom: '8px' }}>Generate Scoped Access Key</h3>
                                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '32px' }}>Define permissions and security constraints for the new service token.</p>
                                
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                                    <div style={fieldGroupStyle}>
                                        <label style={labelStyle}>Key Label</label>
                                        <input style={inputStyle} value={newKeyParams.label} onChange={e => setNewKeyParams({...newKeyParams, label: e.target.value})} placeholder="e.g. Jenkins Ingestion" />
                                    </div>
                                    <div style={fieldGroupStyle}>
                                        <label style={labelStyle}>Environment</label>
                                        <select style={inputStyle} value={newKeyParams.environment} onChange={e => setNewKeyParams({...newKeyParams, environment: e.target.value as any})}>
                                            <option value="production">Production</option>
                                            <option value="staging">Staging</option>
                                            <option value="sandbox">Sandbox</option>
                                        </select>
                                    </div>
                                </div>

                                <div style={fieldGroupStyle}>
                                    <label style={labelStyle}>Purpose</label>
                                    <input style={inputStyle} value={newKeyParams.purpose} onChange={e => setNewKeyParams({...newKeyParams, purpose: e.target.value})} placeholder="Describe use case for audit compliance" />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', marginTop: '20px', marginBottom: '32px' }}>
                                    <div style={fieldGroupStyle}>
                                        <label style={labelStyle}>IP Allowlist (CIDR)</label>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <input style={inputStyle} value={newKeyParams.allowedIps} onChange={e => setNewKeyParams({...newKeyParams, allowedIps: e.target.value})} placeholder="0.0.0.0/0" />
                                            <div style={infoBox}><Globe size={14} /></div>
                                        </div>
                                    </div>
                                    <div style={fieldGroupStyle}>
                                        <label style={labelStyle}>Rate Limit (RPM)</label>
                                        <input style={inputStyle} type="number" value={newKeyParams.limit} onChange={e => setNewKeyParams({...newKeyParams, limit: parseInt(e.target.value)})} />
                                    </div>
                                </div>

                                <div style={{ padding: '20px', background: 'rgba(37, 99, 235, 0.04)', border: '1px solid rgba(37, 99, 235, 0.1)', borderRadius: '16px', marginBottom: '32px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div>
                                            <div style={{ fontSize: '14px', fontWeight: '800' }}>Mark as VIP Key</div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Bypasses project-level fallback limits for business continuity</div>
                                        </div>
                                        <input type="checkbox" checked={newKeyParams.isVip} onChange={e => setNewKeyParams({...newKeyParams, isVip: e.target.checked})} style={{ width: '20px', height: '20px' }} />
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <button onClick={() => setIsCreateModalOpen(false)} style={cancelBtnStyle}>Cancel</button>
                                    <button onClick={handleCreateKey} style={saveBtnStyle}>Generate Identity</button>
                                </div>
                            </>
                        ) : (
                            <div style={{ textAlign: 'center' }}>
                                <div style={successIconStyle}><CheckCircle2 size={40} color="var(--accent-green)" /></div>
                                <h3 style={{ fontSize: '20px', fontWeight: '900', marginBottom: '8px' }}>Key Successfully Generated</h3>
                                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '32px' }}>Copy this secret now. It will <strong>never be shown again</strong> for security compliance.</p>
                                
                                <div style={oneTimeRevealerStyle}>
                                    <div style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-muted)', marginBottom: '12px' }}>COMPOSITE ACCESS KEY</div>
                                    <div style={keyRevealBox}>
                                        <code>{generatedKey.prefix}.{generatedKey.secret}</code>
                                        <button onClick={() => navigator.clipboard.writeText(`${generatedKey.prefix}.${generatedKey.secret}`)} style={copyBtnStyle}><Copy size={14} /> Copy</button>
                                    </div>
                                </div>

                                <div style={warningNotice}>
                                    <AlertCircle size={16} />
                                    <span>If you lose this secret, you must rotate the key to restore access.</span>
                                </div>

                                <button onClick={() => setIsCreateModalOpen(false)} style={doneBtnStyle}>I have saved the key</button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// Styles
const emptyStateStyle: React.CSSProperties = {
    padding: '80px 40px', textAlign: 'center', border: '2px dashed var(--border)', borderRadius: '24px', color: 'var(--text-muted)', fontSize: '14px'
};

const keyCardStyle: React.CSSProperties = {
    background: 'white', border: '1px solid var(--border)', borderRadius: '20px', padding: '24px', transition: 'all 0.2s', boxShadow: 'var(--shadow-sm)'
};

const vipBadgeStyle: React.CSSProperties = {
    padding: '2px 8px', background: 'var(--accent-purple)', color: 'white', borderRadius: '20px', fontSize: '9px', fontWeight: '900', letterSpacing: '0.5px'
};

const envBadgeStyle = (env: string): React.CSSProperties => ({
    padding: '2px 8px', 
    background: env === 'production' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.1)',
    color: env === 'production' ? 'var(--accent-green)' : 'var(--accent-blue)', 
    borderRadius: '20px', fontSize: '9px', fontWeight: '900', textTransform: 'uppercase'
});

const statLabelStyle: React.CSSProperties = {
    fontSize: '9px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px'
};

const iconBtnStyle: React.CSSProperties = {
    width: '32px', height: '32px', borderRadius: '8px', border: '1px solid var(--border)', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)'
};

const iconBtnStyleRed: React.CSSProperties = {
    ...iconBtnStyle, color: 'var(--accent-red)', borderColor: 'rgba(239, 68, 68, 0.2)'
};

const modalOverlayStyle: React.CSSProperties = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
};

const modalContentStyle: React.CSSProperties = {
    background: 'white', borderRadius: '32px', padding: '40px', width: '100%', maxWidth: '560px', boxShadow: 'var(--shadow-xl)'
};

const fieldGroupStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '8px' };
const labelStyle: React.CSSProperties = { fontSize: '12px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase' };
const inputStyle: React.CSSProperties = { padding: '12px 14px', background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '14px', fontWeight: '600' };

const saveBtnStyle: React.CSSProperties = { flex: 1, padding: '14px', background: 'var(--accent-blue)', color: 'white', border: 'none', borderRadius: '12px', fontWeight: '800', cursor: 'pointer' };
const cancelBtnStyle: React.CSSProperties = { flex: 0.5, padding: '14px', background: 'white', border: '1px solid var(--border)', borderRadius: '12px', fontWeight: '800', cursor: 'pointer' };

const successIconStyle: React.CSSProperties = { width: '80px', height: '80px', borderRadius: '30px', background: 'rgba(16, 185, 129, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' };
const oneTimeRevealerStyle: React.CSSProperties = { padding: '24px', background: 'var(--bg-app)', borderRadius: '20px', border: '1px solid var(--border)', marginBottom: '24px' };
const keyRevealBox: React.CSSProperties = { display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: '800', color: 'var(--accent-blue)' };
const copyBtnStyle: React.CSSProperties = { padding: '6px 12px', background: 'white', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' };
const warningNotice: React.CSSProperties = { padding: '14px', background: 'rgba(239,68,68,0.05)', borderRadius: '12px', color: 'var(--accent-red)', fontSize: '11px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '32px' };
const doneBtnStyle: React.CSSProperties = { width: '100%', padding: '14px', background: 'var(--text-primary)', color: 'white', border: 'none', borderRadius: '12px', fontWeight: '800', cursor: 'pointer' };

const infoBox: React.CSSProperties = { padding: '12px', background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' };

const tableContainerStyle: React.CSSProperties = { background: 'white', border: '1px solid var(--border)', borderRadius: '20px', overflow: 'hidden' };
const thStyle: React.CSSProperties = { padding: '16px 20px', fontSize: '11px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' };
const tdStyle: React.CSSProperties = { padding: '16px 20px', fontSize: '13px', color: 'var(--text-primary)' };

const logTypeBadgeStyle = (type: string): React.CSSProperties => ({
    padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '800',
    background: type.includes('ERROR') || type.includes('BREACH') ? 'rgba(239,68,68,0.1)' : 'rgba(37,99,235,0.1)',
    color: type.includes('ERROR') || type.includes('BREACH') ? 'var(--accent-red)' : 'var(--accent-blue)'
});

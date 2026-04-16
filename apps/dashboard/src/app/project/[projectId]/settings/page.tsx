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

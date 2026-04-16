'use client';
import React, { useState } from 'react';

interface OrderStats {
    totalOrders: number;
    ordersThisHour: number;
    onlineSplit: number;
    offlineSplit: number;
    delayedCount: number;
    failedCount: number;
}

export const OrderStatsGrid = ({ stats }: { stats: OrderStats }) => {
    const cards = [
        { label: 'Total Orders', value: stats.totalOrders, icon: '📦', color: 'var(--accent-blue)' },
        { label: 'Orders (1h)', value: stats.ordersThisHour, icon: '⏱️', color: 'var(--accent-green)' },
        { label: 'Online vs Offline', value: `${stats.onlineSplit}% / ${stats.offlineSplit}%`, icon: '⚖️', color: 'var(--accent-purple)' },
        { label: 'Delayed', value: stats.delayedCount, icon: '⏳', color: 'var(--accent-orange)', alert: stats.delayedCount > 5 },
        { label: 'Failures', value: stats.failedCount, icon: '❌', color: 'var(--accent-red)', alert: stats.failedCount > 0 }
    ];

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '32px' }}>
            {cards.map(card => (
                <div key={card.label} style={{ 
                    background: 'var(--bg-surface)', 
                    padding: '24px', 
                    borderRadius: '20px', 
                    border: card.alert ? `1px solid var(--accent-red)` : '1px solid var(--border)',
                    boxShadow: 'var(--shadow-sm)'
                }}>
                    <div style={{ fontSize: '12px', fontWeight: '800', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase' }}>{card.label}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '24px', fontWeight: '900' }}>{card.value}</div>
                        <div style={{ fontSize: '24px' }}>{card.icon}</div>
                    </div>
                </div>
            ))}
        </div>
    );
};

export const IntelligentRcaPanel = ({ rca, recommendations }: { rca: any, recommendations: any[] }) => {
    if (!rca || rca.status === 'healthy') return null;

    return (
        <div style={{ 
            background: 'rgba(239, 68, 68, 0.05)', 
            border: '2px solid var(--accent-red)', 
            borderRadius: '24px', 
            padding: '32px', 
            marginBottom: '40px',
            animation: 'pulse-border 2s infinite'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <span style={{ fontSize: '24px' }}>🚨</span>
                <h3 style={{ fontSize: '20px', fontWeight: '900', color: 'var(--accent-red)' }}>System Intelligence Alert: Order Drop Detected</h3>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
                <div>
                    <h4 style={subTitleStyle}>Detected Anomalies (RCA)</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {rca.anomalies.map((anom: any, i: number) => (
                            <div key={i} style={anomalyCardStyle}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <span style={{ fontWeight: '800', fontSize: '14px' }}>{anom.type}</span>
                                    <span style={confidenceBadgeStyle}>{Math.round(anom.confidence * 100)}% Confidence</span>
                                </div>
                                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                    Detected {anom.metric} spike: <strong style={{ color: 'var(--text-primary)' }}>{anom.value}</strong>
                                </div>
                                <div style={{ fontSize: '12px', fontStyle: 'italic', marginTop: '4px', color: 'var(--accent-red)' }}>
                                    Impact: {anom.impact}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div>
                    <h4 style={subTitleStyle}>Actionable Recommendations</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {recommendations.map((rec: any, i: number) => (
                            <div key={i} style={recCardStyle}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                    <span style={{ 
                                        padding: '4px 8px', 
                                        borderRadius: '6px', 
                                        fontSize: '10px', 
                                        fontWeight: '900', 
                                        background: rec.priority === 'Critical' ? 'var(--accent-red)' : 'var(--accent-orange)',
                                        color: 'white'
                                    }}>{rec.priority}</span>
                                    <span style={{ fontWeight: '700', fontSize: '14px' }}>{rec.title}</span>
                                </div>
                                <div style={{ fontSize: '13px', lineHeight: '1.4' }}>{rec.action}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <style>{`
                @keyframes pulse-border {
                    0% { border-color: rgba(239, 68, 68, 0.4); }
                    50% { border-color: rgba(239, 68, 68, 1); }
                    100% { border-color: rgba(239, 68, 68, 0.4); }
                }
            `}</style>
        </div>
    );
};

export const IngestionControlPanel = ({ onUpload, onSync }: { onUpload: (csv: string) => void, onSync: (system: string) => void }) => {
    const [csvInput, setCsvInput] = useState('');

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(400px, 2fr) 1fr', gap: '24px' }}>
            <div style={panelStyle}>
                <h3 style={panelTitleStyle}>CSV Offline Ingestion</h3>
                <p style={panelDescStyle}>Format: Order ID, SKU, Payment Method, Total Amount</p>
                <textarea 
                    value={csvInput}
                    onChange={(e) => setCsvInput(e.target.value)}
                    placeholder="ORD101, SKU-RED-SM, PayPal, 45.99..."
                    style={textareaStyle}
                />
                <button 
                    onClick={() => { onUpload(csvInput); setCsvInput(''); }}
                    style={primaryBtnStyle}
                >
                    Process Batch Upload
                </button>
            </div>

            <div style={panelStyle}>
                <h3 style={panelTitleStyle}>Integration Sync</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {['OMS', 'ERP', 'POS'].map(system => (
                        <button 
                            key={system}
                            onClick={() => onSync(system)}
                            style={secondaryBtnStyle}
                        >
                            Sync with {system}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

// --- Styles ---

const subTitleStyle: React.CSSProperties = {
    fontSize: '14px',
    fontWeight: '800',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: '16px'
};

const anomalyCardStyle: React.CSSProperties = {
    background: 'white',
    padding: '16px',
    borderRadius: '16px',
    border: '1px solid var(--border)'
};

const confidenceBadgeStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--accent-green)',
    background: 'rgba(16, 185, 129, 0.1)',
    padding: '2px 8px',
    borderRadius: '4px'
};

const recCardStyle: React.CSSProperties = {
    background: 'white',
    padding: '16px',
    borderRadius: '16px',
    borderLeft: '4px solid var(--accent-blue)',
    boxShadow: 'var(--shadow-sm)'
};

const panelStyle: React.CSSProperties = {
    background: 'var(--bg-surface)',
    padding: '24px',
    borderRadius: '24px',
    border: '1px solid var(--border)'
};

const panelTitleStyle: React.CSSProperties = {
    fontSize: '16px',
    fontWeight: '800',
    marginBottom: '8px'
};

const panelDescStyle: React.CSSProperties = {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    marginBottom: '16px'
};

const textareaStyle: React.CSSProperties = {
    width: '100%',
    height: '100px',
    background: 'var(--bg-main)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '12px',
    fontSize: '13px',
    fontFamily: 'monospace',
    marginBottom: '16px',
    resize: 'none'
};

const primaryBtnStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px',
    background: 'var(--accent-blue)',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    fontWeight: '700',
    cursor: 'pointer'
};

const secondaryBtnStyle: React.CSSProperties = {
    padding: '12px',
    background: 'white',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    textAlign: 'left'
};

'use client';
import React from 'react';

interface FunnelStep {
    step: string;
    count: number;
    percentage: number;
}

interface FunnelChartProps {
    data: FunnelStep[];
}

export const FunnelChart = ({ data }: FunnelChartProps) => {
    return (
        <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: 'var(--shadow-sm)',
            width: '100%',
            height: '100%'
        }}>
            <h3 style={{ fontSize: '14px', fontWeight: '800', color: 'var(--text-secondary)', marginBottom: '24px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Conversion Funnel
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {data.map((step, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ width: '120px', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)' }}>
                            {step.step}
                        </div>
                        <div style={{ flex: 1, height: '32px', background: 'var(--border-light)', borderRadius: '6px', position: 'relative', overflow: 'hidden' }}>
                            <div style={{ 
                                position: 'absolute', top: 0, left: 0, bottom: 0, 
                                width: `${step.percentage}%`, 
                                background: 'linear-gradient(90deg, var(--accent-blue) 0%, #3b82f6aa 100%)',
                                transition: 'width 1s ease-out'
                            }} />
                            <div style={{ 
                                position: 'absolute', top: 0, left: '12px', bottom: 0, 
                                display: 'flex', alignItems: 'center', 
                                fontSize: '12px', fontWeight: '800', color: step.percentage > 20 ? '#fff' : 'var(--text-primary)'
                            }}>
                                {step.count.toLocaleString()}
                            </div>
                        </div>
                        <div style={{ width: '40px', fontSize: '12px', fontWeight: '800', color: 'var(--accent-blue)', textAlign: 'right' }}>
                            {step.percentage}%
                        </div>
                    </div>
                ))}
            </div>
            <div style={{ marginTop: '24px', padding: '12px', background: 'var(--bg-app)', borderRadius: '8px', border: '1px dashed var(--border)' }}>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center', fontWeight: '600' }}>
                    💡 Tip: High drop-off between Add to Cart and Checkout. Check for friction in the cart page.
                </p>
            </div>
        </div>
    );
};

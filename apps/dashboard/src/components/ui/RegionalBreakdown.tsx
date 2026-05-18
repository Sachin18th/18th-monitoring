'use client';
import React from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';

interface RegionalData {
    name: string;
    lcp: number;
    ttfb: number;
    errorRate: number;
    share: number;
}

interface RegionalBreakdownProps {
    data: RegionalData[];
    title: string;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export const RegionalBreakdown = ({ data, title }: RegionalBreakdownProps) => {
    if (!data || data.length === 0) return null;

    return (
        <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: 'var(--shadow-sm)',
            width: '100%',
            marginBottom: '32px'
        }}>
            <h3 style={{ fontSize: '14px', fontWeight: '800', color: 'var(--text-secondary)', marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                {title}
            </h3>
            
            <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        layout="vertical"
                        data={data}
                        margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="var(--border-light)" />
                        <XAxis type="number" hide />
                        <YAxis 
                            type="category" 
                            dataKey="name" 
                            stroke="var(--text-secondary)" 
                            fontSize={11} 
                            width={120}
                            axisLine={false}
                            tickLine={false}
                        />
                        <Tooltip 
                            cursor={{ fill: 'transparent' }}
                            contentStyle={{ 
                                backgroundColor: 'var(--bg-surface)', 
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                fontSize: '12px'
                            }}
                            formatter={(value: any, name: string) => [
                                name === 'lcp' ? `${value}ms` : name === 'errorRate' ? `${value}%` : `${value}%`,
                                name.toUpperCase()
                            ]}
                        />
                        <Bar dataKey="share" name="Traffic Share" radius={[0, 4, 4, 0]} barSize={20}>
                            {data.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>

            <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-light)', paddingTop: '20px' }}>
                <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                            <th style={{ paddingBottom: '12px' }}>Region</th>
                            <th style={{ paddingBottom: '12px' }}>Avg LCP</th>
                            <th style={{ paddingBottom: '12px' }}>Avg TTFB</th>
                            <th style={{ paddingBottom: '12px' }}>Err Rate</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((item, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                <td style={{ padding: '8px 0', fontWeight: '700', color: 'var(--text-primary)' }}>{item.name}</td>
                                <td style={{ padding: '8px 0', color: 'var(--text-secondary)' }}>{item.lcp}ms</td>
                                <td style={{ padding: '8px 0', color: 'var(--text-secondary)' }}>{item.ttfb}ms</td>
                                <td style={{ padding: '8px 0', color: item.errorRate > 0.5 ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                                    {item.errorRate}%
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

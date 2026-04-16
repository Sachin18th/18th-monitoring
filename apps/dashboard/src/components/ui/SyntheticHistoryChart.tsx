'use client';
import React from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, Legend
} from 'recharts';

interface SyntheticHistoryChartProps {
    title?: string;
}

// Generate mock 7-day history
function generateHistory() {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return days.map((day, i) => ({
        day,
        Homepage: 99.5 + Math.random() * 0.5 - (i === 3 ? 2 : 0),
        Login: 98 + Math.random() * 1.5 - (i === 2 ? 3 : 0),
        Signup: 99 + Math.random() * 0.8,
        Protected: 100,
    })).map(d => ({
        ...d,
        Homepage: Math.min(100, Math.max(90, Math.round(d.Homepage * 10) / 10)),
        Login: Math.min(100, Math.max(90, Math.round(d.Login * 10) / 10)),
        Signup: Math.min(100, Math.max(90, Math.round(d.Signup * 10) / 10)),
        Protected: 100,
    }));
}

const LINES = [
    { key: 'Homepage', color: '#3b82f6' },
    { key: 'Login', color: '#10b981' },
    { key: 'Signup', color: '#8b5cf6' },
    { key: 'Protected', color: '#f59e0b' },
];

export const SyntheticHistoryChart = ({ title = 'Journey Success Rate — Last 7 Days' }: SyntheticHistoryChartProps) => {
    const data = generateHistory();

    return (
        <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: '20px',
            padding: '28px',
            boxShadow: 'var(--shadow-sm)',
        }}>
            <h3 style={{ fontSize: '14px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '24px' }}>
                {title}
            </h3>

            <ResponsiveContainer width="100%" height={260}>
                <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                    <XAxis dataKey="day" stroke="var(--text-muted)" fontSize={11} axisLine={false} tickLine={false} />
                    <YAxis
                        domain={[90, 100]} stroke="var(--text-muted)" fontSize={11}
                        axisLine={false} tickLine={false}
                        tickFormatter={(v) => `${v}%`}
                    />
                    <ReferenceLine y={95} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.4}
                        label={{ value: 'Threshold 95%', position: 'insideTopRight', fontSize: 10, fill: '#ef4444', opacity: 0.7 }}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: 'var(--bg-surface)',
                            border: '1px solid var(--border)',
                            borderRadius: '10px', fontSize: '12px',
                        }}
                        formatter={(val: any) => [`${val}%`]}
                    />
                    <Legend
                        wrapperStyle={{ fontSize: '12px', paddingTop: '16px' }}
                        formatter={(val) => <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>{val}</span>}
                    />
                    {LINES.map(({ key, color }) => (
                        <Line key={key} type="monotone" dataKey={key} stroke={color} strokeWidth={2}
                            dot={{ r: 3, fill: color }} activeDot={{ r: 5 }}
                        />
                    ))}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

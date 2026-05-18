'use client';
import React from 'react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from 'recharts';

interface DeviceData {
    name: string;
    value: number;
    color: string;
}

interface DeviceSegmentationProps {
    data: DeviceData[];
    title: string;
}

export const DeviceSegmentation = ({ data, title }: DeviceSegmentationProps) => {
    if (!data || data.length === 0) return null;

    return (
        <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: 'var(--shadow-sm)',
            width: '100%',
            marginBottom: '32px',
            display: 'flex',
            flexDirection: 'column'
        }}>
            <h3 style={{ fontSize: '14px', fontWeight: '800', color: 'var(--text-secondary)', marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                {title}
            </h3>
            
            <div style={{ width: '100%', height: 250 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                        >
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Pie>
                        <Tooltip 
                            contentStyle={{ 
                                backgroundColor: 'var(--bg-surface)', 
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                fontSize: '12px'
                            }}
                        />
                        <Legend verticalAlign="bottom" height={36}/>
                    </PieChart>
                </ResponsiveContainer>
            </div>
            
            <div style={{ marginTop: 'auto', textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Dominant Device: <span style={{ fontWeight: '800', color: 'var(--text-primary)' }}>Mobile (62%)</span>
                </div>
            </div>
        </div>
    );
};

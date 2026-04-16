'use client';
import React from 'react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';

interface ChartPoint {
    timestamp: string;
    success: number;
    failure: number;
}

interface SyncTrendChartProps {
    data: ChartPoint[];
    title: string;
}

export const SyncTrendChart = ({ data, title }: SyncTrendChartProps) => {
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
                    <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--accent-green)" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="var(--accent-green)" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorFailure" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--accent-red)" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="var(--accent-red)" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                        <XAxis 
                            dataKey="timestamp" 
                            stroke="var(--text-secondary)" 
                            fontSize={12} 
                            tickLine={false} 
                            axisLine={false} 
                        />
                        <YAxis 
                            stroke="var(--text-secondary)" 
                            fontSize={12} 
                            tickLine={false} 
                            axisLine={false} 
                        />
                        <Tooltip 
                            contentStyle={{ 
                                backgroundColor: 'var(--bg-surface)', 
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                fontSize: '12px'
                            }}
                        />
                        <Legend iconType="circle" />
                        <Area 
                            type="monotone" 
                            dataKey="success" 
                            name="Success" 
                            stroke="var(--accent-green)" 
                            fillOpacity={1} 
                            fill="url(#colorSuccess)" 
                            strokeWidth={3}
                        />
                        <Area 
                            type="monotone" 
                            dataKey="failure" 
                            name="Failure" 
                            stroke="var(--accent-red)" 
                            fillOpacity={1} 
                            fill="url(#colorFailure)" 
                            strokeWidth={2}
                            strokeDasharray="5 5"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

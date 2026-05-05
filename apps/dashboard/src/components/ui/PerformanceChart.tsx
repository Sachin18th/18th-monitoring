'use client';
<<<<<<< HEAD
import React, { memo } from 'react';
=======
import React from 'react';
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
<<<<<<< HEAD
=======
  Legend, 
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
  ResponsiveContainer 
} from 'recharts';

interface ChartPoint {
    timestamp: string;
    pageLoadTime: number;
    ttfb: number;
    fcp: number;
    lcp: number;
}

interface PerformanceChartProps {
    data: ChartPoint[];
<<<<<<< HEAD
    title?: string;
    height?: number;
}

export const PerformanceChart = memo(({ data, title, height = 240 }: PerformanceChartProps) => {
    if (!data || data.length === 0) return null;

    return (
        <div className="w-full">
            {title && (
              <h3 className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-4">
                  {title}
              </h3>
            )}
            
            <div style={{ width: '100%', height }}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                           <linearGradient id="colorPageLoad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.1}/>
                              <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                           </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} opacity={0.5} />
                        <XAxis 
                            dataKey="timestamp" 
                            stroke="var(--text-muted)" 
                            fontSize={10} 
                            tickLine={false} 
                            axisLine={false}
                            dy={10}
                            tickFormatter={(val) => {
                                try {
                                    return val.split(':')[0] + ':' + val.split(':')[1];
                                } catch(e) { return val; }
                            }}
                        />
                        <YAxis 
                            stroke="var(--text-muted)" 
                            fontSize={10} 
                            tickLine={false} 
                            axisLine={false} 
                            tickFormatter={(value) => `${value}ms`}
                            width={45}
=======
    title: string;
}

export const PerformanceChart = ({ data, title }: PerformanceChartProps) => {
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
                    <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
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
                            tickFormatter={(value) => `${value}ms`}
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
                        />
                        <Tooltip 
                            contentStyle={{ 
                                backgroundColor: 'var(--bg-surface)', 
<<<<<<< HEAD
                                border: '1px solid var(--border-subtle)',
                                borderRadius: '12px',
                                fontSize: '11px',
                                boxShadow: 'var(--shadow-md)',
                                padding: '8px 12px'
                            }}
                            itemStyle={{ padding: '2px 0' }}
                        />
=======
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                fontSize: '12px'
                            }}
                        />
                        <Legend iconType="circle" />
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
                        <Line 
                            type="monotone" 
                            dataKey="pageLoadTime" 
                            name="Page Load" 
<<<<<<< HEAD
                            stroke="var(--primary)" 
                            strokeWidth={3} 
                            dot={{ r: 3, fill: 'var(--primary)', strokeWidth: 2, stroke: 'var(--bg-surface)' }} 
                            activeDot={{ r: 5, strokeWidth: 0 }} 
                            isAnimationActive={data.length < 50}
                        />
                        <Line type="monotone" dataKey="lcp" name="LCP" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 4" dot={false} isAnimationActive={data.length < 50} />
                        <Line type="monotone" dataKey="fcp" name="FCP" stroke="#10b981" strokeWidth={2} strokeDasharray="4 4" dot={false} isAnimationActive={data.length < 50} />
                        <Line type="monotone" dataKey="ttfb" name="TTFB" stroke="#ef4444" strokeWidth={2} strokeDasharray="4 4" dot={false} isAnimationActive={data.length < 50} />
=======
                            stroke="var(--accent-blue)" 
                            strokeWidth={3} 
                            dot={{ r: 4 }} 
                            activeDot={{ r: 6 }} 
                        />
                        <Line type="monotone" dataKey="lcp" name="LCP" stroke="var(--accent-orange)" strokeWidth={2} strokeDasharray="5 5" />
                        <Line type="monotone" dataKey="fcp" name="FCP" stroke="var(--accent-green)" strokeWidth={2} strokeDasharray="5 5" />
                        <Line type="monotone" dataKey="ttfb" name="TTFB" stroke="var(--accent-red)" strokeWidth={2} strokeDasharray="5 5" />
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
<<<<<<< HEAD
}, (prev, next) => {
    return prev.title === next.title && prev.data?.length === next.data?.length && prev.height === next.height;
});
=======
};
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb

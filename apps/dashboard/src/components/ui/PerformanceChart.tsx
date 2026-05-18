'use client';
import React, { memo } from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
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
                        />
                        <Tooltip 
                            contentStyle={{ 
                                backgroundColor: 'var(--bg-surface)', 
                                border: '1px solid var(--border-subtle)',
                                borderRadius: '12px',
                                fontSize: '11px',
                                boxShadow: 'var(--shadow-md)',
                                padding: '8px 12px'
                            }}
                            itemStyle={{ padding: '2px 0' }}
                        />
                        <Line 
                            type="monotone" 
                            dataKey="pageLoadTime" 
                            name="Page Load" 
                            stroke="var(--primary)" 
                            strokeWidth={3} 
                            dot={{ r: 3, fill: 'var(--primary)', strokeWidth: 2, stroke: 'var(--bg-surface)' }} 
                            activeDot={{ r: 5, strokeWidth: 0 }} 
                            isAnimationActive={data.length < 50}
                        />
                        <Line type="monotone" dataKey="lcp" name="LCP" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 4" dot={false} isAnimationActive={data.length < 50} />
                        <Line type="monotone" dataKey="fcp" name="FCP" stroke="#10b981" strokeWidth={2} strokeDasharray="4 4" dot={false} isAnimationActive={data.length < 50} />
                        <Line type="monotone" dataKey="ttfb" name="TTFB" stroke="#ef4444" strokeWidth={2} strokeDasharray="4 4" dot={false} isAnimationActive={data.length < 50} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}, (prev, next) => {
    return prev.title === next.title && prev.data?.length === next.data?.length && prev.height === next.height;
});

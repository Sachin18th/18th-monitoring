import React from 'react';
import { Card } from '../ui/Card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface LatencyData {
  time: string;
  p50: number;
  p95: number;
  p99: number;
}

interface BackendLatencyChartProps {
  data: LatencyData[];
  title: string;
}

export const BackendLatencyChart: React.FC<BackendLatencyChartProps> = ({ data, title }) => {
  return (
    <Card
      className="p-6"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)', boxShadow: 'none' }}
    >
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-sm font-medium uppercase tracking-wider" style={{ color: 'var(--text-label)' }}>{title}</h3>
        <div className="flex gap-4 text-[10px] uppercase font-bold tracking-tighter">
          <span className="flex items-center gap-1 text-indigo-400"><div className="w-2 h-2 rounded-full bg-indigo-500" /> P50</span>
          <span className="flex items-center gap-1 text-purple-400"><div className="w-2 h-2 rounded-full bg-purple-500" /> P95</span>
          <span className="flex items-center gap-1 text-rose-400"><div className="w-2 h-2 rounded-full bg-rose-500" /> P99</span>
        </div>
      </div>
      
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-card)" vertical={false} />
            <XAxis dataKey="time" stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}ms`} />
            <Tooltip 
              contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '8px', color: 'var(--text-primary)' }}
              itemStyle={{ fontSize: '12px', color: 'var(--text-primary)' }}
            />
            <Line type="monotone" dataKey="p50" stroke="#6366f1" strokeWidth={2} dot={false} name="P50 Latency" />
            <Line type="monotone" dataKey="p95" stroke="#a855f7" strokeWidth={2} dot={false} name="P95 Latency" />
            <Line type="monotone" dataKey="p99" stroke="#f43f5e" strokeWidth={2} dot={false} name="P99 Latency" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};

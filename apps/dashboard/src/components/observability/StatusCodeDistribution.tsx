import React from 'react';
import { Card } from '../ui/Card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface StatusData {
  name: string;
  value: number;
}

interface StatusCodeDistributionProps {
  data: StatusData[];
}

const COLORS = {
  '2xx': '#10b981',
  '3xx': '#6366f1',
  '4xx': '#f59e0b',
  '5xx': '#ef4444',
};

export const StatusCodeDistribution: React.FC<StatusCodeDistributionProps> = ({ data }) => {
  return (
    <Card
      className="p-6 h-full"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)', boxShadow: 'none' }}
    >
      <h3 className="text-sm font-medium mb-6 uppercase tracking-wider" style={{ color: 'var(--text-label)' }}>Status Code Distribution</h3>
      
      <div className="h-[250px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
            >
              {data.map((entry) => (
                <Cell key={`cell-${entry.name}`} fill={(COLORS as any)[entry.name] || '#64748b'} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '8px', color: 'var(--text-primary)' }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};

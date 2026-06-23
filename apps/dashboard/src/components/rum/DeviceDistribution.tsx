//apps/dashboard/src/components/rum/DeviceDistribution.tsx
import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface DeviceData {
  name: string;
  value: number;
}

interface DeviceDistributionProps {
  data: DeviceData[];
  title: string;
}

const COLORS = ['#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#f97316'];

export const DeviceDistribution: React.FC<DeviceDistributionProps> = ({ data, title }) => {
  // Incoming rows are raw session counts and may repeat a device name (one row
  // per connector). Merge by name so the donut shows a single slice per device.
  const merged = React.useMemo(() => {
    const byName = new Map<string, number>();
    for (const item of data) {
      byName.set(item.name, (byName.get(item.name) || 0) + (Number(item.value) || 0));
    }
    return Array.from(byName.entries()).map(([name, value]) => ({ name, value }));
  }, [data]);

  const total = merged.reduce((sum, item) => sum + item.value, 0) || 1;
  const pct = (value: number) => Math.round((value / total) * 100);

  return (
    <div style={{ width: '100%', overflow: 'visible', minHeight: '260px' }}>
      {title ? <h3 style={{ fontSize: '14px', fontWeight: 500, color: '#94a3b8', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</h3> : null}

      <div style={{ width: '100%', height: '220px', overflow: 'visible' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={merged}
              innerRadius={44}
              outerRadius={64}
              paddingAngle={5}
              dataKey="value"
            >
              {merged.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number, name: string) => [`${value} (${pct(value)}%)`, name]}
              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
              itemStyle={{ color: '#f8fafc' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {merged.map((item, index) => (
          <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '999px', backgroundColor: COLORS[index % COLORS.length] }} />
              <span style={{ color: '#cbd5e1' }}>{item.name}</span>
            </div>
            <span style={{ fontWeight: 500, color: '#f1f5f9' }}>{pct(item.value)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};
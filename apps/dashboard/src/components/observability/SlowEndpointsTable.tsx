import React from 'react';
import { Card } from '../ui/Card';
import { AlertCircle, Clock } from 'lucide-react';

interface EndpointMetric {
  route: string;
  method: string;
  p95: number;
  p99: number;
  errorRate: number;
  calls: number;
}

interface SlowEndpointsTableProps {
  endpoints: EndpointMetric[];
}

export const SlowEndpointsTable: React.FC<SlowEndpointsTableProps> = ({ endpoints }) => {
  return (
    <Card
      className="p-6"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border-card)', boxShadow: 'none' }}
    >
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-sm font-medium uppercase tracking-wider" style={{ color: 'var(--text-label)' }}>Top Slow Endpoints</h3>
        <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
          <Clock className="w-3 h-3" /> Last 60 Minutes
        </span>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[10px] font-bold uppercase tracking-widest" style={{ borderBottom: '1px solid var(--border-card)', color: 'var(--text-label)' }}>
              <th className="pb-3">METHOD</th>
              <th className="pb-3">ROUTE</th>
              <th className="pb-3 text-right">P95</th>
              <th className="pb-3 text-right">P99</th>
              <th className="pb-3 text-right">ERR %</th>
              <th className="pb-3 text-right">CALLS</th>
            </tr>
          </thead>
          <tbody>
            {endpoints.map((item, idx) => (
              <tr key={idx} className="group transition-colors" style={{ borderBottom: '1px solid var(--border-card)' }}>
                <td className="py-3 pr-4">
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                    item.method === 'POST' ? 'bg-indigo-500/10 text-indigo-400' :
                    item.method === 'GET' ? 'bg-emerald-500/10 text-emerald-400' :
                    'bg-slate-500/10 text-slate-400'
                  }`}>
                    {item.method}
                  </span>
                </td>
                <td className="py-3 text-xs font-mono truncate max-w-[200px]" style={{ color: 'var(--text-primary)' }}>
                  {item.route}
                </td>
                <td className="py-3 text-xs text-right font-medium" style={{ color: 'var(--text-primary)' }}>
                  {item.p95}ms
                </td>
                <td className={`py-3 text-xs text-right font-bold ${item.p99 > 1000 ? 'text-rose-400' : ''}`} style={item.p99 > 1000 ? undefined : { color: 'var(--text-primary)' }}>
                  {item.p99}ms
                </td>
                <td className={`py-3 text-xs text-right font-medium ${item.errorRate > 1 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {item.errorRate}%
                </td>
                <td className="py-3 text-xs text-right" style={{ color: 'var(--text-muted)' }}>
                  {item.calls?.toLocaleString() || '0'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

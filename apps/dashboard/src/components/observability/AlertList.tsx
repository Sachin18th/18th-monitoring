import React from 'react';
import { Card } from '../ui/Card';
import { AlertCircle, CheckCircle2, Clock, ShieldAlert } from 'lucide-react';

interface Alert {
  id: string;
  title: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'ACTIVE' | 'RESOLVED';
  timestamp: string;
  source: string;
}

interface AlertListProps {
  alerts: Alert[];
}

export const AlertList: React.FC<AlertListProps> = ({ alerts = [] }) => {
  return (
    <div className="space-y-4">
      {alerts.map((alert) => (
        <Card key={alert.id} className={`p-4 bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-all ${alert.status === 'ACTIVE' ? 'border-l-4 border-l-rose-500' : 'border-l-4 border-l-emerald-500'}`}>
          <div className="flex justify-between items-start">
            <div className="flex gap-3">
              <div className={`p-2 rounded-lg ${alert.status === 'ACTIVE' ? 'bg-rose-500/10' : 'bg-emerald-500/10'}`}>
                {alert.status === 'ACTIVE' ? <ShieldAlert className="w-4 h-4 text-rose-400" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-sm font-bold text-white">{alert.title}</h4>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                    alert.severity === 'CRITICAL' ? 'bg-rose-500/20 text-rose-400' : 
                    alert.severity === 'HIGH' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {alert.severity}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 uppercase font-medium">Source: {alert.source}</p>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center justify-end gap-1 text-[10px] text-slate-500 mb-1">
                <Clock className="w-3 h-3" /> {alert.timestamp}
              </div>
              <button className="text-[10px] font-bold text-indigo-400 hover:underline uppercase tracking-widest">
                Investigate
              </button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};

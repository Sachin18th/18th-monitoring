import React from 'react';
import { Card } from '../ui/Card';
import { CheckCircle2, XCircle, Clock } from 'lucide-react';

interface UptimeProps {
  percentage: number;
  lastRunStatus: 'PASS' | 'FAIL';
  lastRunTime: string;
  history: any[];
}

export const SyntheticUptime: React.FC<UptimeProps> = ({ percentage, lastRunStatus, lastRunTime, history }) => {
  return (
    <Card className="p-6 bg-slate-900/50 backdrop-blur-xl border-slate-800">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">System Availability (Synthetic)</h3>
        {lastRunStatus === 'PASS' ? (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-400 uppercase">
            <CheckCircle2 className="w-3 h-3" /> All Journeys Passing
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-[10px] font-bold text-rose-400 uppercase">
            <XCircle className="w-3 h-3" /> Critical Failure Detected
          </div>
        )}
      </div>

      <div className="flex items-end gap-4 mb-8">
        <div className="text-5xl font-bold text-white tracking-tight">{percentage}%</div>
        <div className="pb-1.5 text-xs font-medium text-slate-500">Uptime (Last 24h)</div>
      </div>

      <div className="flex gap-1 h-3 mb-6">
        {Array.from({ length: 48 }).map((_, i) => {
          // Map history to the 48 slots, newest on the right
          const historyIdx = history.length - 1 - (47 - i);
          const run = history[historyIdx];
          const isFailing = run ? run.success_status === false : false;
          const hasData = !!run;
          
          return (
            <div 
              key={i} 
              className={`flex-1 rounded-sm transition-all duration-300 ${
                !hasData ? 'bg-slate-800' :
                isFailing ? 'bg-rose-500 hover:bg-rose-400' : 
                'bg-emerald-500 hover:bg-emerald-400 opacity-60 hover:opacity-100'
              }`}
              title={hasData ? `Run ${new Date(run.timestamp).toLocaleString()}: ${isFailing ? 'Failed' : 'Passed'}` : 'No data'}
            />
          );
        })}
      </div>

      <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3" /> Last Checked: {lastRunTime}
        </div>
        <div>Check Interval: 10m</div>
      </div>
    </Card>
  );
};

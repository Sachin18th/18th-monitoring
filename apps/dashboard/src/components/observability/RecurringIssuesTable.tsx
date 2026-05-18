import React from 'react';
import { Card } from '../ui/Card';
import { AlertCircle, ChevronRight, Users, ShieldAlert } from 'lucide-react';

interface Issue {
  fingerprint: string;
  message: string;
  category: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  count: number;
  usersAffected: number;
  lastSeen: string;
}

interface RecurringIssuesTableProps {
  issues: Issue[];
}

export const RecurringIssuesTable: React.FC<RecurringIssuesTableProps> = ({ issues }) => {
  const getSeverityColor = (sev: string) => {
    switch (sev) {
      case 'CRITICAL': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'HIGH': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
      case 'MEDIUM': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  return (
    <Card className="p-6 bg-slate-900/50 backdrop-blur-xl border-slate-800">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Top Recurring Issues</h3>
        <button className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors">
          VIEW ALL ISSUES <ChevronRight className="w-3 h-3" />
        </button>
      </div>
      
      <div className="space-y-3">
        {issues.map((issue) => (
          <div key={issue.fingerprint} className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 hover:border-slate-600 transition-all cursor-pointer group">
            <div className="flex justify-between items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${getSeverityColor(issue.severity)}`}>
                    {issue.severity}
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{issue.category}</span>
                </div>
                <h4 className="text-sm font-medium text-slate-200 truncate group-hover:text-white transition-colors">{issue.message}</h4>
              </div>
              
              <div className="flex gap-6 text-right shrink-0">
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase">Events</p>
                  <p className="text-sm font-bold text-slate-300">{issue.count.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase">Impact</p>
                  <div className="flex items-center justify-end gap-1 text-sm font-bold text-slate-300">
                    <Users className="w-3 h-3 text-slate-500" /> {issue.usersAffected}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mt-3 pt-3 border-t border-slate-700/30 flex justify-between items-center">
              <span className="text-[10px] font-mono text-slate-600">FP: {issue.fingerprint.substring(0, 8)}</span>
              <span className="text-[10px] text-slate-500 italic">Last seen: {issue.lastSeen}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

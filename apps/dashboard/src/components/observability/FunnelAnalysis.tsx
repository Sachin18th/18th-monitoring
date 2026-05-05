import React from 'react';
import { Card } from '../ui/Card';
import { ChevronRight, ArrowRight, UserCheck, UserMinus, AlertTriangle } from 'lucide-react';

interface FunnelStep {
  label: string;
  count: number;
  dropRate: number;
  technicalDropCount: number;
}

interface FunnelAnalysisProps {
  steps: FunnelStep[];
}

export const FunnelAnalysis: React.FC<FunnelAnalysisProps> = ({ steps }) => {
  return (
    <Card className="p-6 bg-slate-900/50 backdrop-blur-xl border-slate-800">
      <div className="flex justify-between items-center mb-8">
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Purchase Journey Funnel</h3>
        <span className="text-[10px] font-bold text-slate-500 uppercase">Live Analysis (Project Scope)</span>
      </div>
      
      <div className="space-y-4">
        {steps.map((step, idx) => (
          <div key={step.label} className="relative">
            <div className="flex items-center gap-4">
              {/* Step Bar */}
              <div className="flex-1">
                <div className="flex justify-between items-end mb-1.5">
                  <span className="text-xs font-bold text-slate-200 uppercase">{step.label}</span>
                  <div className="text-right">
                    <span className="text-sm font-bold text-white">{step.count.toLocaleString()}</span>
                    <span className="text-[10px] text-slate-500 ml-1">users</span>
                  </div>
                </div>
                <div className="h-4 w-full bg-slate-800 rounded-sm overflow-hidden relative">
                  <div 
                    className="h-full bg-indigo-500 transition-all duration-1000" 
                    style={{ width: `${(step.count / steps[0].count) * 100}%` }} 
                  />
                  {step.technicalDropCount > 0 && (
                    <div 
                      className="absolute right-0 top-0 h-full bg-rose-500/40" 
                      style={{ width: `${(step.technicalDropCount / step.count) * 100}%` }} 
                    />
                  )}
                </div>
              </div>
              
              {/* Stats Column */}
              <div className="w-24 text-right pt-5">
                {idx > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-rose-400">-{step.dropRate}%</p>
                    <p className="text-[9px] text-slate-600 uppercase font-medium">Drop-off</p>
                  </div>
                )}
              </div>
            </div>

            {/* Connection Arrow */}
            {idx < steps.length - 1 && (
              <div className="flex justify-center py-1 opacity-20">
                <ArrowRight className="w-4 h-4 rotate-90 text-slate-400" />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-8 pt-6 border-t border-slate-800/50 grid grid-cols-2 gap-4">
        <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
          <div className="flex items-center gap-2 mb-1">
            <UserCheck className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] font-bold text-slate-500 uppercase">Conversion Rate</span>
          </div>
          <p className="text-lg font-bold text-emerald-400">3.2%</p>
        </div>
        <div className="p-3 rounded-lg bg-rose-500/5 border border-rose-500/10">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-3 h-3 text-rose-400" />
            <span className="text-[10px] font-bold text-slate-500 uppercase">Technical Loss</span>
          </div>
          <p className="text-lg font-bold text-rose-400">0.8%</p>
        </div>
      </div>
    </Card>
  );
};

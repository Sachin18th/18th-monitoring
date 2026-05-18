import React from 'react';
import { Card } from '../ui/Card'; // Assuming Card exists in ui
import { Activity, Zap, MousePointer2, Layout } from 'lucide-react';

interface WebVitalCardProps {
  name: string;
  value: number;
  unit: string;
  rating: 'good' | 'needs-improvement' | 'poor';
  description: string;
}

export const WebVitalCard: React.FC<WebVitalCardProps> = ({ name, value, unit, rating, description }) => {
  const getRatingColor = () => {
    switch (rating) {
      case 'good': return 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5';
      case 'needs-improvement': return 'text-amber-400 border-amber-500/20 bg-amber-500/5';
      case 'poor': return 'text-rose-400 border-rose-500/20 bg-rose-500/5';
    }
  };

  const getIcon = () => {
    switch (name) {
      case 'LCP': return <Layout className="w-5 h-5" />;
      case 'INP': return <MousePointer2 className="w-5 h-5" />;
      case 'CLS': return <Activity className="w-5 h-5" />;
      case 'TTFB': return <Zap className="w-5 h-5" />;
      default: return <Activity className="w-5 h-5" />;
    }
  };

  return (
    <Card className={`p-5 border transition-all hover:scale-[1.02] ${getRatingColor()}`}>
      <div className="flex justify-between items-start mb-4">
        <div className="p-2 rounded-lg bg-white/5 border border-white/10">
          {getIcon()}
        </div>
        <span className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-full border ${getRatingColor()}`}>
          {rating.replace('-', ' ')}
        </span>
      </div>
      
      <div className="mb-1">
        <h3 className="text-sm font-medium text-slate-400">{name}</h3>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold text-white">{value}</span>
          <span className="text-sm text-slate-500 font-medium">{unit}</span>
        </div>
      </div>
      
      <p className="text-xs text-slate-500 leading-relaxed mt-2">
        {description}
      </p>
    </Card>
  );
};

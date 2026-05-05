import React from 'react';
import { Card } from '../ui/Card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface ErrorData {
  time: string;
  jsErrors: number;
  apiErrors: number;
  businessFailures: number;
}

interface ErrorRateTrendProps {
  data: ErrorData[];
}

export const ErrorRateTrend: React.FC<ErrorRateTrendProps> = ({ data }) => {
  return (
    <Card className="p-6 bg-slate-900/50 backdrop-blur-xl border-slate-800">
      <h3 className="text-sm font-medium text-slate-400 mb-6 uppercase tracking-wider">Failure Rate Trends</h3>
      
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorJs" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorApi" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis dataKey="time" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
            />
            <Area type="monotone" dataKey="jsErrors" stroke="#f43f5e" fillOpacity={1} fill="url(#colorJs)" name="JS Errors" />
            <Area type="monotone" dataKey="apiErrors" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorApi)" name="API Failures" />
            <Area type="monotone" dataKey="businessFailures" stroke="#fbbf24" fillOpacity={0} name="Business Failures" strokeDasharray="5 5" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};

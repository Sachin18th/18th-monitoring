// import React from 'react';
// import { Card } from '@/components/ui/Card';
// import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

// interface DeviceData {
//   name: string;
//   value: number;
// }

// interface DeviceDistributionProps {
//   data: DeviceData[];
//   title: string;
// }

// const COLORS = ['#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#f97316'];

// export const DeviceDistribution: React.FC<DeviceDistributionProps> = ({ data, title }) => {
//   return (
//     <Card className="p-6 bg-slate-900/50 backdrop-blur-xl border-slate-800 h-full">
//       <h3 className="text-sm font-medium text-slate-400 mb-6 uppercase tracking-wider">{title}</h3>
      
//       <div className="h-[250px] w-full">
//         <ResponsiveContainer width="100%" height="100%">
//           <PieChart>
//             <Pie
//               data={data}
//               innerRadius={60}
//               outerRadius={80}
//               paddingAngle={5}
//               dataKey="value"
//             >
//               {data.map((entry, index) => (
//                 <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
//               ))}
//             </Pie>
//             <Tooltip 
//               contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
//               itemStyle={{ color: '#f8fafc' }}
//             />
//             <Legend verticalAlign="bottom" height={36}/>
//           </PieChart>
//         </ResponsiveContainer>
//       </div>
      
//       <div className="mt-4 space-y-2">
//         {data.map((item, index) => (
//           <div key={item.name} className="flex justify-between items-center text-sm">
//             <div className="flex items-center gap-2">
//               <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
//               <span className="text-slate-300">{item.name}</span>
//             </div>
//             <span className="font-medium text-slate-100">{item.value}%</span>
//           </div>
//         ))}
//       </div>
//     </Card>
//   );
// };

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
  return (
    <div style={{ width: '100%', overflow: 'visible', minHeight: '260px' }}>
      <h3 style={{ fontSize: '14px', fontWeight: 500, color: '#94a3b8', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</h3>

      <div style={{ width: '100%', height: '220px', overflow: 'visible' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              innerRadius={44}
              outerRadius={64}
              paddingAngle={5}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
              itemStyle={{ color: '#f8fafc' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {data.map((item, index) => (
          <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '999px', backgroundColor: COLORS[index % COLORS.length] }} />
              <span style={{ color: '#cbd5e1' }}>{item.name}</span>
            </div>
            <span style={{ fontWeight: 500, color: '#f1f5f9' }}>{item.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};
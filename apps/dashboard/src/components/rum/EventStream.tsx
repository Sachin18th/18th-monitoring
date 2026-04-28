// import React from 'react';
// import { Card } from '../ui/Card';
// import { Terminal, Globe, MousePointer, ShieldAlert } from 'lucide-react';

// interface RumEvent {
//   id: string;
//   type: string;
//   url: string;
//   timestamp: string;
//   metadata: any;
// }

// interface EventStreamProps {
//   events: RumEvent[];
// }

// export const EventStream: React.FC<EventStreamProps> = ({ events }) => {
//   const getIcon = (type: string) => {
//     switch (type) {
//       case 'page_view': return <Globe className="w-4 h-4 text-blue-400" />;
//       case 'click': return <MousePointer className="w-4 h-4 text-purple-400" />;
//       case 'js_error': return <ShieldAlert className="w-4 h-4 text-rose-400" />;
//       default: return <Terminal className="w-4 h-4 text-slate-400" />;
//     }
//   };

//   return (
//     <Card className="flex flex-col h-[600px] bg-slate-900/50 backdrop-blur-xl border-slate-800">
//       <div className="p-4 border-b border-slate-800 flex items-center justify-between">
//         <h3 className="font-semibold text-slate-200 flex items-center gap-2">
//           <Terminal className="w-4 h-4" />
//           Real-Time Event Stream
//         </h3>
//         <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded-full border border-emerald-500/20 animate-pulse">
//           LIVE
//         </span>
//       </div>
      
//       <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-hide">
//         {events.map((event) => (
//           <div key={event.id} className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 hover:border-slate-600 transition-colors group">
//             <div className="flex justify-between items-start mb-1">
//               <div className="flex items-center gap-2">
//                 {getIcon(event.type)}
//                 <span className="text-sm font-medium text-slate-200">{event.type.replace('_', ' ')}</span>
//               </div>
//               <span className="text-[10px] text-slate-500">{new Date(event.timestamp).toLocaleTimeString()}</span>
//             </div>
            
//             <div className="text-xs text-slate-400 truncate mb-2">
//               {event.url}
//             </div>
            
//             {event.metadata && Object.keys(event.metadata).length > 0 && (
//               <div className="bg-black/20 p-2 rounded text-[10px] font-mono text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
//                 {JSON.stringify(event.metadata, null, 2)}
//               </div>
//             )}
//           </div>
//         ))}
//       </div>
//     </Card>
//   );
// };

import React from 'react';
import { Terminal, Globe, MousePointer, ShieldAlert } from 'lucide-react';

interface RumEvent {
  id: string;
  type: string;
  url: string;
  timestamp: string;
  metadata: any;
}

interface EventStreamProps {
  events: RumEvent[];
}

export const EventStream: React.FC<EventStreamProps> = ({ events }) => {
  const getIcon = (type: string) => {
    switch (type) {
      case 'page_view': return <Globe className="w-4 h-4 text-blue-400" />;
      case 'click': return <MousePointer className="w-4 h-4 text-purple-400" />;
      case 'js_error': return <ShieldAlert className="w-4 h-4 text-rose-400" />;
      default: return <Terminal className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '320px', height: '100%', width: '100%', overflow: 'visible' }}>
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '260px' }}>
        {events.length === 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.45)', fontSize: '12px', padding: '12px' }}>
            <Terminal style={{ width: '14px', height: '14px' }} />
            Awaiting live RUM events
          </div>
        )}
        {events.map((event) => (
          <div key={event.id} style={{ padding: '12px', borderRadius: '8px', background: 'rgba(30,41,59,0.4)', border: '1px solid rgba(71,85,105,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                {getIcon(event.type)}
                <span style={{ fontSize: '13px', fontWeight: 500, color: '#e2e8f0' }}>{event.type.replace('_', ' ')}</span>
              </div>
              <span style={{ fontSize: '10px', color: '#64748b', flexShrink: 0 }}>{new Date(event.timestamp).toLocaleTimeString()}</span>
            </div>
            
            <div style={{ fontSize: '11px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '8px' }}>{event.url}</div>
            
            {event.metadata && Object.keys(event.metadata).length > 0 && (
              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '6px', fontSize: '10px', fontFamily: 'monospace', color: '#64748b' }}>
                {JSON.stringify(event.metadata, null, 2)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
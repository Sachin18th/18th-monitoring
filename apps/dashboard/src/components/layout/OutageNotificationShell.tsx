'use client';
import React from 'react';
import { AlertCircle, RefreshCw, Clock, WifiOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
<<<<<<< HEAD
import { useTheme } from '@kpi-platform/ui';
import { twMerge } from 'tailwind-merge';
import { clsx, type ClassValue } from 'clsx';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const OutageNotificationShell: React.FC = () => {
    const { outageStatus, lastUpdated } = useAuth();
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
    }, []);

    if (outageStatus === 'none' || !mounted) return null;
=======

export const OutageNotificationShell: React.FC = () => {
    const { outageStatus, lastUpdated } = useAuth();

    if (outageStatus === 'none') return null;
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb

    const isExpired = outageStatus === 'expired';
    const bgColor = isExpired ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)';
    const borderColor = isExpired ? 'var(--accent-red)' : 'var(--accent-orange)';
    const iconColor = isExpired ? 'var(--accent-red)' : 'var(--accent-orange)';

    const formatTime = (iso: string) => {
        try {
            const date = new Date(iso);
            return date.toLocaleString([], { 
                month: 'short', 
                day: 'numeric', 
                hour: '2-digit', 
                minute: '2-digit' 
            });
        } catch (e) {
            return 'Unknown';
        }
    };

    return (
<<<<<<< HEAD
        <div className={cn(
            "sticky top-0 z-[110] px-6 py-2 border-b flex items-center justify-between gap-4 backdrop-blur-md shadow-sm transition-all duration-500",
            isExpired ? "bg-red-50 border-red-200 text-red-800" : "bg-amber-50 border-amber-200 text-amber-800"
        )}>
            <div className="flex items-center gap-3">
                <div className={cn(
                    "p-1.5 rounded-lg",
                    isExpired ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"
                )}>
                    {isExpired ? <WifiOff size={16} /> : <AlertCircle size={16} />}
                </div>
                <div className="flex flex-col leading-tight">
                    <span className="text-[12px] font-black uppercase tracking-wider">
                        {isExpired ? 'System Infrastructure Failure' : 'Real-time Feed Interrupted'}
                    </span>
                    <span className="text-[11px] font-medium opacity-80">
                        {isExpired 
                            ? 'Critical connectivity loss detected. Attempting to restore backbone services.' 
                            : 'Satellite data stream is offline. Displaying prioritized local cache.'}
                    </span>
                </div>
            </div>

            <div className="flex items-center gap-6">
                <div className="hidden md:flex items-center gap-2 text-[11px] font-bold">
                    <Clock size={12} className="opacity-60" />
                    <span className="opacity-60 uppercase tracking-widest text-[9px]">Last Valid Sync:</span>
                    <span className="font-mono">{lastUpdated ? formatTime(lastUpdated) : 'N/A'}</span>
                    {isExpired && <span className="bg-red-600 text-white px-1.5 py-0.5 rounded text-[8px] font-black ml-1">STALE</span>}
                </div>

                <button 
                    onClick={() => window.location.reload()}
                    className={cn(
                        "flex items-center gap-2 px-4 py-1.5 border rounded-full text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-sm",
                        isExpired 
                            ? "bg-red-600 border-red-700 text-white hover:bg-red-700 hover:shadow-md" 
                            : "bg-white border-amber-300 text-amber-800 hover:bg-amber-100"
                    )}
                >
                    <RefreshCw size={12} className="animate-pulse" /> Re-Establish Stream
                </button>
            </div>
=======
        <div style={{
            background: bgColor,
            borderBottom: `1px solid ${borderColor}44`,
            padding: '12px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            position: 'sticky',
            top: 0,
            zIndex: 100,
            backdropFilter: 'blur(8px)'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {isExpired ? <WifiOff size={18} color={iconColor} /> : <AlertCircle size={18} color={iconColor} />}
                <span style={{ 
                    fontSize: '13px', 
                    fontWeight: '700', 
                    color: iconColor,
                    letterSpacing: '0.2px'
                }}>
                    {isExpired 
                        ? 'CRITICAL CONNECTIVITY FAILURE: Backend services are unreachable' 
                        : 'LIVE FEED INTERRUPTED: Displaying cached data snapshots'}
                </span>
            </div>

            <div style={{ width: '1px', height: '16px', background: `${borderColor}33` }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <Clock size={14} />
                <span>Last successful sync: <strong style={{ color: 'var(--text-primary)' }}>{lastUpdated ? formatTime(lastUpdated) : 'Never'}</strong></span>
                {isExpired && <span style={{ color: 'var(--accent-red)', fontWeight: '800', marginLeft: '4px' }}>(DATA EXPIRED)</span>}
            </div>

            <button 
                onClick={() => window.location.reload()}
                style={{
                    marginLeft: '12px',
                    padding: '4px 12px',
                    background: 'transparent',
                    border: `1px solid ${borderColor}44`,
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: '800',
                    color: iconColor,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    textTransform: 'uppercase'
                }}>
                <RefreshCw size={12} /> Reconnect
            </button>
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
        </div>
    );
};

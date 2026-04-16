'use client';
import React from 'react';
import { AlertCircle, RefreshCw, Clock, WifiOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const OutageNotificationShell: React.FC = () => {
    const { outageStatus, lastUpdated } = useAuth();

    if (outageStatus === 'none') return null;

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
        </div>
    );
};

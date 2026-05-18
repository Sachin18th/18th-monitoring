'use client';
import React from 'react';

export type FreshnessState = 'live' | 'delayed' | 'stale' | 'unavailable' | 'syncing';

interface FreshnessIndicatorProps {
    status: FreshnessState;
    lastUpdated?: string | null;
    showLabel?: boolean;
    size?: 'sm' | 'md';
    className?: string;
}

const FRESHNESS_CONFIG: Record<FreshnessState, { label: string; dotClass: string; textClass: string; pulse: boolean }> = {
    live:        { label: 'Live',        dotClass: 'bg-green-500',  textClass: 'text-green-500',  pulse: true  },
    delayed:     { label: 'Delayed',     dotClass: 'bg-yellow-500', textClass: 'text-yellow-500', pulse: false },
    stale:       { label: 'Stale',       dotClass: 'bg-red-500',    textClass: 'text-red-500',    pulse: false },
    unavailable: { label: 'Unavailable', dotClass: 'bg-gray-400',   textClass: 'text-gray-400',   pulse: false },
    syncing:     { label: 'Syncing',     dotClass: 'bg-blue-500',   textClass: 'text-blue-500',   pulse: true  }
};

export const FreshnessIndicator: React.FC<FreshnessIndicatorProps> = ({
    status,
    lastUpdated,
    showLabel = true,
    size = 'sm',
    className = ''
}) => {
    const config = FRESHNESS_CONFIG[status] || FRESHNESS_CONFIG.unavailable;
    const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2';
    const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs';

    return (
        <div className={`flex items-center gap-1.5 ${className}`}>
            <span className={`relative flex ${dotSize}`}>
                {config.pulse && (
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${config.dotClass}`} />
                )}
                <span className={`relative inline-flex rounded-full ${dotSize} ${config.dotClass}`} />
            </span>
            {showLabel && (
                <span className={`font-bold uppercase tracking-widest ${textSize} ${config.textClass}`}>
                    {config.label}
                    {lastUpdated && (
                        <span className="text-text-muted normal-case font-normal ml-1 tracking-normal">
                            · {new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                </span>
            )}
        </div>
    );
};

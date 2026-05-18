'use client';
import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export type TimeRangeValue = '24h' | '7d' | '30d' | '90d' | 'all';

interface TimeRangeSelectorProps {
    value: TimeRangeValue;
    onChange: (value: TimeRangeValue) => void;
    className?: string;
    isDense?: boolean;
}

const RANGES: { label: string; value: TimeRangeValue }[] = [
    { label: '24H', value: '24h' },
    { label: '7D',  value: '7d'  },
    { label: '30D', value: '30d' },
    { label: '90D', value: '90d' },
    { label: 'ALL', value: 'all' }
];

export const TimeRangeSelector: React.FC<TimeRangeSelectorProps> = ({
    value,
    onChange,
    className,
    isDense = false
}) => {
    return (
        <div className={cn(
            'flex items-center p-1 bg-muted/40 rounded-xl border border-border-subtle backdrop-blur-sm',
            className
        )}>
            {RANGES.map((range) => {
                const isActive = value === range.value;
                return (
                    <button
                        key={range.value}
                        onClick={() => onChange(range.value)}
                        className={cn(
                            'relative px-4 py-1.5 rounded-lg text-[10px] font-black tracking-widest uppercase transition-all duration-300',
                            isDense && 'px-2.5 py-1',
                            isActive 
                                ? 'bg-bg-surface text-primary shadow-sm shadow-black/5 ring-1 ring-border-subtle' 
                                : 'text-text-muted hover:text-text-primary hover:bg-muted/60'
                        )}
                    >
                        {range.label}
                        {isActive && (
                            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-primary rounded-full animate-in fade-in slide-in-from-bottom-1 duration-300" />
                        )}
                    </button>
                );
            })}
        </div>
    );
};

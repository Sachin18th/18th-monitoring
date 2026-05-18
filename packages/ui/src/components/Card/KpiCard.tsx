'use client';
import React from 'react';
import { Typography } from '../Typography';
import { Card } from './index';
import { TrendingUp, TrendingDown, Info, AlertCircle } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { FreshnessIndicator, FreshnessState } from '../Feedback/FreshnessIndicator';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export interface KpiCardProps {
    title: string;
    value: string | number;
    description?: string;
    unit?: string;
    trend?: {
        value: number;
        isUp: boolean;
        timeframe?: string;
    };
    freshness: FreshnessState;
    lastUpdated?: string | null;
    isAvailable?: boolean;
    unavailableReason?: string;
    loading?: boolean;
    onClick?: () => void;
    className?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({
    title,
    value,
    description,
    unit,
    trend,
    freshness,
    lastUpdated,
    isAvailable = true,
    unavailableReason,
    loading,
    onClick,
    className
}) => {
    return (
        <Card 
            className={cn(
                'relative overflow-hidden group transition-all duration-300',
                onClick && 'cursor-pointer hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 active:scale-[0.98]',
                !isAvailable && 'opacity-60 grayscale-[0.5]',
                className
            )}
            onClick={isAvailable ? onClick : undefined}
            padding="lg"
        >
            {/* Background Gradient Effect */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

            <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-1 min-w-0">
                        <Typography 
                            variant="caption" 
                            className="text-text-muted font-black tracking-[0.2em] uppercase truncate"
                            noMargin
                        >
                            {title}
                        </Typography>
                        {description && (
                            <Typography variant="micro" className="text-text-muted/60 line-clamp-1">
                                {description}
                            </Typography>
                        )}
                    </div>
                    <FreshnessIndicator 
                        status={freshness} 
                        lastUpdated={lastUpdated} 
                        showLabel={false} 
                        className="mt-0.5"
                    />
                </div>

                <div className="flex flex-col gap-1">
                    {loading ? (
                        <div className="h-10 w-32 bg-muted animate-pulse rounded-lg" />
                    ) : !isAvailable ? (
                        <div className="flex items-center gap-2 text-text-muted">
                            <AlertCircle size={18} />
                            <Typography variant="body" weight="semibold" noMargin>Data Unavailable</Typography>
                        </div>
                    ) : (
                        <div className="flex items-baseline gap-1.5">
                            <Typography 
                                variant="h1" 
                                weight="bold" 
                                className="text-3xl lg:text-4xl tracking-tighter text-text-primary"
                                noMargin
                            >
                                {typeof value === 'number' ? value.toLocaleString() : value}
                            </Typography>
                            {unit && (
                                <Typography 
                                    variant="body" 
                                    weight="bold" 
                                    className="text-text-muted opacity-50 font-black"
                                >
                                    {unit}
                                </Typography>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between mt-auto">
                    {loading ? (
                        <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                    ) : !isAvailable ? (
                        <Typography variant="micro" className="text-text-muted italic">
                            {unavailableReason || 'Required connector not linked'}
                        </Typography>
                    ) : (
                        <div className="flex items-center gap-3">
                            {trend && (
                                <div className={cn(
                                    "flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-black",
                                    trend.isUp ? "bg-success/10 text-success" : "bg-error/10 text-error"
                                )}>
                                    {trend.isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                    <span>{trend.value}%</span>
                                </div>
                            )}
                            {trend?.timeframe && (
                                <Typography variant="micro" className="text-text-muted font-bold uppercase tracking-widest text-[9px]">
                                    vs {trend.timeframe}
                                </Typography>
                            )}
                        </div>
                    )}
                    
                    {onClick && isAvailable && (
                        <div className="p-1 rounded-full bg-muted/40 text-text-muted group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                            <Info size={14} />
                        </div>
                    )}
                </div>
            </div>
        </Card>
    );
};

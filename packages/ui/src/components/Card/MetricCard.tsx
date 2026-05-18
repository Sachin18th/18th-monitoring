import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Badge } from '../Badge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface MetricCardProps {
  title: string;
  value: string | number;
  unit?: string;
  trend?: {
    value: number;
    isUp: boolean;
    label?: string;
  };
  status?: 'critical' | 'warning' | 'success' | 'default';
  icon?: React.ComponentType<any>;
  loading?: boolean;
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  unit,
  trend,
  status = 'default',
  icon: Icon,
  loading,
  className
}) => {
  return (
    <div className={cn(
      'metric-card', 
      status !== 'default' && `metric-card--${status}`,
      className
    )}>
      <div className="metric-card__header">
        <span className="metric-card__title">{title}</span>
        {Icon && (
          <div className="metric-card__icon">
            <Icon size={16} />
          </div>
        )}
      </div>

      <div className="metric-card__value-container">
        {loading ? (
          <div className="skeleton h-10 w-32" />
        ) : (
          <>
            <span className="metric-card__value">{value}</span>
            {unit && <span className="metric-card__unit">{unit}</span>}
          </>
        )}
      </div>

      <div className="metric-card__footer">
        {trend && !loading && (
          <div className={cn(
            'metric-card__trend', 
            trend.isUp ? 'metric-card__trend--up' : 'metric-card__trend--down'
          )}>
            {trend.isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            <span>{trend.value}%</span>
            {trend.label && <span className="opacity-70 ml-1">{trend.label}</span>}
          </div>
        )}
        
        {!trend && !loading && status !== 'default' && (
          <Badge 
            variant={status === 'critical' ? 'error' : status === 'warning' ? 'warning' : 'success'} 
            size="sm" 
            dot
          >
            {status}
          </Badge>
        )}
      </div>
    </div>
  );
};

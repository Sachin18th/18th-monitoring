import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { LucideIcon } from 'lucide-react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type BadgeVariant = 
  | 'default' 
  | 'success' 
  | 'warning' 
  | 'error' 
  | 'info' 
  | 'degraded' 
  | 'stale' 
  | 'paused' 
  | 'processing';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: LucideIcon;
  dot?: boolean;
  hideLabel?: boolean;
  suppressDot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({ 
  className, 
  variant = 'default', 
  size = 'md', 
  icon: Icon,
  dot,
  hideLabel,
  suppressDot,
  children, 
  ...props 
}) => {
  const showDot = dot && !suppressDot;

  return (
    <span 
      className={cn(
        'ui-badge', 
        `ui-badge--${variant}`, 
        `ui-badge--${size}`, 
        showDot && 'has-dot',
        className
      )} 
      {...props}
    >
      {showDot && <span className="badge-dot" />}
      {Icon && <Icon size={size === 'sm' ? 12 : 14} className="badge-icon" />}
      {!hideLabel && (
        <span className="badge-content">{children}</span>
      )}
    </span>
  );
};

export const StatusIndicator: React.FC<{ 
  status: 'success' | 'warning' | 'error' | 'info' | 'inactive';
  label?: string;
  className?: string;
}> = ({ status, label, className }) => {
  return (
    <div className={cn('ui-status-indicator', className)}>
      <span className={cn('status-dot', `status-${status}`)} />
      {label && <span className="status-label">{label}</span>}
    </div>
  );
};

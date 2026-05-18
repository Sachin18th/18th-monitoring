import React from 'react';
import { 
  AlertCircle, 
  Search, 
  Loader2, 
  Inbox, 
  Clock, 
  ShieldAlert,
  RefreshCw,
  LucideIcon
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type InformationStateType = 
  | 'loading' 
  | 'empty' 
  | 'filtered-empty' 
  | 'error' 
  | 'stale' 
  | 'unauthorized'
  | 'compact-loading'
  | 'partial';

export interface InformationStateProps {
  type: InformationStateType;
  title?: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}

export const InformationState: React.FC<InformationStateProps> = ({
  type,
  title,
  description,
  icon: CustomIcon,
  action,
  className
}) => {
  const getConfig = () => {
    switch (type) {
      case 'loading':
        return {
          icon: Loader2,
          title: title || 'Loading data...',
          description: description || 'Please wait while we fetch the latest information.',
          iconClass: 'animate-spin text-primary',
        };
      case 'compact-loading':
        return {
          icon: Loader2,
          title: title || 'Refreshing...',
          description: '',
          iconClass: 'animate-spin text-primary',
          isCompact: true
        };
      case 'empty':
        return {
          icon: Inbox,
          title: title || 'No data found',
          description: description || 'There are no records available at this time.',
          iconClass: 'text-text-muted',
        };
      case 'filtered-empty':
        return {
          icon: Search,
          title: title || 'No matches found',
          description: description || 'Try adjusting your filters or search terms.',
          iconClass: 'text-text-muted',
        };
      case 'error':
        return {
          icon: AlertCircle,
          title: title || 'Failed to load data',
          description: description || 'There was an error communicating with the monitoring service.',
          iconClass: 'text-error',
        };
      case 'stale':
        return {
          icon: Clock,
          title: title || 'Data is stale',
          description: description || 'The last synchronization attempt failed or is lagging.',
          iconClass: 'text-stale',
        };
      case 'unauthorized':
        return {
          icon: ShieldAlert,
          title: title || 'Restricted Access',
          description: description || 'You do not have the required permissions to view this data.',
          iconClass: 'text-warning',
        };
      case 'partial':
        return {
          icon: RefreshCw,
          title: title || 'Partial data available',
          description: description || 'Some sources are still syncing or currently unreachable.',
          iconClass: 'text-processing',
        };
      default:
        return {
          icon: Inbox,
          title: 'Unknown state',
          description: '',
          iconClass: '',
        };
    }
  };

  const config = getConfig();
  const Icon = CustomIcon || config.icon;

  if (type === 'compact-loading') {
    return (
      <div className={cn('ui-info-state compact', className)}>
        <Icon size={16} className={config.iconClass} />
        {config.title && <span className="compact-text">{config.title}</span>}
      </div>
    );
  }

  return (
    <div className={cn('ui-info-state', `type-${type}`, className)}>
      <div className="info-icon-wrapper">
        <Icon size={32} className={config.iconClass} />
      </div>
      <div className="info-content">
        <h3 className="info-title">{config.title}</h3>
        {config.description && <p className="info-description">{config.description}</p>}
      </div>
      {action && <div className="info-action">{action}</div>}
    </div>
  );
};

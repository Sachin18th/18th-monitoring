import React from 'react';
import { LucideIcon } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface RoleCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  isSelected?: boolean;
  onClick?: () => void;
}

export const RoleCard: React.FC<RoleCardProps> = ({ 
  title, 
  description, 
  icon: Icon, 
  isSelected, 
  onClick 
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all duration-200',
        isSelected 
          ? 'bg-blue-50 border-blue-600 dark:bg-blue-600/10 dark:border-blue-500' 
          : 'bg-white border-slate-100 dark:bg-slate-800/50 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-800'
      )}
    >
      <div className={cn(
        'w-10 h-10 rounded-lg flex items-center justify-center transition-colors',
        isSelected 
          ? 'bg-blue-600 text-white' 
          : 'bg-slate-50 text-slate-400 dark:bg-slate-800 group-hover:bg-blue-50 group-hover:text-blue-600'
      )}>
        <Icon size={20} />
      </div>
      <div className="flex-1">
        <h4 className={cn(
          'text-sm font-bold transition-colors',
          isSelected ? 'text-blue-700 dark:text-blue-400' : 'text-slate-900 dark:text-slate-100'
        )}>
          {title}
        </h4>
        <p className={cn(
          'text-xs mt-0.5 transition-colors',
          isSelected ? 'text-blue-600/70 dark:text-blue-400/70' : 'text-slate-500 dark:text-slate-400'
        )}>
          {description}
        </p>
      </div>
    </button>
  );
};

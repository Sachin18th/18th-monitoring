import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Typography } from '../Typography';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface PageLayoutProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const PageLayout: React.FC<PageLayoutProps> = ({ 
  title, 
  subtitle, 
  icon,
  eyebrow,
  actions, 
  children, 
  className 
}) => {
  return (
    <div className={cn('flex flex-col gap-8 min-w-0', className)}>
      <header className="flex items-center justify-between gap-6 pb-2 border-b border-border-subtle/50 relative">
        <div className="flex items-center gap-5 flex-1 min-w-0">
          {icon && (
            <div className="w-12 h-12 flex items-center justify-center rounded-2xl bg-bg-surface border border-border-subtle text-primary shrink-0 shadow-sm group hover:scale-105 transition-transform duration-300">
               <div className="absolute inset-0 bg-primary/5 rounded-2xl opacity-50" />
               <div className="relative">
                  {React.cloneElement(icon as React.ReactElement, { size: 28, strokeWidth: 2.2 })}
               </div>
            </div>
          )}
          <div className="flex flex-col min-w-0 translate-y-[2px]">
            {eyebrow && <div className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted mb-0.5 opacity-60">{eyebrow}</div>}
            <div className="flex items-center gap-3">
               <Typography variant="h1" noMargin className="text-3xl font-black tracking-tight text-text-primary capitalize">
                 {title}
               </Typography>
               <div className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
            </div>
            {subtitle && (
              <Typography variant="body" noMargin className="text-[13px] font-medium text-text-muted/80 max-w-2xl mt-1 tracking-tight leading-relaxed">
                {subtitle}
              </Typography>
            )}
          </div>
        </div>
        {actions && (
           <div className="flex items-center gap-4 shrink-0 px-2 py-1 bg-bg-surface border border-border-subtle rounded-2xl shadow-sm">
              {actions}
           </div>
        )}
      </header>
      
      <div className="page-content animate-in fade-in slide-in-from-bottom-4 duration-700">
        {children}
      </div>
    </div>
  );
};

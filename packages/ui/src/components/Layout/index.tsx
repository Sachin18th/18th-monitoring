import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const Container: React.FC<React.HTMLAttributes<HTMLDivElement> & { size?: 'sm' | 'md' | 'lg' | 'xl' | 'full' }> = ({ 
  className, 
  size = 'xl', 
  children, 
  ...props 
}) => {
  return (
    <div className={cn('ui-container', `size-${size}`, className)} {...props}>
      {children}
    </div>
  );
};

export const Grid: React.FC<React.HTMLAttributes<HTMLDivElement> & { cols?: number; gap?: number }> = ({ 
  className, 
  cols = 12, 
  gap = 4, 
  children, 
  ...props 
}) => {
  return (
    <div 
      className={cn('ui-grid', className)} 
      style={{ 
        display: 'grid', 
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: `var(--space-${gap})`
      }} 
      {...props}
    >
      {children}
    </div>
  );
};

export const Col: React.FC<React.HTMLAttributes<HTMLDivElement> & { span?: number; sm?: number; md?: number; lg?: number }> = ({ 
  className, 
  span = 12, 
  sm, md, lg,
  children, 
  ...props 
}) => {
  return (
    <div 
      className={cn(
        'ui-col', 
        `span-${span}`,
        sm && `sm-span-${sm}`,
        md && `md-span-${md}`,
        lg && `lg-span-${lg}`,
        className
      )} 
      {...props}
    >
      {children}
    </div>
  );
};

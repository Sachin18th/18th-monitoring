import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  padding?: 'none' | 'sm' | 'md' | 'lg';
  isHoverable?: boolean;
  title?: React.ReactNode;
  description?: React.ReactNode;
  extra?: React.ReactNode;
  footer?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ 
  className, 
  padding = 'md', 
  isHoverable = false, 
  title,
  description,
  extra,
  footer,
  children, 
  ...props 
}) => {
  return (
    <div 
      className={cn(
        'ui-card', 
        `ui-card--${padding}`, 
        isHoverable && 'is-hoverable', 
        className
      )} 
      {...props}
    >
      {(title || description || extra) && (
        <div className="ui-card-header">
          <div className="ui-card-heading">
            {title ? <div className="ui-card-title">{title}</div> : null}
            {description ? <div className="ui-card-description">{description}</div> : null}
          </div>
          {extra ? <div className="ui-card-extra">{extra}</div> : null}
        </div>
      )}
      {children}
      {footer ? <div className="ui-card-footer">{footer}</div> : null}
    </div>
  );
};

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, children, ...props }) => (
  <div className={cn('ui-card-header', className)} {...props}>
    {children}
  </div>
);

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, children, ...props }) => (
  <div className={cn('ui-card-content', className)} {...props}>
    {children}
  </div>
);

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, children, ...props }) => (
  <div className={cn('ui-card-footer', className)} {...props}>
    {children}
  </div>
);

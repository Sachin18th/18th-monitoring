import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface TypographyProps extends React.HTMLAttributes<HTMLHeadingElement | HTMLParagraphElement> {
  variant?: 'display' | 'h1' | 'h2' | 'h3' | 'body' | 'caption' | 'micro';
  weight?: 'light' | 'normal' | 'medium' | 'semibold' | 'bold';
  align?: 'left' | 'center' | 'right';
  color?: 'primary' | 'secondary' | 'muted' | 'success' | 'warning' | 'error' | 'info' | 'inverse';
  noMargin?: boolean;
}

export const Typography: React.FC<TypographyProps> = ({
  variant = 'body',
  weight,
  align,
  color,
  noMargin = false,
  className,
  children,
  ...props
}) => {
  const Component = 
    variant === 'display' || variant === 'h1' ? 'h1' :
    variant === 'h2' ? 'h2' :
    variant === 'h3' ? 'h3' : 'p';

  return (
    <Component
      className={cn(
        'ui-typography',
        `variant-${variant}`,
        weight && `weight-${weight}`,
        align && `align-${align}`,
        color && `color-${color}`,
        noMargin && 'no-margin',
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
};

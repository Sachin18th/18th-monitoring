import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className = '' }) => {
  return (
    <div className={`rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur-md shadow-xl overflow-hidden ${className}`}>
      {children}
    </div>
  );
};

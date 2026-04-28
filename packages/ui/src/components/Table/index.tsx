import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const Table: React.FC<React.TableHTMLAttributes<HTMLTableElement>> = ({ className, children, ...props }) => (
  <div className="ui-table-container">
    <table className={cn('ui-table', className)} {...props}>
      {children}
    </table>
  </div>
);

export const THead: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({ className, children, ...props }) => (
  <thead className={cn('ui-thead', className)} {...props}>{children}</thead>
);

export const TBody: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({ className, children, ...props }) => (
  <tbody className={cn('ui-tbody', className)} {...props}>{children}</tbody>
);

export const TR: React.FC<React.HTMLAttributes<HTMLTableRowElement>> = ({ className, children, ...props }) => (
  <tr className={cn('ui-tr', className)} {...props}>{children}</tr>
);

export const TH: React.FC<React.ThHTMLAttributes<HTMLTableHeaderCellElement>> = ({ className, children, ...props }) => (
  <th className={cn('ui-th', className)} {...props}>{children}</th>
);

export const TD: React.FC<React.TdHTMLAttributes<HTMLTableDataCellElement>> = ({ className, children, ...props }) => (
  <td className={cn('ui-td', className)} {...props}>{children}</td>
);

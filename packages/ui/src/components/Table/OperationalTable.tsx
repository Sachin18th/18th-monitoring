import React from 'react';
import { 
  Table, 
  THead, 
  TBody, 
  TR, 
  TH, 
  TD 
} from './index';
import { InformationState } from '../Feedback/InformationState';
import { ArrowUpDown } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface Column<T> {
  key: string;
  header: string;
  render?: (value: any, item: T) => React.ReactNode;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

export interface OperationalTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (item: T) => void;
  rowActions?: (item: T) => React.ReactNode;
  getRowKey?: (item: T) => string | number;
  isDense?: boolean;
  className?: string;
}

export function OperationalTable<T extends { id?: string | number }>({
  columns,
  data,
  isLoading,
  isEmpty,
  emptyTitle,
  emptyDescription,
  onRowClick,
  rowActions,
  getRowKey,
  isDense,
  className
}: OperationalTableProps<T>) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 w-full p-8 animate-pulse">
        <div className="h-10 w-full bg-bg-muted rounded-lg" />
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-12 w-full bg-bg-muted/50 rounded-lg" />
        ))}
      </div>
    );
  }

  if (isEmpty || (!data?.length && !isLoading)) {
    return (
      <div className="p-12 border border-dashed border-border-subtle rounded-2xl flex flex-col items-center justify-center text-center gap-4 bg-bg-muted/10">
        <div className="p-4 bg-bg-surface rounded-full shadow-sm text-text-muted">
           <InformationState type="empty" title={emptyTitle} description={emptyDescription} />
        </div>
      </div>
    );
  }

  return (
    <div className={cn('ui-table-container', className)}>
      <Table className={cn(isDense && 'ui-table--dense')}>
        <THead>
          <TR>
            {columns.map((col) => (
              <TH 
                key={col.key} 
                style={{ width: col.width, textAlign: col.align || 'left' }}
              >
                <div className={cn(
                  "flex items-center gap-2",
                  col.align === 'right' && "justify-end",
                  col.align === 'center' && "justify-center"
                )}>
                  {col.header}
                  {col.sortable && <ArrowUpDown size={12} className="opacity-40" />}
                </div>
              </TH>
            ))}
            {rowActions && <TH style={{ width: '60px' }} />}
          </TR>
        </THead>
        <TBody>
          {data.map((item, index) => {
            if (!item) return null;
            const rowKey = getRowKey ? getRowKey(item) : item.id || index;
            return (
              <TR 
                key={rowKey} 
                onClick={onRowClick ? () => onRowClick(item) : undefined}
                className={cn(
                  'group transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-primary/5'
                )}
              >
                {columns.map((col) => (
                  <TD 
                    key={col.key} 
                    style={{ textAlign: col.align || 'left' }}
                    className="group-hover:text-text-primary transition-colors"
                  >
                    {col.render ? col.render((item as any)[col.key], item) : (item as any)[col.key]}
                  </TD>
                ))}
                {rowActions && (
                  <TD className="actions-cell">
                    <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      {rowActions(item)}
                    </div>
                  </TD>
                )}
              </TR>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}

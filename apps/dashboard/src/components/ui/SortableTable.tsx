'use client';
import React, { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

export interface TableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render?: (value: any, row: any) => React.ReactNode;
}

interface SortableTableProps {
  columns: TableColumn[];
  data: any[];
  /** Max rows per page (default 10) */
  pageSize?: number;
  emptyMessage?: string;
  loading?: boolean;
  className?: string;
  title?: string;
}

type SortDir = 'asc' | 'desc' | null;

/**
 * SortableTable — unified data table with column sort, pagination, and empty state.
 * Usage: pass `columns` config and `data` array. Sorting is client-side.
 */
export const SortableTable: React.FC<SortableTableProps> = ({
  columns,
  data,
  pageSize = 10,
  emptyMessage = 'No data available',
  loading = false,
  className = '',
  title,
}) => {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [page, setPage] = useState(1);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : d === 'desc' ? null : 'asc'));
      if (sortDir === 'desc') setSortKey(null);
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  };

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return data;
    return [...data].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === bv) return 0;
      const cmp = av < bv ? -1 : 1;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageData = sorted.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div style={wrapperStyle} className={className}>
      {title && (
        <div style={tableTitleStyle}>
          <span style={{ fontWeight: 800, fontSize: '14px' }}>{title}</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {data.length} record{data.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead>
            <tr style={theadRowStyle}>
              {columns.map(col => (
                <th
                  key={col.key}
                  style={{
                    ...thStyle,
                    width: col.width,
                    textAlign: col.align || 'left',
                    cursor: col.sortable ? 'pointer' : 'default',
                    userSelect: 'none',
                  }}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: col.align === 'right' ? 'flex-end' : col.align === 'center' ? 'center' : 'flex-start' }}>
                    {col.label}
                    {col.sortable && (
                      <span style={{ opacity: sortKey === col.key ? 1 : 0.35, color: 'var(--primary)' }}>
                        {sortKey === col.key && sortDir === 'asc' ? (
                          <ChevronUp size={12} />
                        ) : sortKey === col.key && sortDir === 'desc' ? (
                          <ChevronDown size={12} />
                        ) : (
                          <ChevronsUpDown size={12} />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: Math.min(pageSize, 5) }).map((_, i) => (
                <tr key={`loading-${i}`} className="table-row">
                  {columns.map(col => (
                    <td key={col.key} style={{ ...tdStyle, textAlign: col.align || 'left' }}>
                      <div className="skeleton" style={{ height: '16px', width: col.width || '100%', maxWidth: '80%', opacity: 1 - (i * 0.15) }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : pageData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={emptyCellStyle}>
                  <div style={{ textAlign: 'center', padding: '32px 0' }}>
                    <div style={{ fontSize: '32px', marginBottom: '16px', filter: 'grayscale(1)', opacity: 0.2 }}>📭</div>
                    <div style={{ fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>{emptyMessage}</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>There are no records to display matching your criteria.</div>
                  </div>
                </td>
              </tr>
            ) : (
              pageData.map((row, i) => (
                <tr
                  key={row.id || i}
                  className="table-row"
                >
                  {columns.map(col => (
                    <td
                      key={col.key}
                      style={{ ...tdStyle, textAlign: col.align || 'left' }}
                    >
                      {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={paginationStyle}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Page {page} of {totalPages} · {data.length} total
          </span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={pageBtn(page === 1)}
            >← Prev</button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const p = i + 1;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  style={pageBtn(false, page === p)}
                >{p}</button>
              );
            })}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              style={pageBtn(page === totalPages)}
            >Next →</button>
          </div>
        </div>
      )}
    </div>
  );
};

const wrapperStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-xl)',
  overflow: 'hidden',
};

const tableTitleStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '14px 20px',
  borderBottom: '1px solid var(--border-subtle)',
  background: 'var(--bg-muted)',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '13px',
};

const theadRowStyle: React.CSSProperties = {
  background: 'var(--bg-muted)',
  borderBottom: '1px solid var(--border-subtle)',
};

const thStyle: React.CSSProperties = {
  padding: '10px 16px',
  fontSize: '10px',
  fontWeight: 800,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  color: 'var(--text-secondary)',
  fontSize: '13px',
  verticalAlign: 'middle',
};

const emptyCellStyle: React.CSSProperties = {
  padding: '48px 20px',
  color: 'var(--text-muted)',
  fontSize: '13px',
};

const paginationStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 20px',
  borderTop: '1px solid var(--border-subtle)',
  background: 'var(--bg-muted)',
};

const pageBtn = (disabled: boolean, active = false): React.CSSProperties => ({
  padding: '4px 10px',
  borderRadius: '6px',
  border: '1px solid var(--border-subtle)',
  background: active ? 'var(--primary)' : 'var(--bg-surface)',
  color: active ? '#fff' : disabled ? 'var(--text-muted)' : 'var(--text-primary)',
  fontWeight: 700,
  fontSize: '12px',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
  transition: 'all 0.15s ease',
  boxShadow: active ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
});

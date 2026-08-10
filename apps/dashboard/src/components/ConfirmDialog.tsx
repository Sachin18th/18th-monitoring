'use client';

import React, { useCallback, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

export type ConfirmOptions = {
  title?: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

/**
 * Promise-based confirmation dialog — a real in-app popup, not window.confirm().
 *
 *   const { confirm, dialog } = useConfirm();
 *   ...
 *   if (!(await confirm({ title: 'Delete', message: '…', danger: true }))) return;
 *   ...
 *   return (<div>…{dialog}</div>);   // render `dialog` once in the tree
 */
export function useConfirm() {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    setOpts(options);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    resolver.current?.(result);
    resolver.current = null;
    setOpts(null);
  }, []);

  const dialog = opts ? (
    <ConfirmDialog options={opts} onConfirm={() => settle(true)} onCancel={() => settle(false)} />
  ) : null;

  return { confirm, dialog };
}

function ConfirmDialog({ options, onConfirm, onCancel }: { options: ConfirmOptions; onConfirm: () => void; onCancel: () => void }) {
  const { title = 'Are you sure?', message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger } = options;
  const accent = danger ? '#ef4444' : '#22d3ee';

  return (
    <div
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 1100 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 440, background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: 12, padding: 22, boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ display: 'flex', width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', background: `${accent}1a`, color: accent }}>
            <AlertTriangle size={17} />
          </span>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</span>
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 20 }}>{message}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={onCancel}
            autoFocus
            style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: '1px solid var(--border-card)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', background: accent, color: danger ? '#fff' : '#04252b', cursor: 'pointer' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

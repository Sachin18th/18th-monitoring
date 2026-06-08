'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Code2, Copy, Check, Globe } from 'lucide-react';

interface RumInstallCardProps {
  apiBase: string;
  projectId: string;
  connectors: Array<{ id: string; name: string; provider: string }>;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  borderRadius: '10px',
  border: '1px solid var(--border-input)',
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  padding: '9px 12px',
  fontSize: '13px',
  outline: 'none',
};

/**
 * Renders a ready-to-paste RUM install snippet with the platform host, project,
 * and connector pre-filled — no <placeholders> for the merchant to get wrong.
 * The host is editable because it must be the *public* API host (a real
 * storefront cannot reach localhost).
 */
export const RumInstallCard: React.FC<RumInstallCardProps> = ({ apiBase, projectId, connectors }) => {
  const defaultHost = useMemo(() => {
    const base = String(apiBase || '').replace(/\/+$/, '');
    if (base) return base;
    if (typeof window !== 'undefined') return window.location.origin;
    return 'https://your-platform-host';
  }, [apiBase]);

  const [host, setHost] = useState(defaultHost);
  const [connectorId, setConnectorId] = useState(connectors[0]?.id || '');
  const [copied, setCopied] = useState(false);

  // connectors load async, so the useState initializer above runs while the list
  // is still empty. Set a default (and self-heal if the current selection drops
  // out of the list) once connectors are available.
  useEffect(() => {
    if (connectors.length === 0) return;
    const stillPresent = connectorId && connectors.some((c) => c.id === connectorId);
    if (!stillPresent) {
      setConnectorId(connectors[0].id);
    }
  }, [connectors, connectorId]);

  const cleanHost = host.replace(/\/+$/, '');
  const snippet = `<script src="${cleanHost}/api/rum/rum.js"
        data-ingest-url="${cleanHost}/api/rum/errors"
        data-project-id="${projectId}"
        data-connector-id="${connectorId || '<select a store>'}">
</script>`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — user can still select the text manually */
    }
  };

  const isLocalHost = /localhost|127\.0\.0\.1/.test(cleanHost);

  return (
    <div
      style={{
        borderRadius: '16px',
        border: '1px solid var(--border-card)',
        background: 'var(--bg-card)',
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Code2 size={18} style={{ color: '#818cf8' }} />
        <div>
          <p style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>Install Storefront Monitoring (RUM)</p>
          <p style={{ margin: '2px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
            Paste this into your storefront <code>&lt;head&gt;</code> to start capturing JS, network &amp; resource errors.
          </p>
        </div>
      </div>

      {/* Host + connector selectors */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-label)', fontWeight: 700 }}>Platform host</span>
          <span style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Globe size={14} style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)' }} />
            <input value={host} onChange={(e) => setHost(e.target.value)} style={{ ...inputStyle, paddingLeft: '30px' }} placeholder="https://api.yourdomain.com" />
          </span>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-label)', fontWeight: 700 }}>Store (connector)</span>
          <select value={connectorId} onChange={(e) => setConnectorId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
            {connectors.length === 0 ? <option value="">Connect a store first</option> : null}
            {connectors.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.provider ? ` — ${c.provider}` : ''}</option>
            ))}
          </select>
        </label>
      </div>

      {isLocalHost ? (
        <div style={{ borderRadius: '10px', border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.08)', padding: '10px 12px', fontSize: '12px', color: 'var(--warning-text)' }}>
          This host is local — a live storefront can&apos;t reach it. Set it to your <strong>public</strong> deployed API host before installing.
        </div>
      ) : null}

      {/* Snippet + copy */}
      <div style={{ position: 'relative', borderRadius: '12px', border: '1px solid var(--border-card)', background: 'var(--bg-page)', padding: '16px', paddingRight: '48px' }}>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: '12.5px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>{snippet}</pre>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy snippet"
          style={{ position: 'absolute', top: '12px', right: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: copied ? 'var(--success-text)' : 'var(--text-primary)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* Per-platform placement hints */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', fontSize: '12px', color: 'var(--text-muted)' }}>
        <span><strong style={{ color: 'var(--text-secondary)' }}>Shopify:</strong> Online Store → Themes → Edit code → <code>theme.liquid</code>, inside <code>&lt;head&gt;</code>.</span>
        <span><strong style={{ color: 'var(--text-secondary)' }}>Adobe Commerce:</strong> add to <code>default_head_blocks.xml</code> (layout XML).</span>
      </div>
    </div>
  );
};

export default RumInstallCard;

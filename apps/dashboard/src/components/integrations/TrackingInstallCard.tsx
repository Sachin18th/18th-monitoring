'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Code2,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  Radio,
} from 'lucide-react';

type Platform = 'shopify' | 'bigcommerce' | 'adobe';

interface TrackingInstallCardProps {
  connectorInstanceId?: string;
  ingestBaseUrl?: string;
  // Platform of the currently-selected store. When provided, the card opens on
  // that platform's tab so the merchant sees the instructions for the store they
  // actually connected. Accepts the connector platform code ('adobe_commerce')
  // as well as the card's own 'adobe' alias.
  platform?: Platform | 'adobe_commerce';
}

// Normalises the connector-context platform code ('adobe_commerce') to the tab
// key this card uses ('adobe'). Unknown values fall back to Shopify.
const toPlatformKey = (value?: string | null): Platform => {
  const v = String(value || '').toLowerCase();
  if (v.includes('adobe') || v.includes('magento')) return 'adobe';
  if (v.includes('bigcommerce')) return 'bigcommerce';
  return 'shopify';
};

type VerifyState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'verified'; total: number }
  | { status: 'pending' } // no events yet
  | { status: 'error'; message: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUuid = (v?: string | null): boolean => !!v && UUID_RE.test(v.trim());

const PLATFORMS: Array<{ key: Platform; label: string }> = [
  { key: 'shopify', label: 'Shopify' },
  { key: 'bigcommerce', label: 'BigCommerce' },
  { key: 'adobe', label: 'Adobe Commerce' },
];

// ── Shared styles (match the project's CSS-variable design language) ─────────
const card: React.CSSProperties = {
  borderRadius: '16px',
  border: '1px solid var(--border-card)',
  background: 'var(--bg-card)',
  padding: '20px 24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
};
const labelCaps: React.CSSProperties = {
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--text-label)',
  fontWeight: 700,
};
const codeText: React.CSSProperties = {
  margin: 0,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
  fontSize: '12.5px',
  lineHeight: 1.6,
  color: 'var(--text-secondary)',
};

/** A code block with its own copy-to-clipboard button ("Copied!" for 2s). */
const CodeBlock: React.FC<{ code: string; label?: string }> = ({ code, label }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the text is still selectable */
    }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {label ? <span style={labelCaps}>{label}</span> : null}
      <div
        style={{
          position: 'relative',
          borderRadius: '12px',
          border: '1px solid var(--border-card)',
          background: 'var(--bg-page)',
          padding: '16px',
          paddingRight: '92px',
        }}
      >
        <pre style={codeText}>{code}</pre>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy code"
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 10px',
            borderRadius: '8px',
            border: '1px solid var(--border-input)',
            background: 'var(--bg-input)',
            color: copied ? 'var(--success-text)' : 'var(--text-primary)',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
};

/** Collapsible section, closed by default. */
const Collapsible: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderRadius: '12px', border: '1px solid var(--border-card)', overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 14px',
          background: 'var(--bg-input)',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-primary)',
          fontSize: '13px',
          fontWeight: 700,
          textAlign: 'left',
        }}
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        {title}
      </button>
      {open ? <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>{children}</div> : null}
    </div>
  );
};

const Step: React.FC<{ n: number; children: React.ReactNode }> = ({ n, children }) => (
  <div style={{ display: 'flex', gap: '10px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
    <span
      style={{
        flex: '0 0 auto',
        width: '20px',
        height: '20px',
        borderRadius: '50%',
        background: 'var(--bg-input)',
        border: '1px solid var(--border-input)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '11px',
        fontWeight: 700,
        color: 'var(--text-primary)',
      }}
    >
      {n}
    </span>
    <span>{children}</span>
  </div>
);

export const TrackingInstallCard: React.FC<TrackingInstallCardProps> = ({
  connectorInstanceId,
  ingestBaseUrl,
  platform: platformProp,
}) => {
  // CRITICAL: the connector id is populated via an effect that watches the prop,
  // never in a useState initialiser — the prop arrives async (after the store
  // selection resolves) and a useState initialiser would freeze the first
  // (often empty) value.
  const [connectorId, setConnectorId] = useState<string>('');
  useEffect(() => {
    setConnectorId(isValidUuid(connectorInstanceId) ? connectorInstanceId!.trim() : '');
  }, [connectorInstanceId]);

  const [platform, setPlatform] = useState<Platform>(() => toPlatformKey(platformProp));
  // Follow the selected store's platform: when the merchant switches the active
  // store (and its platform changes), re-open the matching tab.
  useEffect(() => {
    if (platformProp) setPlatform(toPlatformKey(platformProp));
  }, [platformProp]);
  const [verify, setVerify] = useState<VerifyState>({ status: 'idle' });
  // Whole-card collapse: the install guidance is long, so let merchants fold it
  // away once the snippet is in place. Open by default so first-time setup is
  // visible without a click.
  const [bodyOpen, setBodyOpen] = useState(true);

  // Reset the verification result whenever the active store changes.
  useEffect(() => {
    setVerify({ status: 'idle' });
  }, [connectorId]);

  const host = useMemo(() => {
    // Prefer an explicit prop, then the configured public/tunnel base URL, and
    // only fall back to the current origin (localhost in dev) as a last resort —
    // the snippet must point a real storefront at a public host, not localhost.
    const base = String(ingestBaseUrl || process.env.NEXT_PUBLIC_TRACKER_BASE_URL || '').replace(/\/+$/, '');
    if (base) return base;
    if (typeof window !== 'undefined') return window.location.origin;
    return 'https://your-platform-host';
  }, [ingestBaseUrl]);

  const ready = isValidUuid(connectorId);

  const snippet = useMemo(
    () =>
      `<script src="${host}/api/track/tracker.js"\n        data-connector-id="${connectorId}"\n        data-ingest-url="${host}/api/track"\n        async></script>`,
    [host, connectorId],
  );

  // Shopify snippet enriched with logged-in shopper identity. Shopify's `customer`
  // Liquid object is rendered per-request in theme.liquid, so templating the
  // data-customer-* attributes onto the tag is the most authoritative identity
  // source (the tracker reads these attributes first, before any DOM probe).
  const shopifySnippet = useMemo(
    () =>
      `<script\n  src="${host}/api/track/tracker.js"\n  data-connector-id="${connectorId}"\n  data-ingest-url="${host}/api/track"\n  {% if customer %}\n    data-customer-id="{{ customer.id }}"\n    data-customer-name="{{ customer.name | escape }}"\n    data-customer-email="{{ customer.email }}"\n  {% endif %}\n  async></script>`,
    [host, connectorId],
  );

  // Shopify Custom Web Pixel — an alternative to the theme.liquid tag. Runs in
  // Shopify's sandboxed pixel worker (no theme edit), subscribing to the
  // standard customer events and forwarding them to /api/track in the exact
  // envelope the tracker uses ({ connector_instance_id, events: [...] }).
  const webPixelSnippet = useMemo(
    () =>
      `// Shopify admin → Settings → Customer events → Add custom pixel → paste below → Save & Connect.
const CONNECTOR_INSTANCE_ID = "${connectorId}";
const INGEST_URL = "${host}/api/track";

// One session id per pixel-worker lifetime (survives SPA navigation).
const SESSION_ID = "wp_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

function track(event, eventType, properties) {
  try {
    const ctx = (event && event.context) || {};
    const loc = (ctx.document && ctx.document.location) || {};
    fetch(INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        connector_instance_id: CONNECTOR_INSTANCE_ID,
        events: [{
          event_type: eventType,
          session_id: SESSION_ID,
          visitor_id: event.clientId || null,
          page_url: loc.href || null,
          page_title: (ctx.document && ctx.document.title) || null,
          occurred_at: new Date(event.timestamp || Date.now()).toISOString(),
          properties: properties || {}
        }]
      })
    });
  } catch (e) {}
}

analytics.subscribe("page_viewed", (event) => track(event, "page_view", {}));

analytics.subscribe("product_viewed", (event) => {
  const v = event.data && event.data.productVariant;
  track(event, "product_view", v ? {
    product_id: v.product && v.product.id,
    product_name: v.product && v.product.title,
    price: v.price && v.price.amount
  } : {});
});

analytics.subscribe("product_added_to_cart", (event) => {
  const m = event.data && event.data.cartLine && event.data.cartLine.merchandise;
  track(event, "add_to_cart", m ? {
    product_id: m.product && m.product.id,
    product_name: m.product && m.product.title,
    price: m.price && m.price.amount
  } : {});
});

analytics.subscribe("checkout_started", (event) => track(event, "checkout_step", { step: "checkout_started" }));

analytics.subscribe("checkout_completed", (event) => {
  const c = event.data && event.data.checkout;
  track(event, "checkout_complete", c ? {
    order_id: c.order && c.order.id,
    order_number: c.order && c.order.id,
    total: c.totalPrice && c.totalPrice.amount,
    currency: c.currencyCode
  } : {});
});`,
    [host, connectorId],
  );

  const runVerify = useCallback(async () => {
    if (!ready) return;
    setVerify({ status: 'loading' });
    try {
      const token =
        typeof window !== 'undefined' ? window.localStorage.getItem('session-token') : null;
      const url = `${host}/api/track/events?connector_instance_id=${encodeURIComponent(connectorId)}&limit=1`;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}`, 'session-token': token } : {}),
        },
      });
      if (!res.ok) {
        const msg =
          res.status === 401 || res.status === 403
            ? 'Not authorised — sign in with an analyst (or higher) account.'
            : `Verification request failed (HTTP ${res.status}).`;
        setVerify({ status: 'error', message: msg });
        return;
      }
      const json: any = await res.json().catch(() => ({}));
      const data = json?.data ?? json;
      const events = Array.isArray(data?.events) ? data.events : [];
      const total = Number(data?.total ?? events.length) || 0;
      if (events.length > 0 || total > 0) {
        setVerify({ status: 'verified', total });
      } else {
        setVerify({ status: 'pending' });
      }
    } catch (err: any) {
      setVerify({ status: 'error', message: err?.message || 'Could not reach the API.' });
    }
  }, [ready, host, connectorId]);

  // ── Header ────────────────────────────────────────────────────────────────
  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <Code2 size={18} style={{ color: '#818cf8' }} />
      <div>
        <p style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
          Install Storefront Tracking
        </p>
        <p style={{ margin: '2px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
          Capture sessions, page &amp; product views, clicks and the checkout funnel.
        </p>
      </div>
    </div>
  );

  // ── Disabled placeholder until a valid connector UUID is provided ──────────
  if (!ready) {
    return (
      <div style={{ ...card, opacity: 0.85 }}>
        {header}
        <div
          style={{
            borderRadius: '12px',
            border: '1px dashed var(--border-input)',
            background: 'var(--bg-page)',
            padding: '28px 16px',
            textAlign: 'center',
            fontSize: '13px',
            color: 'var(--text-muted)',
          }}
        >
          Select a connected store to view install instructions
        </div>
      </div>
    );
  }

  return (
    <div style={card}>
      {/* keyframes for the verify spinner */}
      <style>{'@keyframes tic-spin{to{transform:rotate(360deg)}}'}</style>

      {/* Clickable header — collapses the whole guidance (open/close). */}
      <button
        type="button"
        onClick={() => setBodyOpen((o) => !o)}
        aria-expanded={bodyOpen}
        style={{
          appearance: 'none',
          border: 'none',
          background: 'transparent',
          padding: 0,
          margin: 0,
          cursor: 'pointer',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
        }}
      >
        {header}
        <span
          style={{
            flex: '0 0 auto',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '30px',
            height: '30px',
            borderRadius: '8px',
            border: '1px solid var(--border-input)',
            background: 'var(--bg-input)',
            color: 'var(--text-muted)',
          }}
        >
          {bodyOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>

      {bodyOpen && (
      <>
      {/* Platform tabs */}
      <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid var(--border-card)' }}>
        {PLATFORMS.map((p) => {
          const active = platform === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setPlatform(p.key)}
              style={{
                appearance: 'none',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: '10px 14px',
                fontSize: '13px',
                fontWeight: 700,
                color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                borderBottom: active ? '2px solid #818cf8' : '2px solid transparent',
                marginBottom: '-1px',
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Pre-substituted snippet for the active platform. Shopify carries the
          logged-in shopper identity via Liquid; the others use the base tag. */}
      <CodeBlock
        code={platform === 'shopify' ? shopifySnippet : snippet}
        label={`${PLATFORMS.find((p) => p.key === platform)!.label} — embed snippet`}
      />

      {/* Collapsible admin instructions, closed by default */}
      {platform === 'shopify' ? <ShopifyInstructions snippet={shopifySnippet} webPixelSnippet={webPixelSnippet} /> : null}
      {platform === 'bigcommerce' ? <BigCommerceInstructions /> : null}
      {platform === 'adobe' ? <AdobeInstructions host={host} connectorId={connectorId} /> : null}

      {/* Verify installation */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={runVerify}
            disabled={verify.status === 'loading'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 14px',
              borderRadius: '10px',
              border: '1px solid var(--border-input)',
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: 700,
              cursor: verify.status === 'loading' ? 'wait' : 'pointer',
            }}
          >
            {verify.status === 'loading' ? (
              <Loader2 size={15} style={{ animation: 'tic-spin 1s linear infinite' }} />
            ) : (
              <CheckCircle2 size={15} />
            )}
            Verify Installation
          </button>
          <VerifyResult state={verify} />
        </div>
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
          Install the snippet, then open your storefront and load a page or two before verifying.
        </p>
      </div>
      </>
      )}
    </div>
  );
};

const VerifyResult: React.FC<{ state: VerifyState }> = ({ state }) => {
  if (state.status === 'idle') return null;
  if (state.status === 'loading') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)' }}>
        <Loader2 size={14} style={{ animation: 'tic-spin 1s linear infinite' }} />
        Checking for events…
      </span>
    );
  }
  if (state.status === 'verified') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--success-text)', fontWeight: 700 }}>
        <CheckCircle2 size={15} /> Installed — events received{state.total ? ` (${state.total}+)` : ''}
      </span>
    );
  }
  if (state.status === 'pending') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--warning-text)', fontWeight: 700 }}>
        <Clock size={15} /> No events yet — load your storefront, then retry.
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--error-text, #ef4444)', fontWeight: 700 }}>
      <AlertCircle size={15} /> {state.message}
    </span>
  );
};

// ── Per-platform instruction bodies ─────────────────────────────────────────

const ShopifyInstructions: React.FC<{ snippet: string; webPixelSnippet: string }> = ({ snippet, webPixelSnippet }) => (
  <Collapsible title="Admin instructions — Shopify">
    <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Method A — theme.liquid</p>
    <Step n={1}>Shopify admin → <strong>Online Store</strong> → <strong>Themes</strong>.</Step>
    <Step n={2}>On your live theme: <strong>⋯ (Actions)</strong> → <strong>Edit code</strong>.</Step>
    <Step n={3}>Under <strong>Layout</strong>, open <code>theme.liquid</code>.</Step>
    <Step n={4}>Paste the snippet immediately before the closing <code>&lt;/head&gt;</code> tag, then <strong>Save</strong>.</Step>
    <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.55 }}>
      The <code>{'{% if customer %}'}</code> block stamps the logged-in shopper&apos;s id, name and
      email onto the tag so sessions are attributed to a known customer. Shopify only exposes
      these to Liquid, so this is the most reliable identity source — guests simply omit them.
    </p>
    <p style={{ margin: '6px 0 0', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Method B — Theme App Extension (App Embed Block)</p>
    <Step n={1}>Add a <code>blocks/tracker.liquid</code> to your theme app extension with the schema below.</Step>
    <Step n={2}>Merchant enables it via <strong>Customize</strong> → <strong>App embeds</strong> and fills in the Connector ID + API Host.</Step>
    <CodeBlock
      label="blocks/tracker.liquid"
      code={`${snippet.replace(/data-connector-id="[^"]*"/, 'data-connector-id="{{ block.settings.connector_id }}"').replace(/src="([^"]*)\/api\/track\/tracker\.js"/, 'src="{{ block.settings.api_host }}/api/track/tracker.js"').replace(/data-ingest-url="([^"]*)\/api\/track"/, 'data-ingest-url="{{ block.settings.api_host }}/api/track"')}

{% schema %}
{
  "name": "Storefront Tracker",
  "target": "head",
  "settings": [
    { "type": "text", "id": "connector_id", "label": "Connector ID" },
    { "type": "text", "id": "api_host", "label": "API Host" }
  ]
}
{% endschema %}`}
    />
    <p style={{ margin: '6px 0 0', display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
      <Radio size={15} style={{ color: '#818cf8', flexShrink: 0 }} />
      Method C — Custom Web Pixel (no theme edit)
    </p>
    <div
      style={{
        borderRadius: '10px',
        border: '1px solid rgba(59,130,246,0.28)',
        background: 'rgba(59,130,246,0.08)',
        padding: '10px 12px',
        fontSize: '12px',
        color: 'var(--text-secondary)',
        lineHeight: 1.55,
      }}
    >
      A <strong>custom pixel</strong> runs in Shopify&apos;s sandboxed events worker, so it needs no
      theme code and survives theme updates. It subscribes to Shopify&apos;s standard customer events
      and forwards them to the ingest endpoint. Use this <em>or</em> Method A — not both, or events
      double-count.
    </div>
    <Step n={1}>Shopify admin → <strong>Settings</strong> → <strong>Customer events</strong>.</Step>
    <Step n={2}>Click <strong>Add custom pixel</strong>, give it a name (e.g. Storefront Tracker).</Step>
    <Step n={3}>Paste the code below into the <strong>Code</strong> editor.</Step>
    <Step n={4}>Click <strong>Save</strong>, then <strong>Connect</strong> to activate the pixel.</Step>
    <CodeBlock label="Custom pixel code" code={webPixelSnippet} />
  </Collapsible>
);

const BigCommerceInstructions: React.FC = () => (
  <Collapsible title="Admin instructions — BigCommerce (Script Manager)">
    <Step n={1}>BigCommerce admin → <strong>Storefront</strong> → <strong>Script Manager</strong>.</Step>
    <Step n={2}>Click <strong>Create a Script</strong>.</Step>
    <Step n={3}>
      Set the fields exactly:
      <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
        <li><strong>Name</strong>: Storefront Tracker</li>
        <li><strong>Description</strong>: Session &amp; funnel event capture</li>
        <li><strong>Location on page</strong>: Head</li>
        <li><strong>Pages</strong>: All pages</li>
        <li><strong>Script category</strong>: Essential</li>
        <li><strong>Script type</strong>: Script</li>
      </ul>
    </Step>
    <Step n={4}>Paste the embed snippet (above) into <strong>Script contents</strong>, then <strong>Save</strong>.</Step>
  </Collapsible>
);

const AdobeInstructions: React.FC<{ host: string; connectorId: string }> = ({ host, connectorId }) => {
  const phtml = `<script src="${host}/api/track/tracker.js"\n        data-connector-id="${connectorId}"\n        data-ingest-url="${host}/api/track"\n        async></script>`;
  return (
    <Collapsible title="Admin instructions — Adobe Commerce (Magento 2)">
      <div
        style={{
          borderRadius: '10px',
          border: '1px solid rgba(59,130,246,0.28)',
          background: 'rgba(59,130,246,0.08)',
          padding: '10px 12px',
          fontSize: '12px',
          color: 'var(--text-secondary)',
          lineHeight: 1.55,
        }}
      >
        <strong>Customer identity is automatic on Adobe Commerce.</strong> The tracker reads the
        logged-in customer from Magento&apos;s <code>customer-data</code> section, so you don&apos;t add
        <code>data-customer-*</code> attributes to the tag. (Magento&apos;s Full Page Cache would serve a
        stale, cached identity if it were templated into the <code>&lt;head&gt;</code>.) Just install the
        base script in the store header below.
      </div>
      <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Method A — Custom module (developers)</p>
      <Step n={1}>Create <code>app/code/Vendor/StorefrontTracker/</code> with the four files below. The layout file adds the script to the <strong>store header</strong> (<code>&lt;head&gt;</code>) on every frontend page.</Step>
      <CodeBlock
        label="registration.php"
        code={`<?php
use Magento\\Framework\\Component\\ComponentRegistrar;

ComponentRegistrar::register(
    ComponentRegistrar::MODULE,
    'Vendor_StorefrontTracker',
    __DIR__
);`}
      />
      <CodeBlock
        label="etc/module.xml"
        code={`<?xml version="1.0"?>
<config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:noNamespaceSchemaLocation="urn:magento:framework:Module/etc/module.xsd">
    <module name="Vendor_StorefrontTracker" setup_version="1.0.0"/>
</config>`}
      />
      <CodeBlock
        label="view/frontend/layout/default_head_blocks.xml"
        code={`<?xml version="1.0"?>
<page xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:noNamespaceSchemaLocation="urn:magento:framework:View/Layout/etc/page_configuration.xsd">
    <head>
        <block class="Magento\\Framework\\View\\Element\\Template"
               name="storefront_tracker"
               template="Vendor_StorefrontTracker::tracker.phtml"/>
    </head>
</page>`}
      />
      <CodeBlock label="view/frontend/templates/tracker.phtml" code={phtml} />
      <CodeBlock
        label="CLI commands (from Magento root)"
        code={`bin/magento module:enable Vendor_StorefrontTracker
bin/magento setup:upgrade
bin/magento setup:di:compile            # production mode only
bin/magento setup:static-content:deploy # production mode only
bin/magento cache:flush`}
      />
      <p style={{ margin: '6px 0 0', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Method B — Admin CMS injection (non-developers)</p>
      <Step n={1}>Admin → <strong>Content</strong> → <strong>Design</strong> → <strong>Configuration</strong>.</Step>
      <Step n={2}>Edit the row for the target <strong>store view</strong>.</Step>
      <Step n={3}>Expand <strong>HTML Head</strong> → <strong>Scripts and Style Sheets</strong> and paste the embed snippet (above).</Step>
      <Step n={4}><strong>Save Configuration</strong>, then <strong>System</strong> → <strong>Cache Management</strong> → <strong>Flush Magento Cache</strong>.</Step>
      <div
        style={{
          borderRadius: '10px',
          border: '1px solid rgba(245,158,11,0.3)',
          background: 'rgba(245,158,11,0.08)',
          padding: '10px 12px',
          fontSize: '12px',
          color: 'var(--warning-text)',
        }}
      >
        <strong>Multi-store:</strong> a single Adobe Commerce install can run multiple websites / store views.
        Give <em>each store view its own Connector ID</em> so sessions don&apos;t merge. In Method B, edit each
        store view&apos;s Design Configuration row separately (or switch the config <strong>scope selector</strong> to
        that store view). In Method A, read the id from a store-scoped config value instead of hard-coding it.
        Map one connector instance to one store view.
      </div>
    </Collapsible>
  );
};

export default TrackingInstallCard;

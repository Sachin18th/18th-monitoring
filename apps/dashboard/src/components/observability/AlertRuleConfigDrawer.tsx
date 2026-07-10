'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Plus, Pencil, Trash2, BellRing, ArrowLeft, Gauge, ShoppingCart,
  AlertTriangle, Route, Users, Check, Mail, Plug, CreditCard,
} from 'lucide-react';
import { DiagnosticDrawer, useToast } from '@kpi-platform/ui';

/**
 * Plain-language alert templates. Each one hides the technical
 * metricFamily/metric/operator behind a phrase a non-technical user
 * understands. The builder lets them pick a template, type a number, and
 * choose who to notify — that's it.
 *
 * Keep `family` + `metric` in sync with apps/api/src/utils/alerting/rule-criteria.ts
 * and the evaluation logic in alert-engine.service.ts.
 */
type Direction = 'above' | 'below';
interface Template {
  id: string;
  categoryId: string;
  title: string;            // plain-language headline
  desc: string;             // one-line explanation
  family: string;           // metricFamily (backend)
  metric: string;           // metric (backend)
  dir: Direction;           // 'above' → operator '>', 'below' → operator '<'
  unit: string;             // suffix shown next to the number ('ms', 'orders', '%', …)
  subject: string;          // noun used in the preview sentence
  defaultThreshold: number;
  defaultWindow: number;    // minutes
  defaultSeverity: string;
}

interface Category { id: string; label: string; icon: React.ComponentType<{ size?: number }>; }

export const CATEGORIES: Category[] = [
  { id: 'performance', label: 'Site speed', icon: Gauge },
  { id: 'orders', label: 'Orders', icon: ShoppingCart },
  { id: 'errors', label: 'Storefront errors', icon: AlertTriangle },
  { id: 'journey', label: 'Customer journey', icon: Route },
  { id: 'sessions', label: 'Visitors', icon: Users },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'gateways', label: 'Payments & SMS', icon: CreditCard },
];

export const TEMPLATES: Template[] = [
  // ── Site speed ──
  { id: 'lcp_slow', categoryId: 'performance', title: 'LCP Threshold Exceeded', desc: 'Largest Contentful Paint (LCP) crosses your target — pages are loading too slowly for shoppers.', family: 'pagespeed', metric: 'lcp', dir: 'above', unit: 'ms', subject: 'page load time (LCP)', defaultThreshold: 2500, defaultWindow: 1440, defaultSeverity: 'HIGH' },
  { id: 'ttfb_slow', categoryId: 'performance', title: 'TTFB Latency Alert', desc: 'Time To First Byte (TTFB) exceeds your limit — server response is degraded.', family: 'pagespeed', metric: 'ttfb', dir: 'above', unit: 'ms', subject: 'server response time (TTFB)', defaultThreshold: 800, defaultWindow: 1440, defaultSeverity: 'MEDIUM' },
  { id: 'cls_high', categoryId: 'performance', title: 'Layout Stability Degraded (CLS)', desc: 'Cumulative Layout Shift (CLS) exceeds your threshold — visual instability detected.', family: 'pagespeed', metric: 'cls', dir: 'above', unit: '', subject: 'layout shift score (CLS)', defaultThreshold: 0.1, defaultWindow: 1440, defaultSeverity: 'MEDIUM' },
  { id: 'score_low', categoryId: 'performance', title: 'Core Web Vitals Score Below Target', desc: 'Overall performance score drops below your target — Core Web Vitals are degraded.', family: 'pagespeed', metric: 'score', dir: 'below', unit: '', subject: 'performance score', defaultThreshold: 70, defaultWindow: 1440, defaultSeverity: 'HIGH' },

  // ── Orders ──
  { id: 'delayed_orders', categoryId: 'orders', title: 'Fulfillment Delay Threshold Exceeded', desc: 'Unprocessed orders awaiting fulfillment have exceeded your acceptable backlog limit.', family: 'orders', metric: 'delayed_orders', dir: 'above', unit: 'orders', subject: 'delayed orders', defaultThreshold: 10, defaultWindow: 1440, defaultSeverity: 'HIGH' },
  { id: 'failed_orders', categoryId: 'orders', title: 'Order Failure Rate Spike', desc: 'Cancelled, failed, returned or refunded orders have exceeded your failure-rate threshold.', family: 'orders', metric: 'failed_orders', dir: 'above', unit: 'orders', subject: 'failed or cancelled orders', defaultThreshold: 5, defaultWindow: 1440, defaultSeverity: 'CRITICAL' },
  { id: 'no_orders', categoryId: 'orders', title: ' Last Hour Order Volume Dropout', desc: 'Incoming order count has dropped below your minimum floor — possible platform or payment outage.', family: 'orders', metric: 'order_count', dir: 'below', unit: 'orders', subject: 'orders received', defaultThreshold: 1, defaultWindow: 60, defaultSeverity: 'CRITICAL' },
  { id: 'revenue_drop', categoryId: 'orders', title: 'Revenue Floor Breach', desc: 'Revenue has fallen below your expected minimum — investigate order or payment issues.', family: 'orders', metric: 'revenue', dir: 'below', unit: '', subject: 'revenue', defaultThreshold: 1000, defaultWindow: 1440, defaultSeverity: 'HIGH' },

  // ── Storefront errors ──
  { id: 'js_errors', categoryId: 'errors', title: 'JS Error Rate Spike', desc: 'JavaScript runtime errors in shopper browsers have exceeded your acceptable rate.', family: 'rum_errors', metric: 'js_errors', dir: 'above', unit: 'errors', subject: 'JavaScript errors', defaultThreshold: 20, defaultWindow: 60, defaultSeverity: 'HIGH' },
  { id: 'network_errors', categoryId: 'errors', title: 'Network Request Failure Alert', desc: 'Failed API or network requests from the storefront have exceeded your threshold.', family: 'rum_errors', metric: 'network_errors', dir: 'above', unit: 'errors', subject: 'network errors', defaultThreshold: 20, defaultWindow: 60, defaultSeverity: 'HIGH' },
  { id: 'checkout_errors', categoryId: 'errors', title: 'Checkout Flow Disruption', desc: 'Errors detected on the checkout page — immediate risk to purchase completion.', family: 'rum_errors', metric: 'checkout_errors', dir: 'above', unit: 'errors', subject: 'checkout-page errors', defaultThreshold: 1, defaultWindow: 60, defaultSeverity: 'CRITICAL' },
  { id: 'all_errors', categoryId: 'errors', title: 'Global Storefront Error Threshold', desc: 'Total storefront errors across all error types have breached your global limit.', family: 'rum_errors', metric: 'error_count', dir: 'above', unit: 'errors', subject: 'storefront errors', defaultThreshold: 50, defaultWindow: 60, defaultSeverity: 'MEDIUM' },

  // ── Customer journey ──
  { id: 'completion_drop', categoryId: 'journey', title: 'Purchase Completion Rate Drop', desc: 'End-to-end journey completion rate (visits that finish a purchase) has fallen below target.', family: 'journey', metric: 'completion_rate', dir: 'below', unit: '%', subject: 'purchase completion rate', defaultThreshold: 50, defaultWindow: 1440, defaultSeverity: 'HIGH' },
  { id: 'abandon_high', categoryId: 'journey', title: 'Checkout Abandonment Rate Alert', desc: 'The share of shoppers exiting before completing checkout has exceeded your threshold.', family: 'journey', metric: 'checkout_abandonment', dir: 'above', unit: '%', subject: 'checkout abandonment rate', defaultThreshold: 70, defaultWindow: 1440, defaultSeverity: 'MEDIUM' },

  // ── Visitors ──
  { id: 'conversion_drop', categoryId: 'sessions', title: 'Session Conversion Rate Alert', desc: 'The share of sessions converting to a purchase has dropped below your target.', family: 'customer_session', metric: 'conversion_rate', dir: 'below', unit: '%', subject: 'session conversion rate', defaultThreshold: 2, defaultWindow: 1440, defaultSeverity: 'MEDIUM' },
  { id: 'traffic_drop', categoryId: 'sessions', title: 'Visitor Session Volume Drop', desc: 'Incoming session count has fallen below your floor — possible acquisition or infrastructure issue.', family: 'customer_session', metric: 'session_count', dir: 'below', unit: 'sessions', subject: 'visitor sessions', defaultThreshold: 10, defaultWindow: 60, defaultSeverity: 'MEDIUM' },

  // ── Integrations ──
  { id: 'integration_sync_fail', categoryId: 'integrations', title: 'Integration Sync Failure', desc: 'A store connector failed to sync data — orders, products or customers may be missing or stale.', family: 'integration', metric: 'sync_failures', dir: 'above', unit: '', subject: 'failed integration syncs', defaultThreshold: 0, defaultWindow: 60, defaultSeverity: 'HIGH' },
  { id: 'integration_down', categoryId: 'integrations', title: 'Integration Connection Down', desc: 'A connected store API is unreachable or rejecting our token — reconnecting the store may be required.', family: 'integration', metric: 'unhealthy_connectors', dir: 'above', unit: '', subject: 'failing integrations', defaultThreshold: 0, defaultWindow: 60, defaultSeverity: 'CRITICAL' },

  // ── Payments & SMS ──
  { id: 'payment_degraded', categoryId: 'gateways', title: 'Payment Gateway Degraded', desc: 'A configured payment gateway is reporting downtime or degraded service — checkout is at risk.', family: 'payment_gateway', metric: 'degraded_gateways', dir: 'above', unit: '', subject: 'impacted payment gateways', defaultThreshold: 0, defaultWindow: 60, defaultSeverity: 'CRITICAL' },
  { id: 'sms_degraded', categoryId: 'gateways', title: 'SMS Gateway Degraded', desc: 'An SMS provider (Twilio, GupShup, ClickSend, Infobip) is reporting an incident — OTPs and notifications may fail.', family: 'sms_gateway', metric: 'degraded_gateways', dir: 'above', unit: '', subject: 'impacted SMS gateways', defaultThreshold: 0, defaultWindow: 60, defaultSeverity: 'HIGH' },
];

const findTemplate = (id: string) => TEMPLATES.find((t) => t.id === id);
export const matchTemplate = (family?: string, metric?: string) =>
  TEMPLATES.find((t) => t.family === family && t.metric === metric);

// Friendly "check over the last …" choices.
const WINDOW_OPTIONS = [
  { minutes: 15, label: 'Last 15 minutes' },
  { minutes: 30, label: 'Last 30 minutes' },
  { minutes: 60, label: 'Last 1 hour' },
  { minutes: 360, label: 'Last 6 hours' },
  { minutes: 1440, label: 'Last 24 hours' },
];

// How often the consolidated summary email goes out (project-level, NOT per
// rule). Decoupled from each rule's "check over the last …" detection window.
const SUMMARY_OPTIONS = [
  { minutes: 15, label: 'Every 15 minutes' },
  { minutes: 60, label: 'Every hour' },
  { minutes: 360, label: 'Every 6 hours' },
  { minutes: 1440, label: 'Once a day' },
];

const SEVERITIES: { value: string; label: string; desc: string; color: string }[] = [
  { value: 'CRITICAL', label: 'Critical', desc: 'Urgent — needs action now', color: '#ef4444' },
  { value: 'HIGH', label: 'High', desc: 'Important', color: '#f97316' },
  { value: 'MEDIUM', label: 'Medium', desc: 'Worth knowing', color: '#eab308' },
  { value: 'LOW', label: 'Low', desc: 'Informational', color: '#60a5fa' },
];

interface RuleCriteria {
  metricFamily: string;
  metric: string;
  operator: string;
  threshold: number;
  windowMinutes: number;
  channels: { email: boolean };
  recipients: string[];
  notifyMode?: string;
  digestMinutes?: number;
}

interface AlertRule {
  id: string;
  name: string;
  description?: string;
  severity: string;
  enabled: boolean;
  cooldownMinutes: number;
  connectorInstanceId?: string | null;
  criteria: RuleCriteria;
}

type ApiFetch = (url: string, options?: any) => Promise<any>;

const emptyForm = {
  id: '',
  templateId: '',
  name: '',
  threshold: 0,
  windowMinutes: 60,
  severity: 'HIGH',
  enabled: true,
  cooldownMinutes: 60,
  connectorInstanceId: '' as string | null,
};

// Project-level notification settings (shared across every rule). Recipients
// and summary cadence live here, NOT on individual rules.
const emptyNotif = {
  recipients: [''] as string[],
  summaryEnabled: true,
  summaryMinutes: 60,
  immediateCritical: true,
};

// ── shared inline styles (match Alert Center aesthetic) ──
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em',
  color: 'var(--text-label)', marginBottom: '6px', fontWeight: 600,
};
const inputStyle: React.CSSProperties = {
  width: '100%', borderRadius: '8px', border: '1px solid var(--border-input)',
  background: 'var(--bg-input)', padding: '9px 12px', fontSize: '14px', color: 'var(--text-primary)',
};
const fieldStyle: React.CSSProperties = { marginBottom: '16px' };
const rowStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' };
const primaryBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 16px',
  borderRadius: '8px', border: 'none', background: '#2563EB', color: '#fff',
  fontSize: '13px', fontWeight: 600, cursor: 'pointer',
};
const ghostBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 16px',
  borderRadius: '8px', border: '1px solid var(--border-input)', background: 'var(--bg-input)',
  color: 'var(--text-primary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
};

export function AlertRuleConfigDrawer({
  isOpen,
  onClose,
  projectId,
  apiFetch,
  onChanged,
  connectorInstanceId = null,
  connectorLabel,
}: {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  apiFetch: ApiFetch;
  onChanged?: () => void;
  /** Active store — new rules are scoped to it; null = all stores (project-wide). */
  connectorInstanceId?: string | null;
  connectorLabel?: string;
}) {
  const { success, error: showError } = useToast();
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // 'list' = existing rules · 'pick' = template gallery · 'form' = friendly config
  // · 'settings' = project-level notification recipients + cadence
  const [view, setView] = useState<'list' | 'pick' | 'form' | 'settings'>('list');
  const [form, setForm] = useState({ ...emptyForm });
  const [notif, setNotif] = useState({ ...emptyNotif });
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifTesting, setNotifTesting] = useState(false);

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/v1/dashboard/alert-rules`, { suppressUnauthorizedRedirect: true });
      setRules(Array.isArray(res?.rules) ? res.rules : []);
    } catch (err) {
      console.error('[AlertRuleConfig] load failed', err);
      showError('Failed to load alert rules');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, showError]);

  const loadNotif = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/v1/dashboard/alert-notifications`, { suppressUnauthorizedRedirect: true });
      const s = res?.settings ?? {};
      setNotif({
        recipients: Array.isArray(s.recipients) && s.recipients.length ? s.recipients : [''],
        summaryEnabled: s.summaryEnabled !== false,
        summaryMinutes: Number(s.summaryMinutes) || 60,
        immediateCritical: s.immediateCritical !== false,
      });
    } catch (err) {
      console.error('[AlertRuleConfig] load notification settings failed', err);
      showError('Failed to load notification settings');
    }
  }, [apiFetch, showError]);

  useEffect(() => {
    if (isOpen) {
      setView('list');
      loadRules();
    }
  }, [isOpen, loadRules]);

  const openSettings = () => {
    setNotif({ ...emptyNotif });
    loadNotif();
    setView('settings');
  };

  // ── notification recipient row helpers ──
  const updateRecipient = (index: number, value: string) =>
    setNotif((n) => ({ ...n, recipients: n.recipients.map((e, i) => (i === index ? value : e)) }));
  const addRecipient = () => setNotif((n) => ({ ...n, recipients: [...n.recipients, ''] }));
  const removeRecipient = (index: number) =>
    setNotif((n) => {
      const next = n.recipients.filter((_, i) => i !== index);
      return { ...n, recipients: next.length ? next : [''] };
    });

  const saveNotif = async () => {
    const recipients = Array.from(new Set(notif.recipients.map((e) => e.trim()).filter(Boolean)));
    const bad = recipients.find((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (bad) return showError(`"${bad}" is not a valid email`);
    setNotifSaving(true);
    try {
      await apiFetch(`/api/v1/dashboard/alert-notifications`, {
        method: 'PUT',
        body: JSON.stringify({
          recipients,
          summaryEnabled: notif.summaryEnabled,
          summaryMinutes: Number(notif.summaryMinutes),
          immediateCritical: notif.immediateCritical,
        }),
      });
      success('Notification settings saved');
      setView('list');
    } catch (err: any) {
      console.error('[AlertRuleConfig] save notification settings failed', err);
      showError(err?.message || 'Failed to save notification settings');
    } finally {
      setNotifSaving(false);
    }
  };

  const sendTestEmail = async () => {
    setNotifTesting(true);
    try {
      const res = await apiFetch(`/api/v1/dashboard/alert-notifications/test`, { method: 'POST', body: JSON.stringify({}) });
      if (res?.sent) {
        success(`Test email sent to ${(res.recipients || []).join(', ')}`);
      } else {
        showError(res?.reason || 'Test email was not sent');
      }
    } catch (err: any) {
      console.error('[AlertRuleConfig] test email failed', err);
      showError(err?.message || 'Failed to send test email');
    } finally {
      setNotifTesting(false);
    }
  };

  // Step 1 → pick a template gallery item.
  const startCreate = () => setView('pick');

  // Is this template already configured for the current store scope? A rule is
  // uniquely identified by metricFamily + metric within a connector scope, so
  // the same template can't be added twice — return the existing rule if so.
  const configuredRuleFor = useCallback(
    (t: Template) => {
      const scope = connectorInstanceId ?? null;
      return rules.find(
        (r) =>
          (r.connectorInstanceId ?? null) === scope &&
          r.criteria?.metricFamily === t.family &&
          r.criteria?.metric === t.metric,
      );
    },
    [rules, connectorInstanceId],
  );

  const chooseTemplate = (t: Template) => {
    // Already configured → open the existing rule for editing rather than
    // silently creating a duplicate (the backend rejects duplicates anyway).
    const existing = configuredRuleFor(t);
    if (existing) {
      success('This alert is already configured — opening it to edit.');
      startEdit(existing);
      return;
    }
    setForm({
      ...emptyForm,
      templateId: t.id,
      name: t.title,
      threshold: t.defaultThreshold,
      windowMinutes: t.defaultWindow,
      severity: t.defaultSeverity,
      // Scope a new rule to whichever store is active (null = project-wide).
      connectorInstanceId: connectorInstanceId ?? '',
    });
    setView('form');
  };

  const startEdit = (rule: AlertRule) => {
    const c = rule.criteria || ({} as RuleCriteria);
    const tpl = matchTemplate(c.metricFamily, c.metric);
    setForm({
      id: rule.id,
      templateId: tpl?.id || '',
      name: rule.name,
      threshold: Number(c.threshold ?? tpl?.defaultThreshold ?? 0),
      windowMinutes: c.windowMinutes ?? tpl?.defaultWindow ?? 60,
      severity: rule.severity || 'HIGH',
      enabled: rule.enabled,
      cooldownMinutes: rule.cooldownMinutes ?? 60,
      connectorInstanceId: rule.connectorInstanceId ?? '',
    });
    setView('form');
  };

  const template = findTemplate(form.templateId);

  const buildPayload = () => {
    if (!template) throw new Error('Pick what to watch first');
    return {
      name: form.name.trim() || template.title,
      severity: form.severity,
      enabled: form.enabled,
      cooldownMinutes: Number(form.cooldownMinutes),
      // null = project-wide rule. 'all' sentinel is also project-wide.
      connectorInstanceId:
        form.connectorInstanceId && form.connectorInstanceId !== 'all' ? form.connectorInstanceId : null,
      // A rule defines ONLY the condition now. Who gets emailed and how often
      // is project-level (Notification settings), no longer per rule.
      criteria: {
        metricFamily: template.family,
        metric: template.metric,
        operator: template.dir === 'above' ? '>' : '<',
        threshold: Number(form.threshold),
        windowMinutes: Number(form.windowMinutes),
      },
    };
  };

  const saveRule = async () => {
    if (!template) return showError('Pick what to watch first');
    if (!form.name.trim()) return showError('Give the alert a name');
    setSaving(true);
    try {
      const payload = buildPayload();
      if (form.id) {
        await apiFetch(`/api/v1/dashboard/alert-rules/${form.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        success('Alert saved');
      } else {
        await apiFetch(`/api/v1/dashboard/alert-rules`, { method: 'POST', body: JSON.stringify(payload) });
        success('Alert created');
      }
      await loadRules();
      setView('list');
      onChanged?.();
    } catch (err: any) {
      console.error('[AlertRuleConfig] save failed', err);
      showError(err?.message || 'Failed to save alert');
    } finally {
      setSaving(false);
    }
  };

  const toggleRule = async (rule: AlertRule) => {
    try {
      await apiFetch(`/api/v1/dashboard/alert-rules/${rule.id}/toggle`, {
        method: 'PATCH', body: JSON.stringify({ enabled: !rule.enabled }),
      });
      await loadRules();
      onChanged?.();
    } catch {
      showError('Failed to toggle alert');
    }
  };

  const deleteRule = async (rule: AlertRule) => {
    try {
      await apiFetch(`/api/v1/dashboard/alert-rules/${rule.id}`, { method: 'DELETE' });
      success('Alert deleted');
      await loadRules();
      onChanged?.();
    } catch {
      showError('Failed to delete alert');
    }
  };

  // Plain-English description of a rule, used in the list + preview.
  const describe = (t: Template | undefined, threshold: number, windowMinutes: number) => {
    if (!t) return '';
    const unit = t.unit ? `${t.unit === '%' ? '' : ' '}${t.unit}` : '';
    const dir = t.dir === 'above' ? 'rises above' : 'drops below';
    const win = WINDOW_OPTIONS.find((w) => w.minutes === windowMinutes)?.label.toLowerCase() || `last ${windowMinutes} min`;
    return `When ${t.subject} ${dir} ${threshold}${unit} (${win}).`;
  };

  const unitSuffix = template?.unit ? (template.unit === '%' ? '%' : ` ${template.unit}`) : '';

  return (
    <DiagnosticDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="Alerts"
      subtitle={`Project ${projectId}`}
      width="640px"
    >
      {/* ───────────────── LIST: existing alerts ───────────────── */}
      {view === 'list' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
              We watch your store and email you when something needs attention.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <button onClick={openSettings} style={ghostBtn}>
                <Mail style={{ width: '16px', height: '16px' }} />Add Mail Recipients
              </button>
              <button onClick={startCreate} style={primaryBtn}>
                <Plus style={{ width: '16px', height: '16px' }} /> Create New Alert
              </button>
            </div>
          </div>

          {loading ? (
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading…</p>
          ) : rules.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
              <BellRing style={{ width: '40px', height: '40px', margin: '0 auto 12px', opacity: 0.5 }} />
              <p style={{ fontSize: '14px' }}>No alerts yet. Create one to start monitoring.</p>
            </div>
          ) : (
            rules.map((rule) => {
              const tpl = matchTemplate(rule.criteria?.metricFamily, rule.criteria?.metric);
              return (
                <div key={rule.id} style={{
                  border: '1px solid var(--border-card)', borderRadius: '10px',
                  background: 'var(--bg-input)', padding: '14px 16px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{tpl?.title || rule.name}</span>
                      <span style={{ padding: '1px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: 600, background: 'rgba(96,165,250,0.15)', color: '#60a5fa' }}>{rule.severity}</span>
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                      {describe(tpl, Number(rule.criteria?.threshold), rule.criteria?.windowMinutes ?? 60)}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <button onClick={() => toggleRule(rule)} title={rule.enabled ? 'Turn off' : 'Turn on'} style={{
                      padding: '4px 10px', borderRadius: '999px', border: 'none', cursor: 'pointer',
                      fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em',
                      background: rule.enabled ? 'rgba(16,185,129,0.15)' : 'var(--bg-card)',
                      color: rule.enabled ? '#10b981' : 'var(--text-muted)',
                    }}>{rule.enabled ? 'ON' : 'OFF'}</button>
                    <button onClick={() => startEdit(rule)} title="Edit" style={{ ...ghostBtn, padding: '6px' }}>
                      <Pencil style={{ width: '14px', height: '14px' }} />
                    </button>
                    <button onClick={() => deleteRule(rule)} title="Delete" style={{ ...ghostBtn, padding: '6px', color: '#f87171' }}>
                      <Trash2 style={{ width: '14px', height: '14px' }} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ───────────────── PICK: template gallery ───────────────── */}
      {view === 'pick' && (
        <div>
          <button onClick={() => setView('list')} style={{ ...ghostBtn, marginBottom: '20px' }}>
            <ArrowLeft style={{ width: '14px', height: '14px' }} /> Back
          </button>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
            What should we watch for?
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 20px' }}>
            Pick a situation. You'll set the number and who to notify next.
          </p>

          {CATEGORIES.map((cat) => {
            const items = TEMPLATES.filter((t) => t.categoryId === cat.id);
            if (!items.length) return null;
            const Icon = cat.icon;
            return (
              <div key={cat.id} style={{ marginBottom: '22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', color: 'var(--text-secondary)' }}>
                  <Icon size={15} />
                  <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{cat.label}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {items.map((t) => {
                    const configured = configuredRuleFor(t);
                    return (
                    <button key={t.id} onClick={() => chooseTemplate(t)} title={configured ? 'Already configured — click to edit' : undefined} style={{
                      textAlign: 'left', borderRadius: '10px',
                      border: `1px solid ${configured ? 'rgba(16,185,129,0.5)' : 'var(--border-card)'}`,
                      background: configured ? 'rgba(16,185,129,0.08)' : 'var(--bg-input)', padding: '12px 14px', cursor: 'pointer',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{t.title}</span>
                        {configured && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '1px 7px', borderRadius: '999px', fontSize: '10px', fontWeight: 700, background: 'rgba(16,185,129,0.15)', color: '#10b981', flexShrink: 0 }}>
                            <Check size={10} /> Configured
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4 }}>{t.desc}</div>
                    </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ───────────────── FORM: friendly config ───────────────── */}
      {view === 'form' && template && (
        <div>
          <button onClick={() => setView(form.id ? 'list' : 'pick')} style={{ ...ghostBtn, marginBottom: '20px' }}>
            <ArrowLeft style={{ width: '14px', height: '14px' }} /> {form.id ? 'Back to alerts' : 'Pick something else'}
          </button>

          {/* Plain-English live preview */}
          <div style={{
            padding: '14px 16px', borderRadius: '10px', marginBottom: '20px',
            background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.25)',
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#60a5fa', marginBottom: '6px' }}>
              This alert will…
            </div>
            <div style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
              {describe(template, Number(form.threshold), Number(form.windowMinutes))}{' '}
              It shows in the Alert Center and is included in your summary email.
            </div>
          </div>

          {/* <div style={{ ...fieldStyle, padding: '8px 12px', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-input)' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Applies to:&nbsp;</span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {form.connectorInstanceId ? (connectorLabel || 'Selected store') : 'All stores'}
            </span>
          </div> */}

          <div style={fieldStyle}>
            <label style={labelStyle}>Alert name</label>
            <input style={inputStyle} value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>

          {/* The one number the user types */}
          <div style={{ ...rowStyle, ...fieldStyle }}>
            <div>
              <label style={labelStyle}>Alert me when {template.subject} is</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                  {template.dir === 'above' ? 'more than' : 'less than'}
                </span>
                <input type="number" style={inputStyle} value={form.threshold}
                  onChange={(e) => setForm({ ...form, threshold: Number(e.target.value) })} />
                {template.unit && <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{template.unit}</span>}
              </div>
            </div>
            <div>
              <label style={labelStyle}>Check over the</label>
              <select style={inputStyle} value={form.windowMinutes}
                onChange={(e) => setForm({ ...form, windowMinutes: Number(e.target.value) })}>
                {WINDOW_OPTIONS.map((w) => <option key={w.minutes} value={w.minutes}>{w.label}</option>)}
              </select>
            </div>
          </div>

          {/* Severity as friendly pills */}
          <div style={fieldStyle}>
            <label style={labelStyle}>How important is this?</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {SEVERITIES.map((s) => {
                const active = form.severity === s.value;
                return (
                  <button key={s.value} onClick={() => setForm({ ...form, severity: s.value })} style={{
                    display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left', cursor: 'pointer',
                    padding: '9px 12px', borderRadius: '8px',
                    border: `1px solid ${active ? s.color : 'var(--border-input)'}`,
                    background: active ? `${s.color}1a` : 'var(--bg-input)',
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: s.color, flexShrink: 0 }} />
                    <span>
                      <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{s.label}</span>
                      <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)' }}>{s.desc}</span>
                    </span>
                    {active && <Check size={14} style={{ marginLeft: 'auto', color: s.color }} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Recipients are project-level now — point the user to that screen. */}
          <div style={{ ...fieldStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-input)' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Emails go to your shared recipient list. Manage who's notified in Notification settings.
            </span>
            <button type="button" onClick={openSettings} style={{ ...ghostBtn, flexShrink: 0 }}>
              <Mail style={{ width: '14px', height: '14px' }} /> Notifications
            </button>
          </div>

          {/* Advanced: don't re-alert too often */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Don't re-alert for (minutes)</label>
            <input type="number" min={0} style={inputStyle} value={form.cooldownMinutes}
              onChange={(e) => setForm({ ...form, cooldownMinutes: Number(e.target.value) })} />
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '6px 0 0' }}>
              After it fires, stay quiet for this long so you're not spammed about the same problem.
            </p>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: '20px' }}>
            <input type="checkbox" checked={form.enabled} style={{ accentColor: '#3b82f6' }}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
            Turn this alert on
          </label>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button onClick={() => setView(form.id ? 'list' : 'pick')} style={ghostBtn}>Cancel</button>
            <button onClick={saveRule} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : form.id ? 'Save changes' : 'Create alert'}
            </button>
          </div>
        </div>
      )}

      {/* ───────────────── SETTINGS: project notifications ───────────────── */}
      {view === 'settings' && (
        <div>
          <button onClick={() => setView('list')} style={{ ...ghostBtn, marginBottom: '20px' }}>
            <ArrowLeft style={{ width: '14px', height: '14px' }} /> Back to alerts
          </button>

          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
            Notification settings
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 20px', lineHeight: 1.5 }}>
            One shared recipient list for every alert. Each rule decides <em>what</em> to watch;
            this decides <em>who</em> hears about it and <em>how often</em>.
          </p>

          {/* Recipients */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Email these people</label>
            {notif.recipients.map((email, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input
                  type="email"
                  style={inputStyle}
                  value={email}
                  placeholder="name@store.com"
                  name={`notif-email-${i}`}
                  autoComplete="off"
                  onChange={(e) => updateRecipient(i, e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => removeRecipient(i)}
                  title="Remove"
                  style={{ ...ghostBtn, padding: '6px 10px', color: '#f87171', flexShrink: 0 }}
                >
                  <Trash2 style={{ width: '14px', height: '14px' }} />
                </button>
              </div>
            ))}
            <button type="button" onClick={addRecipient} style={{ ...ghostBtn, marginTop: '2px' }}>
              <Plus style={{ width: '14px', height: '14px' }} /> Add another email
            </button>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '8px 0 0', lineHeight: 1.5 }}>
              Leave empty to keep alerts in the Alert Center only (no email).
            </p>
          </div>

          {/* Summary cadence */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Send me a summary</label>
            <select
              style={inputStyle}
              value={notif.summaryMinutes}
              disabled={!notif.summaryEnabled}
              onChange={(e) => setNotif({ ...notif, summaryMinutes: Number(e.target.value) })}
            >
              {SUMMARY_OPTIONS.map((o) => <option key={o.minutes} value={o.minutes}>{o.label}</option>)}
            </select>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '6px 0 0', lineHeight: 1.5 }}>
              One email rolling up every alert triggered since the last summary — across all rules.
            </p>
          </div>

          {/* Toggles */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: '12px' }}>
            <input type="checkbox" checked={notif.summaryEnabled} style={{ accentColor: '#3b82f6' }}
              onChange={(e) => setNotif({ ...notif, summaryEnabled: e.target.checked })} />
            Send the periodic summary email
          </label>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: '20px' }}>
            <input type="checkbox" checked={notif.immediateCritical} style={{ accentColor: '#3b82f6', marginTop: '3px' }}
              onChange={(e) => setNotif({ ...notif, immediateCritical: e.target.checked })} />
            <span>
              Email <strong>Critical</strong> alerts immediately
              <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)' }}>
                They still appear in the next summary too.
              </span>
            </span>
          </label>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setView('list')} style={ghostBtn}>Cancel</button>
              <button onClick={saveNotif} disabled={notifSaving} style={{ ...primaryBtn, opacity: notifSaving ? 0.6 : 1 }}>
                {notifSaving ? 'Saving…' : 'Save settings'}
              </button>
            </div>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '10px 0 0', lineHeight: 1.5 }}>
            Save first — the test emails whoever is currently saved as a recipient.
          </p>
        </div>
      )}
    </DiagnosticDrawer>
  );
}

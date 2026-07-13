'use client';

import React, { useEffect, useState } from 'react';
import { ExternalLink, Eye, EyeOff, HelpCircle, CheckCircle2, AlertCircle, FileSpreadsheet, Loader2, Store } from 'lucide-react';
import { useConnectorPlatform } from '../../context/ConnectorPlatformContext';
import { useToast } from '@kpi-platform/ui';

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(2, 6, 23, 0.72)',
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'flex-end',
  zIndex: 80
};

const panelStyle: React.CSSProperties = {
  width: 'min(100%, 720px)',
  height: '100%',
  background: 'var(--bg-card)',
  borderLeft: '1px solid var(--border-card)',
  boxShadow: '-24px 0 60px rgba(0,0,0,0.35)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden'
};

const sectionStyle: React.CSSProperties = {
  border: '1px solid var(--border-card)',
  borderRadius: '12px',
  background: 'var(--bg-page)',
  padding: '16px'
};

export const ConnectorSetupModal: React.FC = () => {
  const { connectorSetup, connectorCatalog, closeConnectorSetup, testConnectorConnection, saveConnectorConnection, reauthConnector, beginConnectorSetup, isSetupModalOpen, openCsvUpload, getInitialSyncStatus, refreshConnectors, setActiveConnector } = useConnectorPlatform();
  const platform = connectorSetup.platform;
  const config = platform ? connectorCatalog[platform] : null;
  const reauthConnectorId = connectorSetup.reauthConnectorId;
  const isReauth = Boolean(reauthConnectorId);

  const [values, setValues] = useState<Record<string, string>>({});
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [helpOpen, setHelpOpen] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: true; message: string } | { ok: false; error: string } | null>(null);
  const [saveResult, setSaveResult] = useState<{ ok: true; message: string } | { ok: false; error: string } | null>(null);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncStage, setSyncStage] = useState<'idle' | 'syncing' | 'done'>('idle');
  const [syncConnectorId, setSyncConnectorId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [syncFailed, setSyncFailed] = useState(false);
  const [syncElapsed, setSyncElapsed] = useState(0);
  const { success, error: showError } = useToast();

  useEffect(() => {
    if (!platform) {
      setValues({});
      setVisiblePasswords({});
      setTestResult(null);
      setSaveResult(null);
      setSyncProgress(0);
      setSyncStage('idle');
      setSyncConnectorId(null);
      setSyncStatus(null);
      setSyncFailed(false);
      setSyncElapsed(0);
      return;
    }

    const defaults: Record<string, string> = {};
    config?.fields.forEach((field) => {
      defaults[field.id] = field.id === 'apiVersion' ? '2024-01' : field.id === 'storeCode' ? 'default' : '';
    });
    setValues(defaults);
    setTestResult(null);
    setSaveResult(null);
    setSyncProgress(0);
    setSyncStage('idle');
    setSyncConnectorId(null);
    setSyncStatus(null);
    setSyncFailed(false);
    setSyncElapsed(0);
  }, [platform, config]);

  // Poll the REAL initial-sync status of the connector we just created. The
  // backend syncs orders + customers in the background and stamps
  // metadata.initialSync; we surface live progress, then acknowledge completion
  // and refresh the connector/orders/customers data.
  useEffect(() => {
    if (syncStage !== 'syncing' || !syncConnectorId) return;

    let cancelled = false;

    const computeProgress = (payload: any): number => {
      const targets: string[] = Array.isArray(payload?.targets) && payload.targets.length
        ? payload.targets
        : ['orders', 'customers', 'products'];
      const results = payload?.results || {};
      const done = targets.filter((t) => {
        const s = String(results?.[t]?.status || '').toLowerCase();
        return s === 'completed' || s === 'partial' || s === 'failed';
      }).length;
      const raw = Math.round((done / targets.length) * 100);
      // Never show a full bar until the job itself reports terminal.
      return Math.min(raw, 95);
    };

    const poll = async () => {
      try {
        const res = await getInitialSyncStatus(syncConnectorId);
        const payload = res?.data ?? res;
        if (cancelled || !payload) return;

        setSyncStatus(payload);
        const status = String(payload?.status || '').toLowerCase();

        if (status === 'completed' || status === 'failed') {
          setSyncProgress(100);
          setSyncFailed(status === 'failed');
          setSyncStage('done');
          // Pull fresh connector health + canonical datasets into context, and
          // select the new store so the Orders/Customers pages re-fetch (their
          // effects key off the connector-selection tick).
          try { await refreshConnectors(); } catch {}
          try { setActiveConnector(syncConnectorId); } catch {}
          // Nudge pages that load their own data (e.g. Integrations) to refetch.
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('kpi:sync:completed', { detail: { connectorId: syncConnectorId } }));
          }
        } else {
          setSyncProgress((current) => Math.max(current, computeProgress(payload)));
        }
      } catch {
        // Transient poll error — keep trying; the interval will retry.
      }
    };

    poll();
    const interval = window.setInterval(poll, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
    // getInitialSyncStatus/refreshConnectors/setActiveConnector are stable enough;
    // depending on them would recreate the poll interval on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncStage, syncConnectorId]);

  // Elapsed-time ticker while the initial sync is running.
  useEffect(() => {
    if (syncStage !== 'syncing') return;
    const startedAt = Date.now();
    const tick = () => setSyncElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [syncStage]);

  if (!isSetupModalOpen) return null;

  // Platform picker screen
  if (!platform) {
    return (
      <div style={overlayStyle} role="dialog" aria-modal="true" aria-label={`Connect a store`}>
        <div style={panelStyle}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-card)', display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: '16px', minWidth: 0 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>Connect a store</div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>Choose your e-commerce platform to get started.</div>
              </div>
            </div>
            <button type="button" onClick={closeConnectorSetup} style={{ border: '1px solid var(--border-card)', background: 'transparent', color: 'var(--text-primary)', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer' }}>
              Close
            </button>
          </div>
          <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {Object.entries(connectorCatalog).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => beginConnectorSetup(key as any)}
                style={{
                  padding: '20px',
                  borderRadius: '12px',
                  border: '1.5px solid var(--border-card)',
                  background: 'var(--bg-card)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: '10px'
                }}
              >
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <cfg.icon style={{ width: '18px', height: '18px', color: '#6b7280' }} />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '3px' }}>{cfg.name}</p>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{cfg.help.title}</p>
                </div>
              </button>
            ))}
            <button
              key="csv"
              onClick={() => { closeConnectorSetup(); openCsvUpload(); }}
              style={{
                padding: '20px',
                borderRadius: '12px',
                border: '1.5px solid var(--border-card)',
                background: 'var(--bg-card)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '10px'
              }}
            >
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileSpreadsheet style={{ width: '18px', height: '18px', color: '#6b7280' }} />
              </div>
              <div style={{ textAlign: 'left' }}>
                <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '3px' }}>CSV / Excel Upload</p>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Upload offline orders from a spreadsheet file</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const updateField = (fieldId: string, value: string) => {
    setValues((current) => ({ ...current, [fieldId]: value }));
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await testConnectorConnection(platform, values);
      setTestResult(result);
    } catch (error: any) {
      setTestResult({ ok: false, error: error?.message || 'Connection test failed.' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveResult(null);
    try {
      if (isReauth && reauthConnectorId) {
        await reauthConnector(reauthConnectorId, platform, values);
        const message = 'Access token updated. The connector is re-authenticated.';
        setSaveResult({ ok: true, message });
        success(message, `${config.name} re-authenticated`);
      } else {
        const store = await saveConnectorConnection(platform, values);
        setSyncConnectorId((store as any)?.connectorId || null);
        setSyncProgress(0);
        setSyncFailed(false);
        setSyncStatus(null);
        setSyncStage('syncing');
        const message = 'Integration saved. Syncing orders & customers in the background…';
        setSaveResult({ ok: true, message });
        success(message, `${config.name} saved`);
      }
    } catch (error: any) {
      const message = error?.message || 'Save failed.';
      setSaveResult({ ok: false, error: message });
      showError(message, isReauth ? `${config.name} re-auth failed` : `${config.name} save failed`);
    } finally {
      setIsSaving(false);
    }
  };

  const testOk = testResult?.ok === true;
  const saveOk = saveResult?.ok === true;
  const renderTestMessage = () => {
    if (!testResult) return null;
    return testOk ? testResult.message : testResult.error;
  };

  const renderSaveMessage = () => {
    if (!saveResult) return null;
    return saveOk ? saveResult.message : saveResult.error;
  };

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-label={`${config.name} connection setup`}>
      <div style={panelStyle}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-card)', display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: '16px', minWidth: 0 }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <config.icon style={{ width: '22px', height: '22px', color: '#818cf8' }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>{config.name}</div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>{isReauth ? 'Re-authenticate · update the expired access token' : 'Connect your store'}</div>
            </div>
          </div>
          <button type="button" onClick={closeConnectorSetup} style={{ border: '1px solid var(--border-card)', background: 'transparent', color: 'var(--text-primary)', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer' }}>
            Close
          </button>
        </div>

        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={sectionStyle}>
            <button type="button" onClick={() => setHelpOpen((current) => !current)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 700 }}>
                <HelpCircle style={{ width: '16px', height: '16px', color: '#818cf8' }} />
                {config.help.title}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{helpOpen ? 'Hide' : 'Show'}</span>
            </button>
            {helpOpen && (
              <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {config.help.steps.map((step, index) => (
                  <div key={step} style={{ display: 'flex', gap: '10px', color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.6 }}>
                    <span style={{ width: '22px', height: '22px', borderRadius: '999px', background: 'rgba(129,140,248,0.15)', color: '#a5b4fc', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '11px', fontWeight: 700 }}>{index + 1}</span>
                    <span>{step}</span>
                  </div>
                ))}
                <a href={config.help.docsUrl} target="_blank" rel="noreferrer" style={{ color: '#a5b4fc', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px', width: 'fit-content' }}>
                  {config.help.docsLabel}
                  <ExternalLink style={{ width: '14px', height: '14px' }} />
                </a>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gap: '14px' }}>
            {!isReauth && (
              <label style={sectionStyle}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', minWidth: 0 }}>
                  <span style={{ width: '30px', height: '30px', borderRadius: '10px', background: 'rgba(99,102,241,0.12)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Store style={{ width: '16px', height: '16px', color: '#818cf8' }} />
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Store Name</span>
                </div>
                <input
                  type="text"
                  value={values.storeName || ''}
                  onChange={(event) => updateField('storeName', event.target.value)}
                  placeholder="e.g. My store"
                  style={{ marginTop: '10px', width: '100%', borderRadius: '10px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', padding: '12px 14px', fontSize: '14px', outline: 'none' }}
                />
                <div style={{ marginTop: '8px', color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.5 }}>A friendly name shown across the dashboard. Leave blank to auto-name from the store domain.</div>
              </label>
            )}
            {config.fields.map((field) => {
              const FieldIcon = field.icon;
              const isPassword = field.type === 'password';
              const isVisible = visiblePasswords[field.id];
              return (
                <label key={field.id} style={sectionStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', minWidth: 0 }}>
                      <span style={{ width: '30px', height: '30px', borderRadius: '10px', background: 'rgba(99,102,241,0.12)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <FieldIcon style={{ width: '16px', height: '16px', color: '#818cf8' }} />
                      </span>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{field.label}</span>
                    </div>
                    {isPassword && (
                      <button type="button" onClick={() => setVisiblePasswords((current) => ({ ...current, [field.id]: !current[field.id] }))} style={{ background: 'transparent', border: 'none', color: '#a5b4fc', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                        {isVisible ? <EyeOff style={{ width: '14px', height: '14px' }} /> : <Eye style={{ width: '14px', height: '14px' }} />}
                        {isVisible ? 'Hide' : 'Show'}
                      </button>
                    )}
                  </div>
                  <input
                    type={isPassword && !isVisible ? 'password' : 'text'}
                    value={values[field.id] || ''}
                    onChange={(event) => updateField(field.id, event.target.value)}
                    placeholder={field.placeholder}
                    style={{ marginTop: '10px', width: '100%', borderRadius: '10px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', padding: '12px 14px', fontSize: '14px', outline: 'none' }}
                  />
                  <div style={{ marginTop: '8px', color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.5 }}>{field.info}</div>
                </label>
              );
            })}
          </div>

          {testResult && (
            <div style={{ ...sectionStyle, borderColor: testOk ? 'rgba(34,197,94,0.3)' : 'rgba(248,113,113,0.3)', background: testOk ? 'rgba(34,197,94,0.08)' : 'rgba(248,113,113,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: testOk ? '#4ade80' : '#f87171', fontSize: '14px', fontWeight: 700 }}>
                {testOk ? <CheckCircle2 style={{ width: '16px', height: '16px' }} /> : <AlertCircle style={{ width: '16px', height: '16px' }} />}
                {renderTestMessage()}
              </div>
            </div>
          )}

          {saveResult && (
            <div style={{ ...sectionStyle, borderColor: saveOk ? 'rgba(34,197,94,0.3)' : 'rgba(248,113,113,0.3)', background: saveOk ? 'rgba(34,197,94,0.08)' : 'rgba(248,113,113,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: saveOk ? '#4ade80' : '#f87171', fontSize: '14px', fontWeight: 700 }}>
                {saveOk ? <CheckCircle2 style={{ width: '16px', height: '16px' }} /> : <AlertCircle style={{ width: '16px', height: '16px' }} />}
                {renderSaveMessage()}
              </div>
            </div>
          )}

          {syncStage === 'idle' && (
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={handleTest} disabled={isTesting || isSaving} style={{ borderRadius: '10px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', padding: '10px 16px', cursor: 'pointer' }}>
                {isTesting ? 'Testing...' : 'Test Connection'}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || !(testResult && testResult.ok)}
                style={{ borderRadius: '10px', border: '1px solid #6366f1', background: '#4f46e5', color: 'white', padding: '10px 16px', cursor: isSaving || !(testResult && testResult.ok) ? 'not-allowed' : 'pointer', opacity: isSaving || !(testResult && testResult.ok) ? 0.6 : 1 }}
              >
                {isSaving ? 'Saving...' : isReauth ? 'Update Token' : 'Save & Connect'}
              </button>
            </div>
          )}

          {syncStage !== 'idle' && (() => {
            const results = (syncStatus?.results || {}) as Record<string, any>;
            const recordsByType = (syncStatus?.recordsByType || {}) as Record<string, number>;
            const isDone = syncStage === 'done';
            const minutes = Math.floor(syncElapsed / 60);
            const seconds = syncElapsed % 60;
            const elapsedLabel = `${minutes}m ${String(seconds).padStart(2, '0')}s`;
            const targetLabels: Record<string, string> = { orders: 'Orders', customers: 'Customers', products: 'Products' };
            const targets = ['orders', 'customers', 'products'];

            const headerTitle = !isDone
              ? 'Syncing your store data…'
              : syncFailed
                ? 'Initial sync finished with errors'
                : 'Initial sync completed';
            const headerColor = !isDone ? 'var(--text-primary)' : syncFailed ? '#fbbf24' : '#4ade80';

            return (
              <div style={{ ...sectionStyle, background: 'rgba(129,140,248,0.08)', borderColor: 'rgba(129,140,248,0.22)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {!isDone
                      ? <Loader2 className="animate-spin" style={{ width: '16px', height: '16px', color: '#818cf8' }} />
                      : syncFailed
                        ? <AlertCircle style={{ width: '16px', height: '16px', color: '#fbbf24' }} />
                        : <CheckCircle2 style={{ width: '16px', height: '16px', color: '#4ade80' }} />}
                    <div>
                      <div style={{ color: headerColor, fontSize: '14px', fontWeight: 700 }}>{headerTitle}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>
                        {isDone ? `Finished in ${elapsedLabel}` : `Fetching from your store · ${elapsedLabel} elapsed`}
                      </div>
                    </div>
                  </div>
                  <div style={{ color: '#a5b4fc', fontSize: '14px', fontWeight: 700 }}>{syncProgress}%</div>
                </div>
                <div style={{ marginTop: '12px', width: '100%', height: '8px', borderRadius: '999px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <div style={{ width: `${syncProgress}%`, height: '100%', background: syncFailed ? 'linear-gradient(90deg, #f59e0b, #f87171)' : 'linear-gradient(90deg, #818cf8, #22c55e)', transition: 'width 0.4s ease' }} />
                </div>
                <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {targets.map((t) => {
                    const r = results[t];
                    const status = String(r?.status || '').toLowerCase();
                    const count = Number(r?.upserted ?? recordsByType?.[t] ?? 0);
                    const targetDone = status === 'completed' || status === 'partial' || status === 'failed';
                    return (
                      <div key={t} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '8px 12px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600 }}>
                          {status === 'failed'
                            ? <AlertCircle style={{ width: '14px', height: '14px', color: '#f87171' }} />
                            : targetDone
                              ? <CheckCircle2 style={{ width: '14px', height: '14px', color: '#4ade80' }} />
                              : <Loader2 className="animate-spin" style={{ width: '14px', height: '14px', color: '#818cf8' }} />}
                          {targetLabels[t]}
                        </span>
                        <span style={{ color: status === 'failed' ? '#f87171' : 'var(--text-muted)', fontSize: '12px' }}>
                          {status === 'failed'
                            ? 'failed'
                            : targetDone
                              ? `${count.toLocaleString()} synced`
                              : 'syncing…'}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {isDone && (
                  <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: syncFailed ? '#fbbf24' : '#4ade80', fontSize: '13px', fontWeight: 700 }}>
                      {syncFailed ? <AlertCircle style={{ width: '16px', height: '16px' }} /> : <CheckCircle2 style={{ width: '16px', height: '16px' }} />}
                      {syncFailed ? 'Some data could not be synced — check the connector health.' : 'Your orders & customers are ready.'}
                    </div>
                    <button
                      type="button"
                      onClick={closeConnectorSetup}
                      style={{ borderRadius: '10px', border: 'none', background: '#4f46e5', color: 'white', padding: '10px 16px', cursor: 'pointer', fontWeight: 600 }}
                    >
                      Done
                    </button>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};
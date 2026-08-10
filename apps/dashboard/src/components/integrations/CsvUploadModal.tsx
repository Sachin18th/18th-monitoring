'use client';

import React, { useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Users,
} from 'lucide-react';
import { useConnectorPlatform } from '../../context/ConnectorPlatformContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '@kpi-platform/ui';

type Step = 'upload' | 'mapping' | 'preview' | 'importing' | 'done';

interface StandardField {
  key: string;
  label: string;
  required?: boolean;
  aliases: string[];
}

// Standardized canonical fields the backend's `csv` normalizer understands.
const STANDARD_FIELDS: StandardField[] = [
  { key: 'order_id', label: 'Order ID', required: true, aliases: ['orderid', 'ordernumber', 'orderno', 'order', 'id', 'reference', 'orderref'] },
  { key: 'order_date', label: 'Order Date', aliases: ['orderdate', 'date', 'createdat', 'created', 'placedat', 'purchasedate', 'timestamp'] },
  { key: 'customer_name', label: 'Customer Name', aliases: ['customername', 'customer', 'name', 'buyer', 'client', 'fullname'] },
  { key: 'customer_email', label: 'Customer Email', aliases: ['customeremail', 'email', 'buyeremail', 'mail', 'emailaddress'] },
  // Identity join keys for offline/POS rows. Phone is usually the ONLY contact a
  // till captures, and is what matches an in-store purchase to the same person's
  // online orders. Both are hashed server-side — the raw values are never stored.
  { key: 'customer_phone', label: 'Customer Phone', aliases: ['customerphone', 'phone', 'mobile', 'mobileno', 'mobilenumber', 'contact', 'contactnumber', 'phoneno', 'telephone', 'msisdn'] },
  { key: 'loyalty_id', label: 'Loyalty / Member ID', aliases: ['loyaltyid', 'loyalty', 'memberid', 'membershipid', 'customerid', 'loyaltynumber', 'cardnumber'] },
  { key: 'store_location', label: 'Store / Location', aliases: ['storelocation', 'store', 'location', 'branch', 'outlet', 'shop', 'terminal', 'till'] },
  { key: 'sku', label: 'SKU / Product', aliases: ['sku', 'product', 'productsku', 'item', 'productid', 'itemsku', 'productname'] },
  { key: 'quantity', label: 'Quantity', aliases: ['quantity', 'qty', 'count', 'units', 'qnty'] },
  { key: 'unit_price', label: 'Unit Price', aliases: ['unitprice', 'price', 'rate', 'itemprice'] },
  { key: 'total', label: 'Total', required: true, aliases: ['total', 'amount', 'totalamount', 'grandtotal', 'totalprice', 'ordertotal', 'revenue', 'value'] },
  { key: 'status', label: 'Status', aliases: ['status', 'orderstatus', 'state', 'fulfillmentstatus'] },
  { key: 'shipping_address', label: 'Shipping Address', aliases: ['shippingaddress', 'address', 'shipto', 'shipping', 'deliveryaddress'] },
];

/** Mirrors OfflineIdentityReport returned by POST /dashboard/connectors/csv/ingest. */
interface IdentityReport {
  matchingEnabled: boolean;
  customersMatched: number;
  customersCreated: number;
  rowsLinked: number;
  rowsUnidentified: number;
  phoneConflicts: number;
}

const MAX_BYTES = 50 * 1024 * 1024; // 50MB

// Currencies offered for offline imports. CSV/Excel rows rarely carry a currency,
// so the operator picks one explicitly instead of silently defaulting to USD.
const CURRENCY_OPTIONS: { code: string; label: string }[] = [
  { code: 'USD', label: 'USD — US Dollar' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'GBP', label: 'GBP — British Pound' },
  { code: 'INR', label: 'INR — Indian Rupee' },
  { code: 'AUD', label: 'AUD — Australian Dollar' },
  { code: 'CAD', label: 'CAD — Canadian Dollar' },
  { code: 'AED', label: 'AED — UAE Dirham' },
  { code: 'SGD', label: 'SGD — Singapore Dollar' },
  { code: 'JPY', label: 'JPY — Japanese Yen' },
  { code: 'CNY', label: 'CNY — Chinese Yuan' },
  { code: 'CHF', label: 'CHF — Swiss Franc' },
  { code: 'NZD', label: 'NZD — New Zealand Dollar' },
  { code: 'ZAR', label: 'ZAR — South African Rand' },
  { code: 'BRL', label: 'BRL — Brazilian Real' },
  { code: 'MXN', label: 'MXN — Mexican Peso' },
];

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(2, 6, 23, 0.72)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 90,
  padding: '24px',
};

const panelStyle: React.CSSProperties = {
  width: 'min(100%, 720px)',
  maxHeight: '90vh',
  background: 'var(--bg-card)',
  border: '1px solid var(--border-card)',
  borderRadius: '16px',
  boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const sectionStyle: React.CSSProperties = {
  border: '1px solid var(--border-card)',
  borderRadius: '12px',
  background: 'var(--bg-page)',
  padding: '16px',
};

const normalizeHeader = (value: string) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const autoMatch = (headers: string[]): Record<string, string> => {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();
  for (const field of STANDARD_FIELDS) {
    const match = headers.find((h) => {
      if (used.has(h)) return false;
      const n = normalizeHeader(h);
      return n === field.key.replace(/_/g, '') || field.aliases.includes(n);
    });
    if (match) {
      mapping[field.key] = match;
      used.add(match);
    } else {
      mapping[field.key] = '';
    }
  }
  return mapping;
};

export const CsvUploadModal: React.FC = () => {
  const { isCsvUploadOpen, closeCsvUpload, refreshConnectors, connectedStores, activeConnectorId } = useConnectorPlatform();
  const { apiFetch } = useAuth();
  const { success, error: showError } = useToast();

  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState<string>('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  // '' = create a new offline store; otherwise the connectorId of an existing store to merge into.
  const [targetStoreId, setTargetStoreId] = useState<string>('');
  // Currency applied to every imported offline order. Empty until the operator
  // chooses one — required before import, so we never silently assume USD.
  const [currency, setCurrency] = useState<string>('');
  const [connectorName, setConnectorName] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ success: number; failed: number; total: number } | null>(null);
  // How the imported rows attached to the customer golden record (see
  // OfflineIdentityReport on the API side). Null for older API responses.
  const [identityResult, setIdentityResult] = useState<IdentityReport | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('upload');
    setFileName('');
    setHeaders([]);
    setRows([]);
    setMapping({});
    setTargetStoreId('');
    setCurrency('');
    setConnectorName('');
    setParseError(null);
    setImportResult(null);
    setIdentityResult(null);
    setIsDragging(false);
  };

  const handleClose = () => {
    reset();
    closeCsvUpload();
  };

  const ingestParsed = (parsedRows: Record<string, any>[], detectedHeaders: string[], name: string) => {
    if (!parsedRows.length || !detectedHeaders.length) {
      setParseError('No rows detected in the file. Please check the file and try again.');
      return;
    }
    setRows(parsedRows);
    setHeaders(detectedHeaders);
    setMapping(autoMatch(detectedHeaders));
    setConnectorName(name.replace(/\.(csv|xls|xlsx)$/i, '') + ' Offline Orders');
    // Always merge into an existing store (online + offline data live together):
    // default to the active store, else the first store. Only when the project has
    // no stores yet does this stay '' and a new offline store gets created.
    setTargetStoreId(
      activeConnectorId && connectedStores.some((s) => s.connectorId === activeConnectorId)
        ? activeConnectorId
        : connectedStores[0]?.connectorId || '',
    );
    setStep('mapping');
  };

  const handleFile = (file: File) => {
    setParseError(null);
    if (file.size > MAX_BYTES) {
      setParseError('File exceeds the 50MB limit.');
      return;
    }
    setFileName(file.name);
    const lower = file.name.toLowerCase();

    if (lower.endsWith('.csv')) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          const data = (res.data as Record<string, any>[]).filter((r) => Object.values(r).some((v) => String(v ?? '').trim() !== ''));
          const fields = (res.meta.fields || []).filter(Boolean) as string[];
          ingestParsed(data, fields, file.name);
        },
        error: (err) => setParseError(`Failed to parse CSV: ${err.message}`),
      });
      return;
    }

    if (lower.endsWith('.xls') || lower.endsWith('.xlsx')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target?.result, { type: 'array' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
          const fields = data.length ? Object.keys(data[0]) : [];
          ingestParsed(data, fields, file.name);
        } catch (err: any) {
          setParseError(`Failed to parse spreadsheet: ${err?.message || 'unknown error'}`);
        }
      };
      reader.onerror = () => setParseError('Failed to read the file.');
      reader.readAsArrayBuffer(file);
      return;
    }

    setParseError('Unsupported file type. Please upload a .csv, .xls, or .xlsx file.');
  };

  const mappedRows = useMemo(() => {
    return rows.map((row) => {
      const out: Record<string, any> = {};
      for (const field of STANDARD_FIELDS) {
        const sourceCol = mapping[field.key];
        out[field.key] = sourceCol ? row[sourceCol] : '';
      }
      return out;
    });
  }, [rows, mapping]);

  const missingRequired = STANDARD_FIELDS.filter((f) => f.required && !mapping[f.key]);
  // At least one identity column is what makes offline→online customer matching
  // possible. Not required (an anonymous till export is still worth importing).
  const hasIdentityColumn = Boolean(mapping.customer_email || mapping.customer_phone || mapping.loyalty_id);

  const destinationLabel = useMemo(() => {
    if (!targetStoreId) return connectorName.trim() || 'New Offline Store';
    const store = connectedStores.find((s) => s.connectorId === targetStoreId);
    return store?.name || store?.connectionLabel || 'Selected store';
  }, [targetStoreId, connectorName, connectedStores]);

  const handleImport = async () => {
    setStep('importing');
    try {
      const result = await apiFetch('/api/v1/dashboard/connectors/csv/ingest', {
        method: 'POST',
        body: JSON.stringify({
          connectorName: connectorName.trim() || 'Offline Orders',
          rows: mappedRows,
          targetConnectorId: targetStoreId || null,
          currency: currency || null,
        }),
      });
      setImportResult({
        success: Number(result?.success ?? 0),
        failed: Number(result?.failed ?? 0),
        total: Number(result?.total ?? mappedRows.length),
      });
      setIdentityResult(result?.identity ?? null);
      setStep('done');
      success(`Imported ${result?.success ?? 0} offline orders.`, 'CSV upload complete');
      await refreshConnectors();
    } catch (err: any) {
      setParseError(err?.message || 'Import failed.');
      setStep('preview');
      showError(err?.message || 'Import failed.', 'CSV upload failed');
    }
  };

  if (!isCsvUploadOpen) return null;

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-label="Upload Offline Orders">
      <div style={panelStyle}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-card)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileSpreadsheet style={{ width: '20px', height: '20px', color: '#818cf8' }} />
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>Upload Offline Orders</div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>Import orders from a CSV or Excel spreadsheet</div>
            </div>
          </div>
          <button type="button" onClick={handleClose} style={{ border: '1px solid var(--border-card)', background: 'transparent', color: 'var(--text-primary)', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer' }}>
            Close
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {parseError && (
            <div style={{ ...sectionStyle, borderColor: 'rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.08)', display: 'flex', alignItems: 'center', gap: '10px', color: '#f87171', fontSize: '13px', fontWeight: 600 }}>
              <AlertCircle style={{ width: '16px', height: '16px', flexShrink: 0 }} />
              {parseError}
            </div>
          )}

          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleFile(file);
              }}
              style={{
                border: `2px dashed ${isDragging ? '#818cf8' : 'var(--border-card)'}`,
                borderRadius: '14px',
                padding: '48px 24px',
                textAlign: 'center',
                background: isDragging ? 'rgba(129,140,248,0.06)' : 'var(--bg-page)',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ width: '60px', height: '60px', borderRadius: '16px', background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Upload style={{ width: '26px', height: '26px', color: '#818cf8' }} />
              </div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>Drop your spreadsheet here</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px' }}>Accepts .csv, .xls, .xlsx — max 50MB</div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{ padding: '10px 22px', background: '#4f46e5', color: '#fff', border: '1px solid #6366f1', borderRadius: '10px', fontWeight: 700, cursor: 'pointer' }}
              >
                Browse Files
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xls,.xlsx"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  e.target.value = '';
                }}
              />
            </div>
          )}

          {/* Step 2: Mapping */}
          {step === 'mapping' && (
            <>
              <div style={{ ...sectionStyle, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileSpreadsheet style={{ width: '18px', height: '18px', color: '#818cf8' }} />
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{fileName}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>({rows.length.toLocaleString()} rows detected)</span>
              </div>

              {connectedStores.length > 0 ? (
                <label style={sectionStyle}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>Upload into store</div>
                  <select
                    value={targetStoreId}
                    onChange={(e) => setTargetStoreId(e.target.value)}
                    style={{ width: '100%', borderRadius: '10px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', padding: '10px 12px', fontSize: '14px', outline: 'none' }}
                  >
                    {connectedStores.map((store) => (
                      <option key={store.connectorId} value={store.connectorId}>
                        {store.name || store.connectionLabel || store.connectorId}
                      </option>
                    ))}
                  </select>
                  <div style={{ marginTop: '8px', color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.5 }}>
                    These offline orders are added to the selected store, so its online and offline data are analyzed together — no separate store is created.
                  </div>
                </label>
              ) : (
                <label style={sectionStyle}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>New store name</div>
                  <input
                    value={connectorName}
                    onChange={(e) => setConnectorName(e.target.value)}
                    placeholder="e.g. May Offline Orders"
                    style={{ width: '100%', borderRadius: '10px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', padding: '10px 12px', fontSize: '14px', outline: 'none' }}
                  />
                  <div style={{ marginTop: '8px', color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.5 }}>
                    This project has no stores yet, so a new offline store will be created for these orders.
                  </div>
                </label>
              )}

              <label style={sectionStyle}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Order currency<span style={{ color: '#f87171', marginLeft: '4px' }}>*</span>
                </div>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  style={{ width: '100%', borderRadius: '10px', border: `1px solid ${currency ? 'var(--border-input)' : 'rgba(248,113,113,0.5)'}`, background: 'var(--bg-input)', color: currency ? 'var(--text-primary)' : 'var(--text-muted)', padding: '10px 12px', fontSize: '14px', outline: 'none' }}
                >
                  <option value="">— Select currency —</option>
                  {CURRENCY_OPTIONS.map((c) => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
                <div style={{ marginTop: '8px', color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.5 }}>
                  Spreadsheets usually don&apos;t include a currency. This currency is applied to every order in this import.
                </div>
              </label>

              <div style={{ ...sectionStyle }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.05em' }}>Column Mapping</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {STANDARD_FIELDS.map((field) => (
                    <div key={field.key} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', alignItems: 'center' }}>
                      <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>
                        {field.label}
                        {field.required && <span style={{ color: '#f87171', marginLeft: '4px' }}>*</span>}
                      </div>
                      <select
                        value={mapping[field.key] || ''}
                        onChange={(e) => setMapping((m) => ({ ...m, [field.key]: e.target.value }))}
                        style={{ width: '100%', borderRadius: '8px', border: `1px solid ${field.required && !mapping[field.key] ? 'rgba(248,113,113,0.5)' : 'var(--border-input)'}`, background: 'var(--bg-input)', color: 'var(--text-primary)', padding: '8px 10px', fontSize: '13px', outline: 'none' }}
                      >
                        <option value="">— Not mapped —</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: '8px',
                    marginTop: '14px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: hasIdentityColumn ? 'rgba(99,102,241,0.06)' : 'rgba(251,191,36,0.08)',
                    border: `1px solid ${hasIdentityColumn ? 'rgba(99,102,241,0.2)' : 'rgba(251,191,36,0.25)'}`,
                  }}
                >
                  {hasIdentityColumn ? (
                    <Users style={{ width: '14px', height: '14px', color: '#818cf8', flexShrink: 0, marginTop: '2px' }} />
                  ) : (
                    <AlertCircle style={{ width: '14px', height: '14px', color: '#fbbf24', flexShrink: 0, marginTop: '2px' }} />
                  )}
                  <span style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                    {hasIdentityColumn
                      ? 'Email, phone and loyalty ID are used to match these orders to customers who also shop online. They are hashed on import — the raw values are never stored.'
                      : 'No email, phone or loyalty ID mapped. These orders will import, but cannot be matched to your existing customers — map at least one to link in-store purchases to the people who also shop online.'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="button" onClick={() => { reset(); }} style={{ flex: 1, padding: '11px', background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: '10px', fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer' }}>Back</button>
                {(() => {
                  const blocked = missingRequired.length > 0 || !currency;
                  const cta = missingRequired.length > 0
                    ? `Map required: ${missingRequired.map((f) => f.label).join(', ')}`
                    : !currency
                      ? 'Select a currency to continue'
                      : 'Continue to Preview';
                  return (
                    <button
                      type="button"
                      disabled={blocked}
                      onClick={() => setStep('preview')}
                      style={{ flex: 2, padding: '11px', background: blocked ? 'var(--bg-input)' : '#4f46e5', color: blocked ? 'var(--text-muted)' : '#fff', border: '1px solid #6366f1', borderRadius: '10px', fontWeight: 700, cursor: blocked ? 'not-allowed' : 'pointer', opacity: blocked ? 0.6 : 1 }}
                    >
                      {cta}
                    </button>
                  );
                })()}
              </div>
            </>
          )}

          {/* Step 3: Preview */}
          {step === 'preview' && (
            <>
              <div style={{ ...sectionStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 700 }}>
                  {targetStoreId ? `Into: ${destinationLabel}` : destinationLabel}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{rows.length.toLocaleString()} orders · {currency || '—'}</span>
              </div>
              <div style={{ ...sectionStyle, overflowX: 'auto' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.05em' }}>Preview (first 3 rows)</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr>
                      {STANDARD_FIELDS.filter((f) => mapping[f.key]).map((f) => (
                        <th key={f.key} style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-card)', whiteSpace: 'nowrap', fontWeight: 700 }}>{f.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mappedRows.slice(0, 3).map((row, idx) => (
                      <tr key={idx}>
                        {STANDARD_FIELDS.filter((f) => mapping[f.key]).map((f) => (
                          <td key={f.key} style={{ padding: '6px 10px', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-card)', whiteSpace: 'nowrap', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(row[f.key] ?? '') || '—'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="button" onClick={() => setStep('mapping')} style={{ flex: 1, padding: '11px', background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: '10px', fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer' }}>Back</button>
                <button type="button" onClick={handleImport} style={{ flex: 2, padding: '11px', background: '#4f46e5', color: '#fff', border: '1px solid #6366f1', borderRadius: '10px', fontWeight: 700, cursor: 'pointer' }}>Import {rows.length.toLocaleString()} Orders</button>
              </div>
            </>
          )}

          {/* Step 4a: Importing */}
          {step === 'importing' && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <Loader2 className="animate-spin" style={{ width: '44px', height: '44px', color: '#818cf8', margin: '0 auto 20px' }} />
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>Importing orders…</div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                {targetStoreId ? `Normalizing rows and adding them to ${destinationLabel}` : 'Normalizing rows and creating the offline store'}
              </div>
            </div>
          )}

          {/* Step 4b: Done */}
          {step === 'done' && importResult && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(34,197,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <CheckCircle2 style={{ width: '30px', height: '30px', color: '#4ade80' }} />
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>Import complete</div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '24px' }}>
                {importResult.success.toLocaleString()} orders imported
                {importResult.failed > 0 ? `, ${importResult.failed.toLocaleString()} skipped` : ''}.{' '}
                {targetStoreId
                  ? `They were added to ${destinationLabel} — select that store to see online and offline orders together.`
                  : 'The new offline store now appears in the Reliability Matrix.'}
              </div>

              {identityResult && (
                <div style={{ ...sectionStyle, textAlign: 'left', marginBottom: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <Users style={{ width: '15px', height: '15px', color: '#818cf8' }} />
                    <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Customer matching
                    </span>
                  </div>

                  {identityResult.matchingEnabled ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px' }}>
                        {[
                          { label: 'Matched to existing', value: identityResult.customersMatched, color: '#4ade80' },
                          { label: 'New customers', value: identityResult.customersCreated, color: '#818cf8' },
                          { label: 'No contact details', value: identityResult.rowsUnidentified, color: 'var(--text-muted)' },
                        ].map((stat) => (
                          <div key={stat.label}>
                            <div style={{ fontSize: '20px', fontWeight: 800, color: stat.color }}>{stat.value.toLocaleString()}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{stat.label}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px', lineHeight: 1.5 }}>
                        {identityResult.rowsLinked.toLocaleString()} of {importResult.success.toLocaleString()} imported orders were
                        attached to a customer by email, phone or loyalty ID.
                      </div>
                      {identityResult.phoneConflicts > 0 && (
                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)' }}>
                          <AlertCircle style={{ width: '14px', height: '14px', color: '#fbbf24', flexShrink: 0, marginTop: '2px' }} />
                          <span style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                            {identityResult.phoneConflicts.toLocaleString()} {identityResult.phoneConflicts === 1 ? 'row' : 'rows'} had a
                            phone number already belonging to a customer with a different email — a shared number, most likely. Those were
                            left unmerged rather than guessed at.
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                      These orders went into their own offline store, so they were not matched against your online customers. To link
                      in-store purchases to the people who also shop online, re-import into an existing store.
                    </div>
                  )}
                </div>
              )}
              <button type="button" onClick={handleClose} style={{ padding: '11px 28px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer' }}>Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CsvUploadModal;
/**
 * Store-currency formatting for the Revenue dashboard (ported/adapted from
 * ai-agent-ecom's format-inr, but currency-agnostic — the store may be USD, etc.,
 * so compaction is K / M / B rather than Lakh / Crore).
 */

function symbolFor(currency: string): string {
  const map: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', INR: '₹', AUD: 'A$', CAD: 'C$', JPY: '¥', SGD: 'S$', AED: 'د.إ ' };
  return map[currency] || `${currency} `;
}

/** Locale for digit grouping: INR uses the Indian 2-2-3 system, else Western 3-3-3. */
function localeFor(currency: string): string {
  return currency === 'INR' ? 'en-IN' : 'en-US';
}

/**
 * Grouping locale for plain (non-money) counts on a store-currency page, so a
 * USD store doesn't render `1,00,000` orders under Indian grouping.
 */
export function numberLocaleFor(currency: string): string {
  return localeFor(currency);
}

/**
 * Exact money with the store's currency symbol, keeping up to `maxFractionDigits`
 * decimals and dropping trailing zeros (60900 → `$60,900`, 7612.5 → `$7,612.5`).
 * Use for dense stat rows; use {@link formatMoneyCompact} for headline tiles.
 */
export function formatMoneyExact(
  n: number | null | undefined,
  currency = 'USD',
  maxFractionDigits = 2,
): string {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const value = Number(n);
  const locale = localeFor(currency);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 0,
      maximumFractionDigits: maxFractionDigits,
    }).format(value);
  } catch {
    // Non-ISO or unknown code — Intl throws, so fall back to the symbol map.
    const sign = value < 0 ? '-' : '';
    return `${sign}${symbolFor(currency)}${Math.abs(value).toLocaleString(locale, {
      maximumFractionDigits: maxFractionDigits,
    })}`;
  }
}

/** Label for the compaction scheme used, e.g. for the controls caption. */
export function compactUnitLabel(currency: string): string {
  return currency === 'INR' ? 'Lakh / Crore' : 'K / M';
}

/** Full grouped value with currency-correct grouping. Used in tooltips/exports. */
export function formatMoneyFull(n: number | null | undefined, currency = 'USD'): string {
  if (n == null || Number.isNaN(n)) return '—';
  const sign = n < 0 ? '-' : '';
  return `${sign}${symbolFor(currency)}${Math.round(Math.abs(n)).toLocaleString(localeFor(currency))}`;
}

/**
 * Abbreviated for tiles/headline. INR uses the Indian Lakh/Crore scale (₹84.2 L,
 * ₹1.49 Cr) per the Tjori spec; every other currency uses K / M / B.
 */
export function formatMoneyCompact(n: number | null | undefined, currency = 'USD'): string {
  if (n == null || Number.isNaN(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const s = symbolFor(currency);
  if (currency === 'INR') {
    if (abs >= 1_00_00_000) return `${sign}${s}${(abs / 1_00_00_000).toFixed(2)} Cr`;
    if (abs >= 1_00_000) return `${sign}${s}${(abs / 1_00_000).toFixed(1)} L`;
    return `${sign}${s}${Math.round(abs).toLocaleString('en-IN')}`;
  }
  if (abs >= 1_000_000_000) return `${sign}${s}${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}${s}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${s}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${s}${Math.round(abs).toLocaleString('en-US')}`;
}

/** Signed percentage, one decimal, e.g. +18.4% / −7.0%. */
export function formatPct(n: number | null | undefined, signed = true): string {
  if (n == null || Number.isNaN(n)) return '—';
  const s = signed && n > 0 ? '+' : n < 0 ? '−' : '';
  return `${s}${Math.abs(n).toFixed(1)}%`;
}

/** Signed percentage-points, for margin / discount-rate deltas. */
export function formatPts(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  const s = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${s}${Math.abs(n).toFixed(1)} pts`;
}

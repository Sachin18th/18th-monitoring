import { prisma, encryptSecret, decryptSecret } from '@kpi-platform/db';
import { EmailService } from './email.service';

/**
 * ShopifyTokenService — refreshes Shopify Admin API access tokens before they
 * expire (custom-app tokens obtained via the client-credentials grant live ~24h).
 * Ported from Cartexel/18th_ai/scripts/refresh-shopify-tokens.ts, adapted to
 * 18th-monitoring's connector model:
 *   - access token lives in the AES-encrypted ConnectorCredential ('adminApiAccessToken')
 *   - the app client_id/client_secret live alongside it (clientId/clientSecret,
 *     a.k.a. apiKey/apiSecret) — needed to re-exchange
 *   - token expiry is tracked in syncConfig.shopifyTokenExpiresAt (non-secret, so
 *     the expiry check needs no decrypt)
 *
 * Re-exchange = POST https://{shop}/admin/oauth/access_token with
 * grant_type=client_credentials → { access_token, expires_in, scope }.
 */

const REFRESH_WINDOW_SECONDS = Number(process.env.SHOPIFY_TOKEN_REFRESH_WINDOW_SECONDS ?? 3600);
const INTERVAL_MS = Number(process.env.SHOPIFY_TOKEN_REFRESH_INTERVAL_MS ?? 60 * 60 * 1000);
const SUMMARY_MAIL = (process.env.SHOPIFY_TOKEN_MAIL ?? '').trim();

export interface TokenResult { accessToken: string; scope: string | null; expiresIn: number | null; tokenExpiresAt: string | null; shop: string; storeUrl: string }
export interface RefreshSummary {
  total: number; refreshed: number; skipped: number; failed: number;
  refreshedItems: { connectorInstanceId: string; label: string; shop: string; tokenExpiresAt: string | null }[];
  failedItems: { connectorInstanceId: string; label: string; shop: string; error: string }[];
  reasons: Record<string, number>;
}

export class ShopifyTokenService {
  private static intervalHandle: ReturnType<typeof setInterval> | null = null;

  /** Start the periodic refresh loop (called from server startup). */
  static start(intervalMs = INTERVAL_MS): void {
    if (this.intervalHandle) return;
    console.log(`[ShopifyToken] 🔑 Starting token refresh loop every ${Math.round(intervalMs / 1000)}s (window ${REFRESH_WINDOW_SECONDS}s)`);
    // Run once shortly after boot, then on the interval.
    setTimeout(() => { this.refreshExpiring().catch((e) => console.error('[ShopifyToken] initial run failed', e?.message)); }, 15_000);
    this.intervalHandle = setInterval(() => {
      this.refreshExpiring().catch((e) => console.error('[ShopifyToken] scheduled run failed', e?.message));
    }, intervalMs);
  }
  static stop(): void {
    if (this.intervalHandle) { clearInterval(this.intervalHandle); this.intervalHandle = null; console.log('[ShopifyToken] Stopped.'); }
  }

  /** Exchange app client_credentials for a fresh Admin API access token. */
  static async exchangeClientCredentials(args: { shop: string; clientId: string; clientSecret: string }): Promise<TokenResult> {
    const shop = normalizeShopDomain(args.shop);
    const clientId = args.clientId.trim();
    const clientSecret = args.clientSecret.trim();
    if (!shop) throw new Error('Missing shop domain.');
    if (!clientId || !clientSecret) throw new Error('Missing Shopify client_id / client_secret.');

    const body = new URLSearchParams();
    body.set('client_id', clientId);
    body.set('client_secret', clientSecret);
    body.set('grant_type', 'client_credentials');

    const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const payload: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload?.error_description || payload?.error || `Shopify token exchange failed (${res.status}).`);
    }
    const accessToken = typeof payload?.access_token === 'string' ? payload.access_token.trim() : '';
    if (!accessToken) throw new Error('Token exchange succeeded but no access_token was returned.');
    const expiresIn = Number.isFinite(Number(payload?.expires_in)) ? Number(payload.expires_in) : null;
    const tokenExpiresAt = expiresIn && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
    return { accessToken, scope: typeof payload?.scope === 'string' ? payload.scope : null, expiresIn, tokenExpiresAt, shop, storeUrl: `https://${shop}` };
  }

  /**
   * Refresh every Shopify connector whose token is missing/expiring within the
   * window. Rewrites the encrypted credential (new token, client creds preserved)
   * and records expiry/error state in syncConfig. Emails a summary.
   */
  static async refreshExpiring(opts: { windowSeconds?: number; now?: Date } = {}): Promise<RefreshSummary> {
    const windowSeconds = opts.windowSeconds ?? REFRESH_WINDOW_SECONDS;
    const now = (opts.now ?? new Date()).getTime();

    const connectors = await prisma.connectorInstance.findMany({
      where: { providerId: 'shopify', status: { not: 'DISABLED' } },
      select: { id: true, tenantId: true, label: true, syncConfig: true, credentials: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, encryptedSecret: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const summary: RefreshSummary = { total: connectors.length, refreshed: 0, skipped: 0, failed: 0, refreshedItems: [], failedItems: [], reasons: {} };
    const bump = (k: string) => (summary.reasons[k] = (summary.reasons[k] || 0) + 1);

    for (const conn of connectors) {
      const cfg = (conn.syncConfig || {}) as Record<string, any>;
      const shop = normalizeShopDomain(String(cfg.shopDomain || cfg.storeUrl || '').trim());
      const credRow = conn.credentials?.[0];
      const creds = credRow ? safeDecrypt(credRow.encryptedSecret) : {};
      const clientId = String(creds.clientId || creds.apiKey || creds.appKey || creds.client_id || '').trim();
      const clientSecret = String(creds.clientSecret || creds.apiSecret || creds.appSecret || creds.client_secret || '').trim();

      if (!shop || !clientId || !clientSecret || !credRow) {
        summary.skipped++; bump('missing_client_credentials');
        continue;
      }

      // Expiry check from non-secret syncConfig (fall back to credential field).
      const rawExpiry = String(cfg.shopifyTokenExpiresAt || creds.tokenExpiresAt || '').trim();
      const expiryMs = rawExpiry ? Date.parse(rawExpiry) : NaN;
      const shouldRefresh = !Number.isFinite(expiryMs) || expiryMs - now <= windowSeconds * 1000;
      if (!shouldRefresh) { summary.skipped++; bump('still_valid'); continue; }

      try {
        const token = await this.exchangeClientCredentials({ shop, clientId, clientSecret });
        const nextCreds = { ...creds, adminApiAccessToken: token.accessToken, clientId, clientSecret, scope: token.scope ?? creds.scope ?? null, tokenExpiresAt: token.tokenExpiresAt };
        await prisma.connectorCredential.update({
          where: { id: credRow.id },
          data: { encryptedSecret: encryptSecret(nextCreds), lastRotatedAt: new Date(), isActive: true },
        });
        await prisma.connectorInstance.update({
          where: { id: conn.id },
          data: {
            status: 'ACTIVE', healthStatus: 'HEALTHY',
            syncConfig: { ...cfg, storeUrl: token.storeUrl, shopDomain: token.shop, shopifyTokenExpiresAt: token.tokenExpiresAt, shopifyTokenLastRefreshedAt: new Date().toISOString(), shopifyTokenRefreshError: null },
          },
        });
        summary.refreshed++; bump('refreshed');
        summary.refreshedItems.push({ connectorInstanceId: conn.id, label: conn.label, shop: token.shop, tokenExpiresAt: token.tokenExpiresAt });
        console.log(JSON.stringify({ ts: new Date().toISOString(), svc: 'shopify-token', level: 'info', msg: 'refreshed', connectorInstanceId: conn.id, shop: token.shop, tokenExpiresAt: token.tokenExpiresAt }));
      } catch (err: any) {
        const message = err?.message || 'Unknown token refresh error.';
        summary.failed++; bump('error');
        summary.failedItems.push({ connectorInstanceId: conn.id, label: conn.label, shop, error: message });
        await prisma.connectorInstance.update({
          where: { id: conn.id },
          data: { syncConfig: { ...cfg, shopifyTokenRefreshError: message, shopifyTokenRefreshFailedAt: new Date().toISOString() } },
        }).catch(() => {});
        console.error(JSON.stringify({ ts: new Date().toISOString(), svc: 'shopify-token', level: 'error', msg: 'refresh_failed', connectorInstanceId: conn.id, shop, error: message }));
      }
    }

    console.log(JSON.stringify({ ts: new Date().toISOString(), svc: 'shopify-token', level: 'info', msg: 'run_complete', ...pick(summary, ['total', 'refreshed', 'skipped', 'failed']) }));
    await this.sendSummary(summary).catch((e) => console.error('[ShopifyToken] summary email failed', e?.message));
    return summary;
  }

  private static async sendSummary(s: RefreshSummary): Promise<void> {
    if (!SUMMARY_MAIL) return;
    if (s.refreshed === 0 && s.failed === 0) return; // nothing noteworthy
    const subject = s.failed > 0
      ? `Shopify token refresh: ${s.failed} failed, ${s.refreshed} updated`
      : `Shopify token refresh: ${s.refreshed} updated`;
    const li = (rows: any[], fn: (r: any) => string) => (rows.length ? rows.map((r) => `<li>${fn(r)}</li>`).join('') : '<li>None</li>');
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;">
        <h2>Shopify token refresh summary</h2>
        <p>Checked <b>${s.total}</b> · Updated <b>${s.refreshed}</b> · Failed <b>${s.failed}</b> · Skipped <b>${s.skipped}</b></p>
        <h3>Updated</h3><ul>${li(s.refreshedItems, (r) => `<b>${r.label}</b> (${r.shop})${r.tokenExpiresAt ? ` — new expiry ${r.tokenExpiresAt}` : ''}`)}</ul>
        <h3>Failed</h3><ul>${li(s.failedItems, (r) => `<b>${r.label}</b> (${r.shop}) — ${r.error}`)}</ul>
      </div>`;
    await EmailService.send({ to: SUMMARY_MAIL, subject, html });
  }
}

function safeDecrypt(serialized: string | null | undefined): Record<string, any> {
  if (!serialized) return {};
  try { const d = decryptSecret(serialized); return d && typeof d === 'object' ? d : {}; } catch { return {}; }
}
function normalizeShopDomain(input: string): string {
  let s = String(input || '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\/+$/, '');
  return s;
}
function pick<T extends object>(o: T, keys: (keyof T)[]): Partial<T> {
  const out: any = {}; for (const k of keys) out[k] = o[k]; return out;
}

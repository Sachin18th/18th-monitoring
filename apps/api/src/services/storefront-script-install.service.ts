import { prisma, decryptSecret } from '@kpi-platform/db';

/**
 * Programmatic install of the storefront tracker onto a merchant's storefront,
 * using the connector's stored platform **admin access token** — no copy/paste.
 *
 *   Shopify        → ScriptTag API (cannot carry data-*, so the tracker is
 *                    installed as tracker.js?cid=<id>; the script derives the
 *                    ingest url from its own origin).
 *   BigCommerce    → Scripts API v3 (kind=script_tag, full <script> with data-*).
 *   Adobe Commerce → no token-based head-script API exists → manual_required
 *                    (use the module / Admin CMS method, see the install doc).
 *
 * The installed script id is persisted to connectorInstance.syncConfig under
 * `storefrontTracker` so status/uninstall can find it later.
 */

type Platform = 'shopify' | 'bigcommerce' | 'adobe_commerce' | 'unknown';

export type InstallStatus = 'installed' | 'already_installed' | 'manual_required' | 'not_found' | 'error';

export interface InstallResult {
  status: InstallStatus;
  platform: Platform;
  scriptId?: string | null;
  src?: string | null;
  message: string;
}

interface ConnectorRow {
  id: string;
  tenantId: string;
  providerId: string;
  syncConfig: Record<string, any>;
  secret: Record<string, any>;
}

const TRACKER_PATH = '/api/track/tracker.js';
const BC_SCRIPT_NAME = 'Storefront Tracker';

export class StorefrontScriptInstallService {
  // ── Shared helpers ────────────────────────────────────────────────────────
  private static async getFetch(): Promise<typeof fetch> {
    return (globalThis as any).fetch ?? (await import('undici')).fetch as any;
  }

  private static parseSecret(serialized: string | null | undefined): Record<string, any> {
    // Decrypts the AES-256-GCM envelope in memory (with legacy-plaintext fallback).
    // Never log the returned credentials.
    return decryptSecret(serialized);
  }

  private static normalizePlatform(providerId: string): Platform {
    const p = String(providerId || '').toLowerCase();
    if (p.includes('shopify')) return 'shopify';
    if (p.includes('bigcommerce')) return 'bigcommerce';
    if (p.includes('adobe') || p.includes('magento')) return 'adobe_commerce';
    return 'unknown';
  }

  /** Load a connector scoped to the tenant, with its latest credential secret. */
  private static async loadConnector(connectorInstanceId: string, tenantId: string): Promise<ConnectorRow | null> {
    const instance = await prisma.connectorInstance.findFirst({
      where: { id: connectorInstanceId, tenantId },
      select: {
        id: true,
        tenantId: true,
        providerId: true,
        syncConfig: true,
        credentials: { orderBy: { lastRotatedAt: 'desc' }, take: 1, select: { encryptedSecret: true } },
      },
    });
    if (!instance) return null;
    return {
      id: instance.id,
      tenantId: instance.tenantId,
      providerId: instance.providerId,
      syncConfig: (instance.syncConfig || {}) as Record<string, any>,
      secret: this.parseSecret((instance as any).credentials?.[0]?.encryptedSecret),
    };
  }

  private static trackerSrc(host: string, connectorId: string, withQuery: boolean): string {
    const base = `${host.replace(/\/+$/, '')}${TRACKER_PATH}`;
    return withQuery ? `${base}?cid=${encodeURIComponent(connectorId)}` : base;
  }

  private static snippet(host: string, connectorId: string): string {
    const h = host.replace(/\/+$/, '');
    return `<script src="${h}${TRACKER_PATH}" data-connector-id="${connectorId}" data-ingest-url="${h}/api/track" async></script>`;
  }

  /** Merge the install record into syncConfig (without clobbering other keys). */
  private static async persistInstall(connectorInstanceId: string, syncConfig: Record<string, any>, record: any): Promise<void> {
    await prisma.connectorInstance.update({
      where: { id: connectorInstanceId },
      data: { syncConfig: { ...syncConfig, storefrontTracker: record } as any },
    });
  }

  // ── Public entry points ───────────────────────────────────────────────────
  static async install(connectorInstanceId: string, tenantId: string, host: string): Promise<InstallResult> {
    const conn = await this.loadConnector(connectorInstanceId, tenantId);
    if (!conn) return { status: 'not_found', platform: 'unknown', message: 'Connector not found for this tenant.' };

    const platform = this.normalizePlatform(conn.providerId);
    console.log('[TRACK INSTALL] install:start', { connectorInstanceId, platform, providerId: conn.providerId, host });
    try {
      let result: InstallResult;
      if (platform === 'shopify') result = await this.installShopify(conn, host);
      else if (platform === 'bigcommerce') result = await this.installBigCommerce(conn, host);
      else if (platform === 'adobe_commerce') result = await this.installAdobeCommerce(conn, host);
      else result = { status: 'error', platform, message: `Unsupported provider "${conn.providerId}".` };
      console.log('[TRACK INSTALL] install:done', { connectorInstanceId, platform, status: result.status, scriptId: result.scriptId ?? null, message: result.message });
      return result;
    } catch (err: any) {
      console.error('[TRACK INSTALL] install:error', { connectorInstanceId, platform, error: err?.message || String(err) });
      return { status: 'error', platform, message: err?.message || 'Install failed.' };
    }
  }

  static async status(connectorInstanceId: string, tenantId: string): Promise<InstallResult> {
    const conn = await this.loadConnector(connectorInstanceId, tenantId);
    if (!conn) return { status: 'not_found', platform: 'unknown', message: 'Connector not found for this tenant.' };
    const platform = this.normalizePlatform(conn.providerId);
    try {
      if (platform === 'shopify') return await this.statusShopify(conn);
      if (platform === 'bigcommerce') return await this.statusBigCommerce(conn);
      if (platform === 'adobe_commerce') return this.statusAdobeCommerce(conn);
      return { status: 'error', platform, message: `Unsupported provider "${conn.providerId}".` };
    } catch (err: any) {
      return { status: 'error', platform, message: err?.message || 'Status check failed.' };
    }
  }

  static async uninstall(connectorInstanceId: string, tenantId: string): Promise<InstallResult> {
    const conn = await this.loadConnector(connectorInstanceId, tenantId);
    if (!conn) return { status: 'not_found', platform: 'unknown', message: 'Connector not found for this tenant.' };
    const platform = this.normalizePlatform(conn.providerId);
    try {
      if (platform === 'shopify') return await this.uninstallShopify(conn);
      if (platform === 'bigcommerce') return await this.uninstallBigCommerce(conn);
      if (platform === 'adobe_commerce') return await this.uninstallAdobeCommerce(conn);
      return { status: 'manual_required', platform, message: 'Remove the snippet manually for this platform.' };
    } catch (err: any) {
      return { status: 'error', platform, message: err?.message || 'Uninstall failed.' };
    }
  }

  // ── Shopify (ScriptTag API) ────────────────────────────────────────────────
  private static shopifyBase(conn: ConnectorRow): { base: string; token: string } {
    const shop = String(conn.syncConfig.shopDomain || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const version = String(conn.syncConfig.apiVersion || '2024-01').trim();
    const token = String(conn.secret.adminApiAccessToken || conn.secret.accessToken || conn.secret.access_token || conn.secret.token || '').trim();
    if (!shop) throw new Error('Shopify connector is missing shopDomain in syncConfig.');
    if (!token) throw new Error('Shopify connector is missing an admin API access token.');
    return { base: `https://${shop}/admin/api/${version}`, token };
  }

  private static async installShopify(conn: ConnectorRow, host: string): Promise<InstallResult> {
    const { base, token } = this.shopifyBase(conn);
    const f = await this.getFetch();

    // Idempotency: if a tracker ScriptTag already exists, return it.
    const existing = await this.findShopifyTag(f, base, token);
    const src = this.trackerSrc(host, conn.id, true);
    if (existing) {
      await this.persistInstall(conn.id, conn.syncConfig, { provider: 'shopify', scriptId: String(existing.id), src: existing.src });
      return { status: 'already_installed', platform: 'shopify', scriptId: String(existing.id), src: existing.src, message: 'Tracker ScriptTag already installed.' };
    }

    const res = await f(`${base}/script_tags.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ script_tag: { event: 'onload', src, display_scope: 'all' } }),
    });
    if (!res.ok) throw new Error(`Shopify ScriptTag create failed (HTTP ${res.status}): ${await this.errText(res)}`);
    const json: any = await res.json();
    const tag = json?.script_tag || {};
    await this.persistInstall(conn.id, conn.syncConfig, { provider: 'shopify', scriptId: String(tag.id), src: tag.src });
    return { status: 'installed', platform: 'shopify', scriptId: String(tag.id), src: tag.src, message: 'Tracker installed via Shopify ScriptTag.' };
  }

  private static async findShopifyTag(f: typeof fetch, base: string, token: string): Promise<{ id: any; src: string } | null> {
    const res = await f(`${base}/script_tags.json`, { headers: { 'X-Shopify-Access-Token': token, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Shopify ScriptTag list failed (HTTP ${res.status}): ${await this.errText(res)}`);
    const json: any = await res.json();
    const tags = Array.isArray(json?.script_tags) ? json.script_tags : [];
    const hit = tags.find((t: any) => String(t?.src || '').includes(TRACKER_PATH));
    return hit ? { id: hit.id, src: hit.src } : null;
  }

  private static async statusShopify(conn: ConnectorRow): Promise<InstallResult> {
    const { base, token } = this.shopifyBase(conn);
    const f = await this.getFetch();
    const hit = await this.findShopifyTag(f, base, token);
    return hit
      ? { status: 'already_installed', platform: 'shopify', scriptId: String(hit.id), src: hit.src, message: 'Tracker ScriptTag is installed.' }
      : { status: 'not_found', platform: 'shopify', message: 'No tracker ScriptTag found on this store.' };
  }

  private static async uninstallShopify(conn: ConnectorRow): Promise<InstallResult> {
    const { base, token } = this.shopifyBase(conn);
    const f = await this.getFetch();
    const hit = await this.findShopifyTag(f, base, token);
    if (!hit) return { status: 'not_found', platform: 'shopify', message: 'Nothing to uninstall.' };
    const res = await f(`${base}/script_tags/${hit.id}.json`, { method: 'DELETE', headers: { 'X-Shopify-Access-Token': token } });
    if (!res.ok) throw new Error(`Shopify ScriptTag delete failed (HTTP ${res.status}): ${await this.errText(res)}`);
    await this.persistInstall(conn.id, conn.syncConfig, null);
    return { status: 'installed', platform: 'shopify', message: 'Tracker ScriptTag removed.' };
  }

  // ── BigCommerce (Scripts API v3) ───────────────────────────────────────────
  private static bigCommerceBase(conn: ConnectorRow): { base: string; token: string } {
    const storeHash = String(conn.syncConfig.storeHash || conn.syncConfig.store_hash || '').trim();
    const token = String(conn.secret.accessToken || conn.secret.token || conn.secret.storeApiToken || '').trim();
    if (!storeHash) throw new Error('BigCommerce connector is missing storeHash in syncConfig.');
    if (!token) throw new Error('BigCommerce connector is missing an API access token.');
    return { base: `https://api.bigcommerce.com/stores/${storeHash}`, token };
  }

  private static bcHeaders(token: string): Record<string, string> {
    return { 'X-Auth-Token': token, 'Content-Type': 'application/json', Accept: 'application/json' };
  }

  private static async installBigCommerce(conn: ConnectorRow, host: string): Promise<InstallResult> {
    const { base, token } = this.bigCommerceBase(conn);
    const f = await this.getFetch();

    const existing = await this.findBigCommerceScript(f, base, token);
    if (existing) {
      await this.persistInstall(conn.id, conn.syncConfig, { provider: 'bigcommerce', scriptId: existing.uuid, src: null });
      return { status: 'already_installed', platform: 'bigcommerce', scriptId: existing.uuid, message: 'Tracker script already installed.' };
    }

    const res = await f(`${base}/v3/content/scripts`, {
      method: 'POST',
      headers: this.bcHeaders(token),
      body: JSON.stringify({
        name: BC_SCRIPT_NAME,
        description: 'Session & funnel event capture',
        html: this.snippet(host, conn.id),
        auto_uninstall: true,
        load_method: 'default',
        location: 'head',
        visibility: 'all_pages',
        kind: 'script_tag',
        consent_category: 'essential',
      }),
    });
    if (!res.ok) throw new Error(`BigCommerce script create failed (HTTP ${res.status}): ${await this.errText(res)}`);
    const json: any = await res.json();
    const uuid = json?.data?.uuid || null;
    await this.persistInstall(conn.id, conn.syncConfig, { provider: 'bigcommerce', scriptId: uuid, src: null });
    return { status: 'installed', platform: 'bigcommerce', scriptId: uuid, message: 'Tracker installed via BigCommerce Script Manager.' };
  }

  private static async findBigCommerceScript(f: typeof fetch, base: string, token: string): Promise<{ uuid: string } | null> {
    const res = await f(`${base}/v3/content/scripts`, { headers: this.bcHeaders(token) });
    if (!res.ok) throw new Error(`BigCommerce script list failed (HTTP ${res.status}): ${await this.errText(res)}`);
    const json: any = await res.json();
    const list = Array.isArray(json?.data) ? json.data : [];
    const hit = list.find((s: any) => s?.name === BC_SCRIPT_NAME);
    return hit ? { uuid: hit.uuid } : null;
  }

  private static async statusBigCommerce(conn: ConnectorRow): Promise<InstallResult> {
    const { base, token } = this.bigCommerceBase(conn);
    const f = await this.getFetch();
    const hit = await this.findBigCommerceScript(f, base, token);
    return hit
      ? { status: 'already_installed', platform: 'bigcommerce', scriptId: hit.uuid, message: 'Tracker script is installed.' }
      : { status: 'not_found', platform: 'bigcommerce', message: 'No tracker script found on this store.' };
  }

  private static async uninstallBigCommerce(conn: ConnectorRow): Promise<InstallResult> {
    const { base, token } = this.bigCommerceBase(conn);
    const f = await this.getFetch();
    const hit = await this.findBigCommerceScript(f, base, token);
    if (!hit) return { status: 'not_found', platform: 'bigcommerce', message: 'Nothing to uninstall.' };
    const res = await f(`${base}/v3/content/scripts/${hit.uuid}`, { method: 'DELETE', headers: this.bcHeaders(token) });
    if (!res.ok) throw new Error(`BigCommerce script delete failed (HTTP ${res.status}): ${await this.errText(res)}`);
    await this.persistInstall(conn.id, conn.syncConfig, null);
    return { status: 'installed', platform: 'bigcommerce', message: 'Tracker script removed.' };
  }

  // ── Adobe Commerce / Magento 2 (REST config write — no module deploy) ──────
  //
  // Writes the tracker <script> into the `design/head/includes` config value
  // (the "Scripts and Style Sheets" head field, rendered in <head> site-wide),
  // scoped to a store view, using an admin bearer token.
  //
  // IMPORTANT: stock Magento Open Source exposes NO native REST endpoint to
  // write core_config_data. This calls a config-write endpoint that must be
  // available on the instance (Adobe Commerce / a thin admin integration that
  // exposes one). Configure it via syncConfig.adobeConfigEndpoint. If it is
  // absent or returns 4xx we fall back to manual_required with the exact CLI /
  // admin equivalents — we never silently fail. Token: a stored integration/
  // admin token is used as-is; otherwise admin user+password are exchanged at
  // /rest/V1/integration/admin/token (note: blocked by 2FA on Magento 2.4+ —
  // prefer an Integration access token).
  private static readonly ADOBE_CONFIG_PATH = 'design/head/includes';
  private static readonly ADOBE_MARKER_START = '<!-- storefront-tracker:start -->';
  private static readonly ADOBE_MARKER_END = '<!-- storefront-tracker:end -->';

  private static adobeBase(conn: ConnectorRow): { base: string; scopeCode: string; scope: 'default' | 'stores' } {
    const base = String(conn.syncConfig.baseUrl || conn.syncConfig.storeUrl || '').trim().replace(/\/+$/, '');
    if (!base) throw new Error('Adobe Commerce connector is missing baseUrl in syncConfig.');
    const scopeCode = String(conn.syncConfig.storeViewCode || conn.syncConfig.store_code || '').trim();
    return { base, scopeCode, scope: scopeCode ? 'stores' : 'default' };
  }

  private static mask(token: string): string {
    return token && token.length > 8 ? `${token.slice(0, 4)}...${token.slice(-4)}` : token ? '***' : '(none)';
  }

  private static async adobeToken(conn: ConnectorRow, base: string, f: typeof fetch): Promise<string> {
    const stored = String(
      conn.secret.accessToken || conn.secret.adminApiToken || conn.secret.adminApiAccessToken ||
      conn.secret.integrationToken || conn.secret.token || conn.secret.apiKey || '',
    ).trim();
    if (stored) {
      console.log('[TRACK INSTALL] adobe:token source=stored', { token: this.mask(stored) });
      return stored;
    }

    const username = String(conn.secret.adminUser || conn.secret.username || '').trim();
    const password = String(conn.secret.adminPassword || conn.secret.password || '').trim();
    if (username && password) {
      console.log('[TRACK INSTALL] adobe:token source=admin_token_endpoint', { base, username });
      const res = await f(`${base}/rest/V1/integration/admin/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      console.log('[TRACK INSTALL] adobe:admin_token response', { status: res.status, ok: res.ok });
      if (!res.ok) {
        throw new Error(
          `Admin token request failed (HTTP ${res.status}). On Magento 2.4+ this endpoint requires 2FA — store an Integration access token instead.`,
        );
      }
      // The endpoint returns the bare token string (JSON-encoded).
      const tok = String(await res.json()).replace(/^"|"$/g, '').trim();
      console.log('[TRACK INSTALL] adobe:admin_token acquired', { token: this.mask(tok) });
      return tok;
    }
    throw new Error('Adobe Commerce connector has no access token or admin credentials.');
  }

  /** The marker-wrapped <script> block written into design/head/includes. */
  private static adobeHeadHtml(host: string, connectorId: string): string {
    return `${this.ADOBE_MARKER_START}\n${this.snippet(host, connectorId)}\n${this.ADOBE_MARKER_END}`;
  }

  private static async installAdobeCommerce(conn: ConnectorRow, host: string): Promise<InstallResult> {
    const { base, scope, scopeCode } = this.adobeBase(conn);
    const endpointRaw = String(conn.syncConfig.adobeConfigEndpoint || '').trim();
    console.log('[TRACK INSTALL] adobe:start', { connectorInstanceId: conn.id, base, scope, scopeCode: scopeCode || '(default)', hasEndpoint: Boolean(endpointRaw) });

    const f = await this.getFetch();
    const token = await this.adobeToken(conn, base, f);

    if (!endpointRaw) {
      console.warn('[TRACK INSTALL] adobe:no_endpoint — falling back to manual (stock Magento has no config-write REST)');
      return {
        status: 'manual_required',
        platform: 'adobe_commerce',
        message:
          'No config-write endpoint configured (syncConfig.adobeConfigEndpoint). Stock Magento has no native REST config write. ' +
          `Equivalent CLI: bin/magento config:set ${scopeCode ? `--scope=stores --scope-code=${scopeCode} ` : ''}${this.ADOBE_CONFIG_PATH} '<script ...>' — or paste the snippet in Admin → Content → Design → Configuration → HTML Head. See docs/STOREFRONT_TRACKER_INSTALL.md (Method C).`,
      };
    }

    const value = this.adobeHeadHtml(host, conn.id);
    const url = endpointRaw.startsWith('http') ? endpointRaw : `${base}${endpointRaw.startsWith('/') ? '' : '/'}${endpointRaw}`;
    console.log('[TRACK INSTALL] adobe:writing config', { url, path: this.ADOBE_CONFIG_PATH, scope, scopeCode: scopeCode || '(default)', valueBytes: value.length });

    const res = await f(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      // A generic, self-describing payload; the endpoint maps it to a
      // core_config_data write. `marker` lets the endpoint replace only our
      // block (append-safe) rather than clobber existing head HTML.
      body: JSON.stringify({
        path: this.ADOBE_CONFIG_PATH,
        value,
        scope,
        scopeCode: scopeCode || undefined,
        marker: { start: this.ADOBE_MARKER_START, end: this.ADOBE_MARKER_END },
      }),
    });
    console.log('[TRACK INSTALL] adobe:config response', { status: res.status, ok: res.ok });

    if (!res.ok) {
      const detail = await this.errText(res);
      console.error('[TRACK INSTALL] adobe:config write FAILED', { status: res.status, detail });
      return {
        status: 'manual_required',
        platform: 'adobe_commerce',
        message:
          `Config-write endpoint returned HTTP ${res.status}. Stock Magento has no config-write REST endpoint — use bin/magento config:set ${this.ADOBE_CONFIG_PATH}, the Admin HTML Head field, or a config-write integration. Details: ${detail}`,
      };
    }

    const scriptId = `${this.ADOBE_CONFIG_PATH}@${scopeCode || 'default'}`;
    await this.persistInstall(conn.id, conn.syncConfig, { provider: 'adobe_commerce', scriptId, src: null });
    console.log('[TRACK INSTALL] adobe:install SUCCESS', { connectorInstanceId: conn.id, scriptId });
    return {
      status: 'installed',
      platform: 'adobe_commerce',
      scriptId,
      message: `Tracker written to ${this.ADOBE_CONFIG_PATH} (store view: ${scopeCode || 'default'}).`,
    };
  }

  private static statusAdobeCommerce(conn: ConnectorRow): InstallResult {
    // Magento exposes no REST read for head includes, so report from the record
    // persisted at install time.
    const rec = (conn.syncConfig as any).storefrontTracker;
    if (rec && rec.provider === 'adobe_commerce' && rec.scriptId) {
      return { status: 'already_installed', platform: 'adobe_commerce', scriptId: rec.scriptId, message: 'Tracker was written to design/head/includes by this app.' };
    }
    return { status: 'not_found', platform: 'adobe_commerce', message: 'No record of an API install (head includes cannot be read back via REST).' };
  }

  private static async uninstallAdobeCommerce(conn: ConnectorRow): Promise<InstallResult> {
    const { base, scope, scopeCode } = this.adobeBase(conn);
    const endpoint = String(conn.syncConfig.adobeConfigEndpoint || '').trim();
    if (!endpoint) {
      return {
        status: 'manual_required',
        platform: 'adobe_commerce',
        message: `No config-write endpoint configured. Clear ${this.ADOBE_CONFIG_PATH} manually (bin/magento config:set ${this.ADOBE_CONFIG_PATH} '' or the Admin HTML Head field).`,
      };
    }
    const f = await this.getFetch();
    const token = await this.adobeToken(conn, base, f);
    const url = endpoint.startsWith('http') ? endpoint : `${base}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    // Send an empty value with the marker so an append-safe endpoint removes
    // only our block.
    const res = await f(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        path: this.ADOBE_CONFIG_PATH,
        value: '',
        scope,
        scopeCode: scopeCode || undefined,
        marker: { start: this.ADOBE_MARKER_START, end: this.ADOBE_MARKER_END },
      }),
    });
    if (!res.ok) {
      return { status: 'manual_required', platform: 'adobe_commerce', message: `Config-write endpoint returned HTTP ${res.status}; remove ${this.ADOBE_CONFIG_PATH} manually.` };
    }
    await this.persistInstall(conn.id, conn.syncConfig, null);
    return { status: 'installed', platform: 'adobe_commerce', message: `Tracker block removed from ${this.ADOBE_CONFIG_PATH}.` };
  }

  private static async errText(res: Response): Promise<string> {
    try {
      const t = await res.text();
      return t ? t.slice(0, 300) : '';
    } catch {
      return '';
    }
  }
}

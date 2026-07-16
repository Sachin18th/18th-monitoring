import crypto from 'crypto';

/**
 * OrderNormalizationService (The CDM Engine)
 * 
 * Objective: 
 * Translates provider-specific payloads (Shopify, Magento, ERP) 
 * into the system's Canonical Data Model (CDM).
 */

export enum LifecycleState {
    PLACED = 'PLACED',
    PAID = 'PAID',
    SHIPPED = 'SHIPPED',
    DELIVERED = 'DELIVERED',
    RETURNED = 'RETURNED',
    CANCELLED = 'CANCELLED'
}

export interface CanonicalOrder {
    id: string;
    siteId: string;
    orderId: string;
    externalReferenceId?: string;
    sourceSystem: string;
    channel: string;
    lifecycleState: LifecycleState;
    currency: string;
    totalAmount: number;
    taxAmount: number;
    discountAmount: number;
    paidAmount: number;
    refundedAmount: number;
    placedAt: string;
    metadata: Record<string, any>;
    qualityScore: number;
}

export class OrderNormalizationService {
    
    /**
     * Entry point for normalization.
     */
    public async normalize(providerId: string, rawPayload: any, siteId: string, _tenantId: string, options?: { defaultCurrency?: string }): Promise<CanonicalOrder> {
        let canonical: Partial<CanonicalOrder>;

        switch (providerId.toLowerCase()) {
            case 'shopify':
                canonical = this.mapShopify(rawPayload);
                break;
            case 'bigcommerce':
                canonical = this.mapBigCommerce(rawPayload);
                break;
            case 'magento':
            case 'adobe_commerce':
                canonical = this.mapMagento(rawPayload);
                break;
            case 'csv':
                canonical = this.mapCsv(rawPayload, options?.defaultCurrency);
                break;
            default:
                canonical = this.mapGeneric(rawPayload);
        }

        canonical.id = crypto.randomUUID();
        canonical.siteId = siteId;
        canonical.sourceSystem = providerId;

        // Run Quality Gates
        const qualityResult = this.runQualityGates(canonical as CanonicalOrder);
        canonical.qualityScore = qualityResult.score;
        canonical.metadata = { 
            ...(canonical.metadata || {}), 
            qualityWarnings: qualityResult.warnings 
        };

        return canonical as CanonicalOrder;
    }

    private mapShopify(payload: any): Partial<CanonicalOrder> {
        return {
            orderId: payload.name || payload.id,
            externalReferenceId: payload.id,
            channel: payload.source_name || 'online',
            lifecycleState: this.mapStatus(payload.financial_status, payload.fulfillment_status),
            currency: payload.currency || 'USD',
            totalAmount: parseFloat(payload.total_price || '0'),
            taxAmount: parseFloat(payload.total_tax || '0'),
            discountAmount: parseFloat(payload.total_discounts || '0'),
            paidAmount: payload.financial_status === 'paid' ? parseFloat(payload.total_price || '0') : 0,
            refundedAmount: 0, // Simplified for demo
            placedAt: payload.created_at || new Date().toISOString(),
            metadata: { shopify_tags: payload.tags }
        };
    }

    private mapBigCommerce(payload: any): Partial<CanonicalOrder> {
        const status = String(payload?.status || payload?.order_status || payload?.status_name || '').toLowerCase();
        const totalAmount = parseFloat(String(payload?.total_inc_tax ?? payload?.total_ex_tax ?? payload?.total ?? '0'));
        const taxAmount = parseFloat(String(payload?.total_tax ?? payload?.tax_total ?? '0'));
        const discountAmount = Math.abs(parseFloat(String(payload?.coupon_discount ?? payload?.discount_amount ?? '0')));
        const customerEmail = payload?.customer?.email || payload?.billing_address?.email || payload?.email || null;

        return {
            orderId: payload?.order_number || payload?.id,
            externalReferenceId: payload?.id,
            channel: payload?.channel_name || payload?.channel || 'online',
            lifecycleState: this.mapBigCommerceStatus(status, payload),
            currency: payload?.currency_code || payload?.currency || 'USD',
            totalAmount,
            taxAmount,
            discountAmount,
            paidAmount: totalAmount > 0 ? totalAmount : 0,
            refundedAmount: Math.max(0, parseFloat(String(payload?.total_refunded ?? payload?.refunded_amount ?? '0'))),
            placedAt: payload?.date_created || payload?.created_at || new Date().toISOString(),
            metadata: {
                bigcommerce_status: payload?.status,
                bigcommerce_status_id: payload?.status_id,
                bigcommerce_customer_id: payload?.customer_id,
                customerEmail,
                buyerEmail: customerEmail,
                email: customerEmail,
                billing_email: payload?.billing_address?.email || payload?.email || null
            }
        };
    }

    private mapMagento(payload: any): Partial<CanonicalOrder> {
        const totalAmount = parseFloat(payload.grand_total ?? payload.base_grand_total ?? '0');
        const paidAmount = parseFloat(payload.total_paid ?? payload.base_total_paid ?? '0');
        const refundedAmount = parseFloat(payload.total_refunded ?? payload.base_total_refunded ?? '0');

        return {
            // Human-facing order number; entity_id is the internal/external reference.
            orderId: String(payload.increment_id ?? payload.entity_id ?? ''),
            externalReferenceId: payload.entity_id != null ? String(payload.entity_id) : undefined,
            channel: 'magento_store',
            lifecycleState: this.mapMagentoStatus(payload.state, payload.status),
            currency: payload.order_currency_code || payload.base_currency_code || 'USD',
            totalAmount,
            taxAmount: parseFloat(payload.tax_amount ?? payload.base_tax_amount ?? '0'),
            discountAmount: Math.abs(parseFloat(payload.discount_amount ?? payload.base_discount_amount ?? '0')),
            paidAmount: Number.isFinite(paidAmount) ? paidAmount : 0,
            refundedAmount: Number.isFinite(refundedAmount) ? refundedAmount : 0,
            // Magento returns the real order time in `created_at` as "YYYY-MM-DD HH:mm:ss" (UTC).
            // Normalize to a proper ISO instant so we record when the order was PLACED — not sync time.
            placedAt: this.toMagentoIso(payload.created_at),
            metadata: { magento_state: payload.state, magento_status: payload.status }
        };
    }

    /**
     * Magento/Adobe Commerce timestamps come back as "2026-06-03 11:37:34" in UTC
     * with no timezone marker. `new Date()` would treat that as local time. Convert
     * to an explicit UTC ISO string so placed_at reflects the true order time.
     */
    private toMagentoIso(value: any): string {
        if (!value) return new Date().toISOString();
        const str = String(value).trim();
        const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str)
            ? str.replace(' ', 'T') + 'Z'
            : str;
        const d = new Date(normalized);
        return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
    }

    private mapMagentoStatus(state: string, status: string): LifecycleState {
        const value = String(state || status || '').toLowerCase();
        if (value.includes('refund') || value.includes('return')) return LifecycleState.RETURNED;
        if (value.includes('cancel') || value.includes('void')) return LifecycleState.CANCELLED;
        if (value.includes('complete')) return LifecycleState.DELIVERED;
        if (value.includes('ship')) return LifecycleState.SHIPPED;
        if (value.includes('processing') || value.includes('paid')) return LifecycleState.PAID;
        return LifecycleState.PLACED;
    }

    /**
     * Maps a column-mapped spreadsheet row (CSV / Excel offline upload) into the CDM.
     * The frontend sends rows already keyed to the standardized fields:
     * order_id, order_date, customer_name, customer_email, sku, quantity,
     * unit_price, total, status, shipping_address.
     */
    private mapCsv(payload: any, defaultCurrency?: string): Partial<CanonicalOrder> {
        const toNum = (value: any) => {
            const parsed = parseFloat(String(value ?? '').replace(/[^0-9.\-]/g, ''));
            return Number.isFinite(parsed) ? parsed : 0;
        };

        const quantity = toNum(payload?.quantity) || 0;
        const unitPrice = toNum(payload?.unit_price);
        const explicitTotal = toNum(payload?.total);
        const totalAmount = explicitTotal > 0 ? explicitTotal : unitPrice * (quantity || 1);

        const rawDate = this.parseFlexibleDate(payload?.order_date);
        const placedAt = rawDate ? rawDate.toISOString() : new Date().toISOString();

        const lifecycleState = this.mapCsvStatus(String(payload?.status || ''));
        const customerEmail = payload?.customer_email || null;

        // Currency precedence: a value on the row (if a column was mapped) wins,
        // otherwise the operator-selected import currency is applied. USD is only a
        // last-resort safety net so the non-nullable column is never empty.
        const normalizeCurrency = (value: any): string | null => {
            const code = String(value ?? '').trim().toUpperCase();
            return /^[A-Z]{3}$/.test(code) ? code : null;
        };

        return {
            orderId: payload?.order_id ? String(payload.order_id) : 'CSV-' + Date.now(),
            externalReferenceId: payload?.order_id ? String(payload.order_id) : undefined,
            channel: 'offline',
            lifecycleState,
            currency: normalizeCurrency(payload?.currency) || normalizeCurrency(defaultCurrency) || 'USD',
            totalAmount,
            taxAmount: 0,
            discountAmount: 0,
            paidAmount: lifecycleState === LifecycleState.PLACED ? 0 : totalAmount,
            refundedAmount: lifecycleState === LifecycleState.RETURNED ? totalAmount : 0,
            placedAt,
            metadata: {
                orderSource: 'offline',
                customerEmail,
                customerName: payload?.customer_name || null,
                sku: payload?.sku || null,
                quantity: quantity || null,
                unitPrice: unitPrice || null,
                shippingAddress: payload?.shipping_address || null,
                rawStatus: payload?.status || null,
            }
        };
    }

    private mapCsvStatus(status: string): LifecycleState {
        const value = status.trim().toLowerCase();
        if (!value) return LifecycleState.PLACED;
        if (value.includes('refund') || value.includes('return')) return LifecycleState.RETURNED;
        if (value.includes('cancel') || value.includes('void')) return LifecycleState.CANCELLED;
        if (value.includes('deliver')) return LifecycleState.DELIVERED;
        if (value.includes('ship') || value.includes('fulfil')) return LifecycleState.SHIPPED;
        if (value.includes('paid') || value.includes('complete')) return LifecycleState.PAID;
        return LifecycleState.PLACED;
    }

    /**
     * Parses an order date from CSV/Excel cells, tolerating the formats JS's
     * native `new Date()` mishandles so offline orders get a real placed_at:
     *   - Date instances (xlsx cells already typed as dates)
     *   - Excel serial numbers (days since 1899-12-30, e.g. 45000)
     *   - ISO 8601 / RFC / "Jan 5 2024" (delegated to native parser)
     *   - DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY (with optional time) — defaults to
     *     day-first, swapping to month-first only when the day field exceeds 12.
     * Returns null when the value is empty or unparseable.
     */
    private parseFlexibleDate(value: any): Date | null {
        if (value === null || value === undefined || value === '') return null;
        if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

        // Excel serial date number (modern dates land in ~40000-46000).
        const numeric = typeof value === 'number'
            ? value
            : (/^\d+(\.\d+)?$/.test(String(value).trim()) ? Number(value) : NaN);
        if (Number.isFinite(numeric) && numeric > 20000 && numeric < 80000) {
            const d = new Date(Math.round((numeric - 25569) * 86400000));
            return isNaN(d.getTime()) ? null : d;
        }

        const str = String(value).trim();

        // DD/MM/YYYY (or MM/DD/YYYY) with / - or . separators and optional time.
        const m = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
        if (m) {
            let day = Number(m[1]);
            let month = Number(m[2]);
            let year = Number(m[3]);
            if (year < 100) year += 2000;
            if (month > 12 && day <= 12) { const t = day; day = month; month = t; }
            if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
                const d = new Date(year, month - 1, day, Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0));
                if (!isNaN(d.getTime())) return d;
            }
        }

        // Fallback: native parser (ISO 8601, "Jan 5 2024", US M/D/Y, etc.).
        const native = new Date(str);
        return isNaN(native.getTime()) ? null : native;
    }

    private mapGeneric(payload: any): Partial<CanonicalOrder> {
        return {
            orderId: payload.id || 'GEN-' + Date.now(),
            lifecycleState: LifecycleState.PLACED,
            totalAmount: payload.amount || 0,
            currency: payload.currency || 'USD',
            placedAt: new Date().toISOString(),
        };
    }

    private mapStatus(financial: string, fulfillment: string): LifecycleState {
        if (financial === 'refunded') return LifecycleState.RETURNED;
        if (financial === 'voided') return LifecycleState.CANCELLED;
        if (fulfillment === 'fulfilled') return LifecycleState.SHIPPED;
        if (financial === 'paid') return LifecycleState.PAID;
        return LifecycleState.PLACED;
    }

    private mapBigCommerceStatus(status: string, payload: any): LifecycleState {
        if (!status) {
            return LifecycleState.PLACED;
        }

        if (status.includes('refunded') || Number(payload?.status_id) === 4) return LifecycleState.RETURNED;
        if (status.includes('cancel') || Number(payload?.status_id) === 5) return LifecycleState.CANCELLED;
        if (status.includes('ship') || Number(payload?.status_id) === 2) return LifecycleState.SHIPPED;
        if (status.includes('complete') || status.includes('paid') || Number(payload?.status_id) === 3) return LifecycleState.PAID;
        return LifecycleState.PLACED;
    }

    private runQualityGates(order: CanonicalOrder): { score: number; warnings: string[] } {
        const warnings: string[] = [];
        let score = 100;

        if (!order.orderId) { warnings.push('Missing orderId'); score -= 40; }
        if (order.totalAmount < 0) { warnings.push('Negative order amount'); score -= 50; }
        if (!order.currency) { warnings.push('Missing currency'); score -= 20; }
        
        // Logical cross-check
        if (order.paidAmount > (order.totalAmount + 0.01)) {
            warnings.push('Paid amount exceeds total amount (Overpayment Anomaly)');
            score -= 30;
        }

        return { score, warnings };
    }
}

export const orderNormalizationService = new OrderNormalizationService();
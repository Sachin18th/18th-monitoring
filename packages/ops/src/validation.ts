import { ValidationStatus, DataQualityState } from '../../shared-types/src';

export type ValidationCategory = 'STRUCTURAL' | 'TEMPORAL' | 'IDENTITY' | 'REFERENTIAL' | 'BUSINESS' | 'QUALITY';

export interface ValidationRule {
    id: string;
    version: string;
    category: ValidationCategory;
    name: string;
    description: string;
    severity: 'CRITICAL' | 'HIGH' | 'LOW';
    validate: (payload: any) => { isValid: boolean; message?: string; field?: string; metadata?: any };
}

export interface ValidationResult {
    eventId: string;
    ruleId: string;
    ruleVersion: string;
    category: ValidationCategory;
    status: 'PASS' | 'FAIL' | 'WARN';
    message?: string;
    fieldPath?: string;
    severity: 'CRITICAL' | 'HIGH' | 'LOW';
    metadata?: any;
}

export class ValidationEngine {
    private static rules: ValidationRule[] = [
        // --- Structural Validation ---
        {
            id: 'V-STRUCT-001',
            version: '1.0.0',
            category: 'STRUCTURAL',
            name: 'REQUIRED_SITE_ID',
            description: 'Ensures siteId is present',
            severity: 'CRITICAL',
            validate: (p) => ({ isValid: !!p.siteId, field: 'siteId' })
        },
        // --- Temporal Validation ---
        {
            id: 'V-TEMP-001',
            version: '1.0.0',
            category: 'TEMPORAL',
            name: 'TIMESTAMP_BOUNDS',
            description: 'Timestamp should not be in the future or too old',
            severity: 'HIGH',
            validate: (p) => {
                const ts = p.sourceTimestamp ? new Date(p.sourceTimestamp).getTime() : Date.now();
                const now = Date.now();
                const diff = Math.abs(now - ts);
                const oneYear = 365 * 24 * 60 * 60 * 1000;
                return {
                    isValid: diff < oneYear,
                    message: diff >= oneYear ? 'Timestamp exceeds realistic bounds' : undefined,
                    field: 'sourceTimestamp'
                };
            }
        },
        // --- Identity & Uniqueness ---
        {
            id: 'V-IDENT-001',
            version: '1.0.1',
            category: 'IDENTITY',
            name: 'DEDUPE_KEY_PRESENT',
            description: 'Ensures sourceEventId or unique key is present',
            severity: 'HIGH',
            validate: (p) => ({ 
                isValid: !!(p.sourceEventId || p.id || p.order_id), 
                message: 'No external unique identifier found' 
            })
        },
        // --- Business Rule Validation ---
        {
            id: 'V-BUS-001',
            version: '1.1.0',
            category: 'BUSINESS',
            name: 'NEGATIVE_AMOUNT_CHECK',
            description: 'Transaction amounts must be non-negative',
            severity: 'CRITICAL',
            validate: (p) => {
                const amt = p.amount || p.grand_total || p.value;
                if (amt === undefined) return { isValid: true }; // Skips if field missing
                return {
                    isValid: parseFloat(amt) >= 0,
                    message: 'Amount cannot be negative',
                    field: 'amount'
                };
            }
        },
        // --- Domain Foundations: Orders (Requirement 12) ---
        {
            id: 'V-ORD-001',
            version: '1.0.0',
            category: 'BUSINESS',
            name: 'ORDER_SOURCE_VALIDITY',
            description: 'Validates order source is a known channel',
            severity: 'HIGH',
            validate: (p) => {
                if (p.eventType !== 'order_placed') return { isValid: true };
                const validSources = ['web', 'pos', 'mobile', 'market'];
                const source = p.metadata?.channel || p.channel;
                return {
                    isValid: validSources.includes(source),
                    message: `Invalid order source: ${source}`,
                    field: 'channel'
                };
            }
        },
        // --- Order Financial Correctness (Requirement 7) ---
        {
            id: 'V-ORD-FIN-001',
            version: '1.0.0',
            category: 'BUSINESS',
            name: 'FINANCIAL_TOTAL_CONSISTENCY',
            description: 'Grand Total must equal sum of subtotal, tax, and shipping minus discounts',
            severity: 'HIGH',
            validate: (p) => {
                if (p.eventType !== 'order_placed' && p.eventType !== 'POLL_SYNC') return { isValid: true };
                const sub = parseFloat(p.subtotal || p.subtotal_price || '0');
                const tax = parseFloat(p.total_tax || '0');
                const ship = parseFloat(p.total_shipping || '0');
                const disc = parseFloat(p.total_discounts || '0');
                const total = parseFloat(p.total_price || p.grand_total || '0');
                
                const expected = sub + tax + ship - disc;
                const diff = Math.abs(total - expected);
                
                return {
                    isValid: diff < 0.01,
                    message: diff >= 0.01 ? `Financial mismatch: Expected ${expected}, got ${total}` : undefined,
                    field: 'grand_total'
                };
            }
        },
        // --- Order Lifecycle Coherence (Requirement 8) ---
        {
            id: 'V-ORD-LIFE-001',
            version: '1.0.0',
            category: 'BUSINESS',
            name: 'REFUND_WITHOUT_PAYMENT',
            description: 'Prevents refund events if no payment has been recorded',
            severity: 'HIGH',
            validate: (p) => {
                if (p.eventType === 'order_refunded' && !p.metadata?.has_previous_payment) {
                    return { isValid: false, message: 'Refund detected without preceding payment' };
                }
                return { isValid: true };
            }
        },

        // --- Domain Foundations: Performance (Requirement 14) ---
        {
            id: 'V-PERF-001',
            version: '1.0.0',
            category: 'QUALITY',
            name: 'LATENCY_RANGE_CHECK',
            description: 'Checks if load times are within human-possible ranges',
            severity: 'LOW',
            validate: (p) => {
                const loadTime = p.metadata?.loadTime || p.loadTime;
                if (loadTime === undefined) return { isValid: true };
                return {
                    isValid: loadTime >= 0 && loadTime <= 60000, // Max 60s
                    message: 'Latency value is unrealistic',
                    field: 'loadTime'
                };
            }
        }
    ];


    static run(eventId: string, payload: any): { 
        status: ValidationStatus; 
        qualityState: DataQualityState;
        confidenceScore: number;
        results: ValidationResult[] 
    } {
        const results: ValidationResult[] = this.rules.map(rule => {
            const { isValid, message, field, metadata } = rule.validate(payload);
            return {
                eventId,
                ruleId: rule.id,
                ruleVersion: rule.version,
                category: rule.category,
                status: isValid ? 'PASS' : (rule.severity === 'CRITICAL' ? 'FAIL' : 'WARN'),
                message,
                fieldPath: field,
                severity: rule.severity,
                metadata
            };
        });

        const hasCriticalFail = results.some(r => r.status === 'FAIL');
        const hasWarning = results.some(r => r.status === 'WARN');
        
        let status: ValidationStatus = 'VALID';
        let qualityState: DataQualityState = 'VALID';
        
        if (hasCriticalFail) {
            status = 'REJECTED';
            qualityState = 'REJECTED';
        } else if (hasWarning) {
            status = 'WARNING';
            qualityState = 'WARNING';
        }

        // Calculate a simple confidence score
        const total = results.length;
        const passed = results.filter(r => r.status === 'PASS').length;
        const confidenceScore = total > 0 ? passed / total : 1.0;

        return { status, qualityState, confidenceScore, results };
    }

    /**
     * Re-validate quarantined data after rule updates.
     */
    static async revalidate(eventId: string, payload: any) {
        return this.run(eventId, payload);
    }
}


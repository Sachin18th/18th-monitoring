import crypto from 'crypto';

export enum FailureSeverity {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW'
}

export enum FailureCategory {
  UI = 'UI',
  API = 'API',
  VALIDATION = 'VALIDATION',
  PAYMENT = 'PAYMENT',
  INFRASTRUCTURE = 'INFRASTRUCTURE',
  BUSINESS_LOGIC = 'BUSINESS_LOGIC',
  THIRD_PARTY = 'THIRD_PARTY',
  UNKNOWN = 'UNKNOWN'
}

export interface ClassifiedFailure {
  fingerprint: string;
  severity: FailureSeverity;
  category: FailureCategory;
  isThirdParty: boolean;
}

export class FailureClassifier {
  static classify(eventType: string, metadata: any): ClassifiedFailure {
    const message = metadata.message || metadata.reason || 'Unknown Error';
    const stack = metadata.stack || '';
    
    // 1. Generate Fingerprint (Message + first line of stack if available)
    const normalizedStack = stack.split('\n')[0] || '';
    const fingerprint = crypto.createHash('md5').update(`${message}${normalizedStack}`).digest('hex');

    // 2. Determine Category & Severity
    let category = FailureCategory.UNKNOWN;
    let severity = FailureSeverity.MEDIUM;
    let isThirdParty = false;

    if (eventType === 'js_error') {
      category = FailureCategory.UI;
      severity = FailureSeverity.HIGH;
      
      // Check for third party indicators in stack or filename
      if (metadata.filename?.includes('cdn') || metadata.filename?.includes('google-analytics') || stack.includes('gtm.js')) {
        category = FailureCategory.THIRD_PARTY;
        isThirdParty = true;
        severity = FailureSeverity.LOW; // Usually less actionable
      }
    } else if (eventType === 'business_failure') {
      category = this.mapBusinessCategory(metadata.category);
      severity = this.determineBusinessSeverity(metadata.category, metadata.reason);
    } else if (eventType === 'backend_performance' && metadata.status >= 500) {
      category = FailureCategory.API;
      severity = FailureSeverity.CRITICAL;
    }

    return { fingerprint, severity, category, isThirdParty };
  }

  private static mapBusinessCategory(cat: string): FailureCategory {
    const c = cat.toLowerCase();
    if (c.includes('payment')) return FailureCategory.PAYMENT;
    if (c.includes('cart') || c.includes('checkout')) return FailureCategory.BUSINESS_LOGIC;
    if (c.includes('validation')) return FailureCategory.VALIDATION;
    return FailureCategory.BUSINESS_LOGIC;
  }

  private static determineBusinessSeverity(cat: string, reason: string): FailureSeverity {
    const c = cat.toLowerCase();
    const r = reason.toLowerCase();
    
    if (c.includes('payment') || c.includes('order')) return FailureSeverity.CRITICAL;
    if (r.includes('timeout') || r.includes('connection')) return FailureSeverity.HIGH;
    return FailureSeverity.MEDIUM;
  }
}

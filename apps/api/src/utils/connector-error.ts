import { BackendErrorCategory } from '../../../../packages/shared-types/src';

export interface ConnectorErrorOptions {
    category: BackendErrorCategory;
    providerError?: any;
    recoverable: boolean;
    retryRecommendation?: 'IMMEDIATE' | 'BACKOFF' | 'MANUAL';
    severity: 'CRITICAL' | 'HIGH' | 'LOW';
}

export class ConnectorError extends Error {
    public category: BackendErrorCategory;
    public providerError: any;
    public recoverable: boolean;
    public retryRecommendation: 'IMMEDIATE' | 'BACKOFF' | 'MANUAL';
    public severity: 'CRITICAL' | 'HIGH' | 'LOW';
    public timestamp: Date;

    constructor(message: string, options: ConnectorErrorOptions) {
        super(message);
        this.name = 'ConnectorError';
        this.category = options.category;
        this.providerError = options.providerError;
        this.recoverable = options.recoverable;
        this.retryRecommendation = options.retryRecommendation || 'BACKOFF';
        this.severity = options.severity || 'HIGH';
        this.timestamp = new Date();
    }

    public toJSON() {
        return {
            name: this.name,
            message: this.message,
            category: this.category,
            providerError: this.providerError,
            recoverable: this.recoverable,
            retryRecommendation: this.retryRecommendation,
            severity: this.severity,
            timestamp: this.timestamp.toISOString(),
        };
    }
}

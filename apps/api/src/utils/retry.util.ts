/**
 * Retry utility with exponential backoff + full jitter.
 *
 * Jitter prevents thundering-herd when many workers retry simultaneously.
 *
 * Usage:
 *   const result = await withRetry(() => externalApi.fetchOrders(), {
 *       maxAttempts: 5,
 *       baseDelayMs: 2000,
 *       onRetry: (attempt, err) => console.warn(`Retry ${attempt}:`, err.message),
 *   });
 */

export interface RetryOptions {
    maxAttempts?: number;    // default 5
    baseDelayMs?: number;    // default 2000ms
    maxDelayMs?: number;     // default 30000ms (30s cap)
    onRetry?: (attempt: number, error: Error) => void;
    shouldRetry?: (error: Error) => boolean; // return false to abort early
}

export class RetryExhaustedError extends Error {
    public readonly attempts: number;
    public readonly lastError: Error;
    constructor(attempts: number, lastError: Error) {
        super(`Operation failed after ${attempts} attempt(s): ${lastError.message}`);
        this.name = 'RetryExhaustedError';
        this.attempts = attempts;
        this.lastError = lastError;
    }
}

function jitteredDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
    // Full jitter: random value between 0 and min(maxDelay, base * 2^attempt)
    const exponential = baseDelayMs * Math.pow(2, attempt);
    const capped = Math.min(exponential, maxDelayMs);
    return Math.floor(Math.random() * capped);
}

export async function withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const {
        maxAttempts = 5,
        baseDelayMs = 2000,
        maxDelayMs  = 30_000,
        onRetry,
        shouldRetry = () => true,
    } = options;

    let lastError!: Error;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));

            if (attempt === maxAttempts - 1) break;
            if (!shouldRetry(lastError)) break;

            onRetry?.(attempt + 1, lastError);

            const delayMs = jitteredDelay(attempt, baseDelayMs, maxDelayMs);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    throw new RetryExhaustedError(maxAttempts, lastError);
}

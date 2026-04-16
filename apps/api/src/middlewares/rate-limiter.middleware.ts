/**
 * Rate Limiter Middleware
 * 
 * In-memory sliding window rate limiter per IP address.
 * 
 * PRODUCTION NOTE: Replace with Redis-backed sliding window (e.g. `rate-limiter-flexible`)
 * to support distributed deployments where multiple API instances share state.
 */

interface RateLimitWindow {
    count: number;
    windowStart: number;
}

// Store: ip → { count, windowStart }
const ipWindows = new Map<string, RateLimitWindow>();

function getClientIp(req: any): string {
    // Respect X-Forwarded-For when behind a reverse proxy / load balancer
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return String(forwarded).split(',')[0].trim();
    return req.ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * Build a configurable Fastify pre-handler for rate limiting.
 *
 * @param maxRequests  Max allowed requests in the window
 * @param windowMs     Window duration in milliseconds
 */
export const rateLimiter = (maxRequests: number, windowMs: number) => {
    return async (req: any, reply: any) => {
        const ip = getClientIp(req);
        const now = Date.now();

        const window = ipWindows.get(ip);

        if (!window || (now - window.windowStart) > windowMs) {
            // New window
            ipWindows.set(ip, { count: 1, windowStart: now });
            return;
        }

        window.count++;

        if (window.count > maxRequests) {
            const retryAfterSec = Math.ceil((window.windowStart + windowMs - now) / 1000);
            reply.header('Retry-After', String(retryAfterSec));
            return reply.code(429).send(errorResponse(
                'RATE_LIMITED',
                'Too many requests. Please slow down.',
                { retryAfterSeconds: retryAfterSec }
            ));
        }
    };
};

// Periodic cleanup to prevent memory leak in long-running processes
setInterval(() => {
    const now = Date.now();
    for (const [ip, window] of ipWindows.entries()) {
        if ((now - window.windowStart) > 60_000) {  // clean up windows older than 1 min
            ipWindows.delete(ip);
        }
    }
}, 60_000);

// Import here to avoid circular — in prod use a shared error factory module
function errorResponse(code: string, message: string, meta: any = {}) {
    return { error: { code, message, ...meta } };
}

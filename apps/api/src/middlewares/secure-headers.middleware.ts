/**
 * Secure Headers Middleware
 *
 * Applies a production-grade set of HTTP security headers to every response.
 *
 * PRODUCTION NOTE: Use `@fastify/helmet` for a maintained, comprehensive
 * implementation. This is a lightweight equivalent for the MVP.
 *
 * References:
 *  - OWASP Secure Headers Project: https://owasp.org/www-project-secure-headers/
 *  - Mozilla Observatory: https://observatory.mozilla.org/
 */
export const secureHeaders = async (_req: any, reply: any) => {
    // Prevents MIME-type sniffing
    reply.header('X-Content-Type-Options', 'nosniff');

    // Prevents clickjacking via iframes
    reply.header('X-Frame-Options', 'DENY');

    // Enables browser XSS filter (legacy, but harmless)
    reply.header('X-XSS-Protection', '1; mode=block');

    // Restricts access to powerful features (camera, mic, etc.)
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    // Controls referrer information included with requests
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Content Security Policy — tightened for API (no HTML rendering required)
    reply.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");

    // Forces HTTPS connections for 1 year — ENABLE ONLY WITH TLS IN PRODUCTION
    // reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    // TODO: Uncomment above when TLS termination is configured at load balancer

    // Removes "X-Powered-By" leakage
    reply.removeHeader('X-Powered-By');

    // Server identity obfuscation
    reply.header('Server', 'KPIMonitor/1.0');
};

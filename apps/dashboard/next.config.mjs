/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    transpilePackages: ['@kpi-platform/ui'],
    typescript: {
        ignoreBuildErrors: true,
    },
     webpack(config, { dev }) {
        if (dev) {
            config.watchOptions = {
                ...(config.watchOptions || {}),
                poll: 1000,
                ignored: ['**/node_modules/**', '**/.next/**'],
            };
        }

        return config;
    },
    
    // A live PageSpeed refresh proxies to the backend, which calls Google PSI — a
    // single scan can take 90s (desktop) to ~240s (mobile, with retry). Next's rewrite
    // proxy defaults to a 30s timeout: past that it destroys the upstream socket, which
    // surfaces as "Failed to proxy … socket hang up (ECONNRESET)" and a 500 to the
    // browser while the last-cached numbers stay on screen. Hold the proxied connection
    // as long as the dashboard's own apiFetch is willing to wait (250s) so the fresh
    // result actually comes back instead of resetting mid-scan.
    experimental: {
        proxyTimeout: 250000,
    },
    // Next.js 16 blocks dev/HMR requests from non-localhost origins. When the
    // app is reached through a tunnel (ngrok) the browser origin is that tunnel
    // host, so it must be allow-listed or the client never hydrates (the page
    // stays stuck on the SSR "Initializing workspace…" state). Wildcards cover
    // ngrok's rotating free subdomains.
    allowedDevOrigins: [
        '*.ngrok-free.dev',
        '*.ngrok-free.app',
        '*.ngrok.io',
        '*.ngrok.app',
    ],
    async redirects() {
        return [
            {
                source: '/project/:projectId/Cutomers',
                destination: '/project/:projectId/customers',
                permanent: true,
            },
        ];
    },
    // Proxy all API calls to the backend so the browser only ever talks to the
    // dashboard's own origin. This is what makes ngrok (and any single-origin
    // tunnel) work: one public host, no mixed-content, no CORS. The backend
    // target stays server-side and is never exposed to the browser.
    async rewrites() {
        const apiTarget = (process.env.API_PROXY_TARGET || 'http://localhost:4000').replace(/\/+$/, '');
        return [
            { source: '/api/:path*', destination: `${apiTarget}/api/:path*` },
        ];
    },
};

export default nextConfig;

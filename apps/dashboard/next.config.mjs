/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    transpilePackages: ['@kpi-platform/ui'],
    typescript: {
        ignoreBuildErrors: true, 
    },
    async redirects() {
        return [
            {
                source: '/project/:projectId/Cutomers',
                destination: '/project/:projectId/customers',
                permanent: true,
            },
        ];
    },
};

export default nextConfig;

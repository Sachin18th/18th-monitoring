/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
<<<<<<< HEAD
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
=======

    typescript: {
        ignoreBuildErrors: true, 
    }
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
};

export default nextConfig;

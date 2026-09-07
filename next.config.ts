import type { NextConfig } from 'next';

const securityHeaders = [
    {
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin',
    },
    {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
    },
    {
        key: 'X-Frame-Options',
        value: 'DENY',
    },
    {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(self)',
    },
] as const;

const nextConfig: NextConfig = {
    allowedDevOrigins: ['*.lhr.life'],
    async headers() {
        return [
            {
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
                    },
                ],
                source: '/',
            },
            {
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'no-cache, no-store, must-revalidate',
                    },
                    {
                        key: 'Service-Worker-Allowed',
                        value: '/',
                    },
                ],
                source: '/sw.js',
            },
            {
                headers: [...securityHeaders],
                source: '/:path*',
            },
        ];
    },
    distDir: 'dist',
    poweredByHeader: false,
    reactStrictMode: true,
};

export default nextConfig;

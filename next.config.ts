import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'storage.efferd.com',
        pathname: '/**',
      },
    ],
  },
  async headers() {
    return [
      {
        // Expose the custom validation-error header to the browser for /api/* responses.
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Expose-Headers',
            value: 'X-Validation-Errors',
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        // Proxy all /api/* calls to the Django backend so cookies stay
        // on the same origin (localhost:3000) and CORS is not an issue.
        source: '/api/:path*',
        destination: 'http://localhost:8000/api/:path*',
      },
      {
        // Proxy /media/* so uploaded files (avatars, etc.) are accessible
        // from the same origin without CORS issues.
        source: '/media/:path*',
        destination: 'http://localhost:8000/media/:path*',
      },
    ];
  },
};

export default nextConfig;

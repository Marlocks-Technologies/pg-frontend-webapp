/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable React strict mode for catching common mistakes
  reactStrictMode: true,

  // Allow images from the firm's own domain if ever needed
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'perchstoneandgraeys.com',
      },
    ],
  },

  // Local development only. Prod API Gateway allows exactly one origin — the
  // Vercel deployment — so a browser on localhost is rejected at the preflight.
  // Routing through the Next server makes the call same-origin, so no preflight
  // happens at all. Not registered in a production build: there the browser
  // talks to API Gateway directly and the origin allowlist does its job.
  async rewrites() {
    if (process.env.NODE_ENV === 'production') return [];
    const target =
      process.env.API_PROXY_TARGET ||
      'https://r17l0a5vbi.execute-api.eu-west-1.amazonaws.com/prod';
    return [{ source: '/api/backend/:path*', destination: `${target}/:path*` }];
  },

  // Ensure API calls from the browser respect CORS
  // (the Lambda API Gateway handles CORS headers on its end)
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;

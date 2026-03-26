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

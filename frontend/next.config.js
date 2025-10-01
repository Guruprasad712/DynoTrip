/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    appDir: true
  },
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [
          { type: 'header', key: 'host', value: 'dyno-trip-9upy-dtcy4grgk-gurus-projects-a3f6e9b5.vercel.app' },
        ],
        destination: 'https://dyno-trip-9upy.vercel.app/:path*',
        permanent: true, // 308
      },
    ];
  }
};
module.exports = nextConfig;

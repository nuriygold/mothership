/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: true,
  },
  transpilePackages: ['@xterm/xterm', '@xterm/addon-fit'],
};

module.exports = nextConfig;

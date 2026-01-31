/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },

  // Transpile local monorepo packages
  transpilePackages: ['@waveswap/sdk', '@waveswap/ui'],

  // External packages for server components
  serverExternalPackages: ['@solana/web3.js', '@solana/spl-token'],

  // Environment variables available on the client side
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },

  // Headers for security
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        {
          key: 'X-Content-Type-Options',
          value: 'nosniff',
        },
        {
          key: 'X-Frame-Options',
          value: 'DENY',
        },
        {
          key: 'X-XSS-Protection',
          value: '1; mode=block',
        },
        {
          key: 'Referrer-Policy',
          value: 'strict-origin-when-cross-origin',
        },
      ],
    },
    {
      // Fix CSS MIME type issue
      source: '/_next/static/css/(.*)',
      headers: [
        {
          key: 'Content-Type',
          value: 'text/css',
        },
      ],
    },
    {
      // Fix JS MIME type issue
      source: '/_next/static/chunks/(.*).js',
      headers: [
        {
          key: 'Content-Type',
          value: 'application/javascript',
        },
      ],
    },
    {
      // Fix app JS MIME type issue
      source: '/_next/static/(.*).js',
      headers: [
        {
          key: 'Content-Type',
          value: 'application/javascript',
        },
      ],
    },
  ],

  // Image optimization
  images: {
    domains: [
      'localhost',
      'raw.githubusercontent.com',
      'img-cdn.jup.ag',
      'arweave.net'
    ],
    formats: ['image/webp', 'image/avif'],
  },

  // Webpack configuration for Solana libraries
  webpack: (config, { isServer }) => {
    const path = require('path');

    // Resolve local monorepo packages
    config.resolve.alias = {
      ...config.resolve.alias,
      '@waveswap/sdk': path.resolve(__dirname, '../../packages/sdk/src'),
      '@waveswap/ui': path.resolve(__dirname, '../../packages/ui/src'),
      '^/test/mocks/(.*)$': false,
    };

    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        url: false,
        zlib: false,
        http: false,
        https: false,
        assert: false,
        os: false,
        path: false,
      };
    }
    return config;
  },
}

module.exports = nextConfig
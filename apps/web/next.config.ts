import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactCompiler: true,
  experimental: {
    // Externalize heavy Node-only libs so they're required at runtime in Node, not bundled by Turbopack
    serverComponentsExternalPackages: [
      'mjml',
      'nodemailer',
      'uglify-js',
      'juice',
      'html-minifier',
      'css-select',
      'cheerio',
    ],
  },
};

export default nextConfig;

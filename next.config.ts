import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Brand fonts and design-system tokens are repository assets; they are
  // bundled by the app (next/font/local + global CSS), never served from a CDN.
};

export default nextConfig;

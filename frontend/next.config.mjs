/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable Partial Prerendering (Next.js 15)
  experimental: {
    // PPR requires next@canary; disabled for stable Next.js 15
    // ppr: true,
    // React Compiler (experimental — reduces manual memoization)
    reactCompiler: false,
  },
};

export default nextConfig;

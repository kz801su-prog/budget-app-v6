/** @type {import('next').NextConfig} */
const nextConfig = {
  // Remove 'output: export' to allow server-side rendering
  images: {
    unoptimized: true,
  },
};

export default nextConfig;

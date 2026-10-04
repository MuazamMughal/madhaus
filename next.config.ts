import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  images: { remotePatterns: [{ protocol: "https", hostname: "cdn.sanity.io", pathname: "/images/**" }] },
};

export default nextConfig;

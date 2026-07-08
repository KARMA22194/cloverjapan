import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Innerhalb des Docker-Bind-Mounts zuverlässiges HMR
  webpack: (config) => {
    config.watchOptions = {
      poll: 1000,
      aggregateTimeout: 300,
    };
    return config;
  },
};

export default nextConfig;

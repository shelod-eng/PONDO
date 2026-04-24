import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.PONDO_ADMIN_MODE === "true" ? ".next-admin" : ".next",
};

export default nextConfig;

import type { NextConfig } from "next";

const config: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["bcryptjs"],
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
};

export default config;

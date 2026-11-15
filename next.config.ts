import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["bcryptjs"],
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
};

export default config;

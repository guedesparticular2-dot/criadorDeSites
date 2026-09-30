import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ["@baixada/core", "@baixada/contracts"],
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default config;

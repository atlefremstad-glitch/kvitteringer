import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // heic-convert bruker WebAssembly og skal ikke pakkes av bundleren
  serverExternalPackages: ["heic-convert", "libheif-js"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

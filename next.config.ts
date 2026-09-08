import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // On Windows, the dev server intermittently fails with
  // `UNKNOWN: open ... .next/server/app-paths-manifest.json` (errno -4094).
  // The root cause is contention on the `.next` build cache: antivirus locking
  // files mid-write and/or webpack's on-disk cache being written to a folder
  // that another process/scan holds open. Using an in-memory dev cache avoids
  // most of the disk contention that corrupts the routing manifests.
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = { type: "memory" };
    }
    return config;
  },
  async redirects() {
    return [
      {
        source: "/:match(tiquete|pagar|buscar|entrega|aprobar|app|admin|registro|mini-landing)\\.html",
        destination: "/:match",
        permanent: true
      }
    ];
  }
};

export default nextConfig;

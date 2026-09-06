import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
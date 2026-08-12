import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async headers() {
    return [
      {
        // Service worker scripts must never be cached long-term — a stale
        // cached sw.js would keep an old caching/push implementation
        // running for whoever last fetched it, sometimes indefinitely.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;

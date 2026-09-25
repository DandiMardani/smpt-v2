import type { NextConfig } from "next";
import dns from "node:dns";

// Optimize DNS lookup to avoid local network resolution timeouts
try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch {
  // Ignore in environments where setting DNS servers is restricted
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;

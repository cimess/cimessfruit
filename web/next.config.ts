import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins:['192.168.0.197',"192.168.0.197.sslip.io:3000",
"192.168.0.197.sslip.io"
],
};

export default nextConfig;

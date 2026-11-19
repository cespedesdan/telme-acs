import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

// Root configuration stays on the server; never expose credentials as NEXT_PUBLIC_*.
const rootEnvironment = new URL("../../.env", import.meta.url);
if (existsSync(rootEnvironment)) loadEnvFile(rootEnvironment);

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  allowedDevOrigins: ["127.0.0.1"],
  async rewrites() {
    const api = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3101";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${api}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

// Die **Content-Security-Policy** steht bewusst nicht mehr hier, sondern in
// `src/middleware.ts` (Regeln in `src/lib/csp.ts`): sie enthält pro Request einen
// Nonce und kann deshalb nicht statisch sein. Ein statischer Header hier würde den
// dynamischen überschreiben.
//
// Alles Übrige ist requestunabhängig und bleibt an dieser Stelle.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // geolocation=(self): eigener Standort für den Konbini-Radar ("in meiner Nähe").
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
];

const nextConfig: NextConfig = {
  // Eigenständiges Server-Bundle (server.js + minimales node_modules) für
  // schlanke Docker-Images beim Self-Hosting. Auf Vercel unschädlich.
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Innerhalb des Docker-Bind-Mounts zuverlässiges HMR
  webpack: (config) => {
    config.watchOptions = {
      poll: 1000,
      aggregateTimeout: 300,
    };
    return config;
  },
};

export default nextConfig;

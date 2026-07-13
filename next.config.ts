import type { NextConfig } from "next";

// Content-Security-Policy: bewusst pragmatisch für diese App.
//  - frame-ancestors 'none' + X-Frame-Options: DENY → Clickjacking-Schutz.
//  - img-src erlaubt data:/blob: (Avatare als Data-URL) und https: (Karten-Tiles von CARTO).
//  - connect-src https: → server-seitige Fetches laufen ohnehin serverseitig; der Client
//    spricht die eigene API (self) + Tile-CDN.
//  - 'unsafe-inline' bei script/style ist nötig für das FOUC-vermeidende Inline-Theme-Script
//    und Leaflet/Swagger-Inline-Styles. Ein nonce-basiertes Script-Setup wäre die strengere
//    Ausbaustufe; XSS-Vektoren werden bereits an der Quelle entschärft (siehe TripPlanner).
// Next.js braucht im Dev-Modus eval() (React Fast Refresh / webpack-HMR) sowie
// WebSocket für HMR — daher dort 'unsafe-eval' + ws:. In Produktion bleibt script-src
// streng ohne 'unsafe-eval'.
const isDev = process.env.NODE_ENV !== "production";
const scriptSrc = ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])].join(" ");
const connectSrc = ["'self'", "https:", ...(isDev ? ["ws:"] : [])].join(" ");

const CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob: https:",
  "style-src 'self' 'unsafe-inline'",
  `script-src ${scriptSrc}`,
  `connect-src ${connectSrc}`,
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
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

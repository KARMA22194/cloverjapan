import type { CapacitorConfig } from "@capacitor/cli";

// Diese App ist eine Server-App (SSR / Server Actions / Prisma) — kein statischer
// Export möglich. Die native App ist deshalb ein WebView auf die gehostete Next-App.
//   - Produktion: server.url = deine HTTPS-Domain.
//   - Lokaler Test: server.url = http://<LAN-IP-deines-Rechners>:3000 (NICHT localhost,
//     das wäre das Gerät selbst) + cleartext: true.
const config: CapacitorConfig = {
  appId: "de.etikett.timetracker",
  appName: "Time Tracker",
  webDir: "www",
  server: {
    url: process.env.CAP_SERVER_URL ?? "https://deine-domain.example",
    cleartext: true,
  },
};

export default config;

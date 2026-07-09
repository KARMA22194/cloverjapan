import { defineConfig, devices } from "@playwright/test";

// Läuft im Container gegen den Dev-Server (http://localhost:3000), mobiles Gerät.
export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    ...devices["Pixel 5"],
    launchOptions: { args: ["--no-sandbox", "--disable-setuid-sandbox"] },
  },
});

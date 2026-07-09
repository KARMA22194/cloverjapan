import { test, expect } from "@playwright/test";

test.describe("PWA (mobil)", () => {
  test("Login-Seite rendert mobil ohne horizontalen Overflow", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Anmelden", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Fingerabdruck/ })).toBeVisible();
    await expect(page.getByRole("img", { name: "Logo" }).first()).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("Manifest ist verlinkt, gültig und Icons abrufbar (installierbar)", async ({
    page,
    request,
  }) => {
    await page.goto("/login");
    const href = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(href).toBeTruthy();

    const res = await request.get(href!);
    expect(res.ok()).toBeTruthy();
    const manifest = await res.json();
    expect(manifest.name).toBe("Time Tracker");
    expect(manifest.display).toBe("standalone");
    expect(Array.isArray(manifest.icons) && manifest.icons.length).toBeGreaterThanOrEqual(2);

    for (const icon of manifest.icons) {
      const ir = await request.get(icon.src);
      expect(ir.ok(), `Icon ${icon.src} abrufbar`).toBeTruthy();
    }
  });

  test("Service-Worker registriert und aktiviert sich", async ({ page }) => {
    await page.goto("/login");
    const active = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return false;
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((r) => setTimeout(() => r(null), 10000)),
      ]);
      return !!(reg && (reg as ServiceWorkerRegistration).active);
    });
    expect(active).toBeTruthy();
  });

  test("Login funktioniert mobil und zeigt die App-Navigation", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-Mail").fill("employee@etikett.de");
    await page.getByLabel("Passwort").fill("password123");
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();

    await page.waitForURL(/\/(start|day)/, { timeout: 20000 });
    await expect(page.getByRole("button", { name: /Timetracker/ })).toBeVisible();
  });
});

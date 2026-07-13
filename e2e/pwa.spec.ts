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
    expect(manifest.name).toBe("CloverJapanPlaner");
    expect(manifest.display).toBe("standalone");
    expect(Array.isArray(manifest.icons) && manifest.icons.length).toBeGreaterThanOrEqual(2);

    for (const icon of manifest.icons) {
      const ir = await request.get(icon.src);
      expect(ir.ok(), `Icon ${icon.src} abrufbar`).toBeTruthy();
    }
  });

  test("Service-Worker-Datei ist auslieferbar (Prod-installierbar)", async ({ request }) => {
    // In der Entwicklung wird der SW bewusst NICHT registriert (kein veralteter Cache);
    // die Datei muss aber vorhanden sein, damit die PWA in Produktion installierbar ist.
    const res = await request.get("/sw.js");
    expect(res.ok()).toBeTruthy();
    expect(await res.text()).toContain("addEventListener");
  });

  test("Login funktioniert mobil und zeigt die App-Navigation", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-Mail").fill("employee@clover.japan");
    await page.getByLabel("Passwort").fill("password123");
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();

    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
    await expect(page.getByRole("button", { name: /Japan/ })).toBeVisible();
  });
});

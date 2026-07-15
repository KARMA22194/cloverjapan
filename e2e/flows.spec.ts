import { test, expect, type Page } from "@playwright/test";

const EMAIL = "admin@clover.japan";
const PW = "password123";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-Mail").fill(EMAIL);
  await page.getByLabel("Passwort").fill(PW);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 }),
    page.getByRole("button", { name: "Anmelden", exact: true }).click(),
  ]);
}

test.describe("Kern-Flows (Japan)", () => {
  test("Login-Seite: Registrieren- und Passwort-vergessen-Link", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("link", { name: "Registrieren" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Passwort vergessen/ })).toBeVisible();
  });

  test("Login → Start zeigt den Japan-Bereich", async ({ page }) => {
    await login(page);
    await page.goto("/start");
    await expect(page.getByText("Reiseplaner")).toBeVisible();
    await expect(page.getByText("Geld", { exact: true })).toBeVisible();
    await expect(page.getByText("Flüge", { exact: true })).toBeVisible();
  });

  test("Zollrechner rechnet die Abgaben", async ({ page }) => {
    await login(page);
    await page.goto("/zoll");
    await page.getByPlaceholder("z. B. 900").fill("900");
    await expect(page.getByText("470,00", { exact: false })).toBeVisible();
    await expect(page.getByText("82,25", { exact: false })).toBeVisible();
  });

  test("Wetter zeigt mehrere Städte", async ({ page }) => {
    await login(page);
    await page.goto("/wetter");
    for (const city of ["Tokio", "Kyoto", "Osaka", "Sapporo", "Fukuoka"]) {
      await expect(page.getByRole("heading", { name: city })).toBeVisible();
    }
  });

  test("Flüge-Seite zeigt das Erfassungsformular", async ({ page }) => {
    await login(page);
    await page.goto("/fluege");
    await expect(page.getByPlaceholder("LH716")).toBeVisible();
    await expect(page.getByRole("button", { name: /Flugdaten holen/ })).toBeVisible();
  });

  test("Reiseplaner zeigt die Hotel-Kachel", async ({ page }) => {
    await login(page);
    await page.goto("/reiseplaner");
    await expect(page.getByText("🏨 Hotel / Unterkunft")).toBeVisible();
    await expect(page.getByPlaceholder("Name oder Google-Maps-Link")).toBeVisible();
    await expect(page.getByRole("button", { name: "Speichern" })).toBeVisible();
  });

  test("Entfernte Timetracker-Routen sind weg (404)", async ({ page }) => {
    await login(page);
    const res = await page.goto("/day/2026-07-10");
    expect(res?.status()).toBe(404);
  });
});

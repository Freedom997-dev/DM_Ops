import { chromium } from "playwright";

const BASE = "http://localhost:3001";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  console.log("--- LOGIN ---");
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"], input[type="email"]', "admin@divyamotel.com");
  await page.fill('input[name="password"], input[type="password"]', "ChangeMe123!");
  await page.click('button[type="submit"]');
  await page.waitForURL(/services|\/$/, { timeout: 15000 });
  console.log("Landed on:", page.url());
  await page.screenshot({ path: "pw_1_dashboard.png" });

  console.log("--- ROLES MATRIX ---");
  await page.goto(`${BASE}/settings/access`);
  await page.waitForSelector("text=Super Admin", { timeout: 10000 });
  const roleNames = await page.locator("text=/Super Admin|Admin|Manager|Inspector|Housekeeper/").allTextContents();
  console.log("Roles found:", [...new Set(roleNames)]);
  await page.screenshot({ path: "pw_2_roles.png", fullPage: true });

  console.log("--- HOUSEKEEPING PAGE ---");
  await page.goto(`${BASE}/services/housekeeping`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "pw_3_housekeeping.png", fullPage: true });

  console.log("--- WEAK PASSWORD REJECTION ---");
  await page.goto(`${BASE}/settings/staff`);
  await page.waitForSelector("text=Add staff", { timeout: 10000 });
  await page.click("text=Add staff");
  await page.fill('input[name="name"]', "Test Weakpass");
  await page.fill('input[name="email"]', `weakpass-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "pass1");
  const submit = page.locator('button[type="submit"]', { hasText: /add|create|save/i }).first();
  await page.getByRole("button", { name: /add staff|create|save/i }).last().click().catch(async () => {
    await submit.click();
  });
  await page.waitForTimeout(1500);
  const bodyText = await page.locator("body").innerText();
  const rejected = /at least 8 characters|must include|too common/i.test(bodyText);
  console.log("Weak password rejected:", rejected);
  await page.screenshot({ path: "pw_4_weakpass.png", fullPage: true });

  console.log("--- CONSOLE ERRORS ---");
  console.log(consoleErrors.length ? consoleErrors : "none");

  await browser.close();
})().catch((e) => {
  console.error("SCRIPT FAILED:", e);
  process.exit(1);
});

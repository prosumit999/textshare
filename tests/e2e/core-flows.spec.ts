import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("home, theme and responsive navigation work", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const before = await page.locator("html").getAttribute("data-theme");
  await page.locator("#theme-toggle").click();
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-theme",
    before || "light",
  );
  if (testInfo.project.name.includes("mobile")) {
    await expect(page.locator(".mobile-bottom-nav")).toBeVisible();
    await expect(page.locator(".mobile-nav-create")).toBeVisible();
  } else
    await expect(
      page.getByRole("link", { name: /join room/i }).first(),
    ).toBeVisible();
});

test("join preserves the password gate", async ({ page }) => {
  await page.goto("/join");
  await page.locator("#room-code").fill("password");
  await page.getByRole("button", { name: /join room/i }).click();
  await expect(page).toHaveURL(/\/password$/);
  await expect(page.getByLabel(/password/i)).toBeVisible();
  await page.getByLabel(/password/i).fill("wrong-password");
  await page.getByRole("button", { name: /unlock|view/i }).click();
  await expect(page.getByRole("alert")).toContainText(/incorrect/i);
  await page.getByLabel(/password/i).fill("password");
  await page.getByRole("button", { name: /unlock|view/i }).click();
  await expect(page.getByText(/unlocks successfully/i)).toBeVisible();
});

test("expired and guessed admin URLs do not disclose resources", async ({
  page,
}) => {
  await page.goto("/expired");
  await expect(page.getByText(/expired/i).first()).toBeVisible();
  const response = await page.goto("/8010952940-admin");
  expect(response?.status()).toBe(404);
  await expect(page.getByText(/expired|unavailable/i).first()).toBeVisible();
});

test("guest burn-after-read share is removed after first recipient", async ({
  browser,
  page,
}) => {
  await page.goto("/");
  await page.locator("#share-text-content").fill("burn integration content");
  await page.locator("#expiry-select").selectOption("burn");
  await page.getByRole("button", { name: /create share/i }).click();
  await expect(page).toHaveURL(/\/[a-z0-9]{6}/);
  const url = page.url();
  const recipient = await browser.newContext();
  const recipientPage = await recipient.newPage();
  await recipientPage.goto(url);
  await expect(
    recipientPage.getByText("burn integration content"),
  ).toBeVisible();
  await recipient.close();
  const later = await browser.newPage();
  await later.goto(url);
  await expect(later.getByText(/expired/i).first()).toBeVisible();
});

for (const path of [
  "/",
  "/join",
  "/blog",
  "/login",
  "/signup",
  "/forgot-password",
  "/verify-email",
  "/reset-password",
  "/terms",
  "/privacy",
  "/refund-policy",
  "/acceptable-use",
  "/contact",
])
  test(`has no serious accessibility violations: ${path}`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((violation) =>
        ["serious", "critical"].includes(violation.impact || ""),
      ),
    ).toEqual([]);
  });

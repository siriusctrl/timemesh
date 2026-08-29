import { expect, test } from "@playwright/test";

test("creates a base, participant response, and local plan", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { name: /Shared time/ })).toBeVisible();
  await expect(page.getByTestId("calendar-grid")).toBeVisible();
  await expect(page.getByText("15m", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Keep weekdays 09:00-18:00" }).click();
  await page.getByRole("button", { name: "Generate base" }).click();
  const baseCode = page.locator(".output-copy code");
  await expect(baseCode).toContainText("tm1b_");

  await page.getByRole("tab", { name: "Availability" }).click();
  await page.getByRole("button", { name: "Keep weekdays 09:00-18:00" }).click();
  await page.getByRole("button", { name: "Generate response" }).click();
  await expect(baseCode).toContainText("tm1p_");
  await expect(page.getByText(/does not duplicate/u)).toBeVisible();

  await page.getByRole("button", { name: "Add to plan" }).click();
  await expect(page.getByText("Best shared time")).toBeVisible();
  await expect(page.getByRole("tab", { name: /Plan 1/u })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("TimeMesh tokens")).toHaveValue(/tm1b_[A-Za-z0-9_-]+\ntm1p_[A-Za-z0-9_-]+/u);
});

test("restores a generated base through the token console", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Generate base" }).click();
  const token = await page.locator(".output-copy code").textContent();
  expect(token).toMatch(/^tm1b_/u);

  await page.getByLabel("TimeMesh tokens").fill(token!);
  await page.getByRole("button", { name: "Open tokens" }).click();
  await expect(page.getByRole("tab", { name: "Availability" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Base token restored. Mark your free time without changing the base.")).toBeVisible();
});

test("opens a base token from a pretty path route", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Generate base" }).click();
  const token = await page.locator(".output-copy code").textContent();
  expect(token).toMatch(/^tm1b_/u);

  await page.goto(`./t/${token}`);
  await expect(page.getByRole("tab", { name: "Availability" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("TimeMesh tokens")).toHaveValue(token!);
});

test("opens the agent skill and switches appearance", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Agent skill", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Agent skill" })).toBeVisible();
  await expect(page.getByText("Use the repository codec for every token operation.")).toBeVisible();
  await page.getByLabel("Close agent skill").click();

  await page.getByLabel("Switch to dark mode").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("keeps the product controls usable on a narrow viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile-specific layout check");
  await page.goto("./");
  await expect(page.getByRole("heading", { name: /Shared time/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open tokens" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Base" })).toBeVisible();
  await expect(page.getByTestId("calendar-grid")).toBeVisible();
});

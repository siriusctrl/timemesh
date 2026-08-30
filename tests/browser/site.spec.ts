import { expect, test } from "@playwright/test";

test("creates a base, participant response, and local plan", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { name: /Shared time/ })).toBeVisible();
  await expect(page.getByTestId("calendar-grid")).toBeVisible();
  await expect(page.getByText("15m", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Keep weekdays 09:00-18:00" }).click();
  await page.getByRole("button", { name: "Generate base" }).click();
  const baseCode = page.locator(".output-copy code");
  await expect(baseCode).toContainText("tm2b_");

  await page.getByRole("tab", { name: "Availability" }).click();
  await page.getByRole("button", { name: "Keep weekdays 09:00-18:00" }).click();
  await page.getByRole("button", { name: "Generate response" }).click();
  await expect(baseCode).toContainText("tm2p_");
  await expect(page.getByText(/does not duplicate/u)).toBeVisible();

  await page.getByRole("button", { name: "Add to plan" }).click();
  await expect(page.getByText("Best shared time")).toBeVisible();
  await expect(page.getByRole("tab", { name: /Plan 1/u })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("TimeMesh tokens")).toHaveValue(/tm2b_[A-Za-z0-9_-]+\ntm2p_[A-Za-z0-9_-]+/u);
});

test("restores a generated base through the token console", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Generate base" }).click();
  const token = await page.locator(".output-copy code").textContent();
  expect(token).toMatch(/^tm2b_/u);

  await page.getByLabel("TimeMesh tokens").fill(token!);
  await page.getByRole("button", { name: "Open tokens" }).click();
  await expect(page.getByRole("tab", { name: "Availability" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Base token restored. Mark your free time without changing the base.")).toBeVisible();
});

test("opens a base token from a pretty path route", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Generate base" }).click();
  const token = await page.locator(".output-copy code").textContent();
  expect(token).toMatch(/^tm2b_/u);

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

  const iconOffset = await page.locator(".theme-action-icon").evaluate((slot) => {
    const icon = slot.querySelector("svg");
    if (!icon) return Number.POSITIVE_INFINITY;
    const slotBox = slot.getBoundingClientRect();
    const iconBox = icon.getBoundingClientRect();
    return Math.max(
      Math.abs(slotBox.left + slotBox.width / 2 - (iconBox.left + iconBox.width / 2)),
      Math.abs(slotBox.top + slotBox.height / 2 - (iconBox.top + iconBox.height / 2)),
    );
  });
  expect(iconOffset).toBeLessThan(0.75);

  await page.getByLabel("Switch to dark mode").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("searches and selects a display time zone", async ({ page }) => {
  await page.goto("./");
  const timeZone = page.getByRole("combobox", { name: "Display time zone" });
  await timeZone.click();
  expect(await page.getByRole("option").count()).toBeGreaterThan(20);

  await timeZone.fill("Tokyo");
  const tokyo = page.getByRole("option", { name: /Asia\/Tokyo/u });
  await expect(tokyo).toBeVisible();
  await tokyo.click();
  await expect(timeZone).toHaveValue("Asia/Tokyo");
});

test("fits a two-week grid without horizontal scrolling and shows the full day", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop grid compression check");
  await page.goto("./");
  await expect(page.getByRole("button", { name: "Focus hours" })).toBeVisible();
  await expect(page.locator('[data-slot-index="0"]')).toHaveAttribute("title", /^00:00/u);
  await expect(page.locator('[data-slot-index="95"]')).toHaveAttribute("title", /^23:45/u);
  await expect(page.locator(".day-heading")).toHaveCount(14);

  const overflow = await page.locator(".calendar-scroll").evaluate((element) =>
    element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("keeps the product controls usable on a narrow viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile-specific layout check");
  await page.goto("./");
  await expect(page.getByRole("heading", { name: /Shared time/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open tokens" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Base" })).toBeVisible();
  await expect(page.getByTestId("calendar-grid")).toBeVisible();
});

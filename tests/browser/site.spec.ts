import { expect, test } from "@playwright/test";

test("moves from organizer link to participant response and comparison", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => window.sessionStorage.setItem("timemesh-test-clipboard", value),
      },
    });
  });
  await page.goto("./");
  await expect(page.getByRole("heading", { name: /Shared time/ })).toBeVisible();
  await expect(page.getByTestId("calendar-grid")).toBeVisible();
  await expect(page.getByText("15m", { exact: true })).toBeVisible();
  await expect(page.getByText("Create a meeting · mark organizer conflicts")).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);

  await expect(page.getByLabel("Weekday hours start")).toHaveValue("08:00");
  await expect(page.getByLabel("Weekday hours end")).toHaveValue("20:00");
  await page.getByRole("button", { name: "Keep weekday hours" }).click();
  await page.getByRole("button", { name: "Create meeting link" }).click();
  const outputCode = page.locator(".output-copy code");
  const baseToken = await outputCode.textContent();
  expect(baseToken).toMatch(/^tm2b_/u);
  await page.getByRole("button", { name: "Copy URL" }).click();
  const meetingUrl = await page.evaluate(() => window.sessionStorage.getItem("timemesh-test-clipboard"));
  expect(meetingUrl).toContain(`#/${baseToken}`);

  await page.goto(meetingUrl!);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Share when you are free" })).toBeVisible();
  await expect(page.getByText("Your response · mark every time that works")).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(page.getByLabel("TimeMesh tokens")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add to plan" })).toHaveCount(0);
  await expect(page.getByText("Copy the agent skill")).toHaveCount(0);
  await expect(page.locator(".workspace-summary").getByRole("combobox", { name: "Display time zone" })).toBeVisible();

  const participantLayout = await page.locator(".workspace").evaluate((workspace) => {
    const summary = workspace.querySelector(".workspace-summary");
    if (!summary) return null;
    const workspaceBox = workspace.getBoundingClientRect();
    const summaryBox = summary.getBoundingClientRect();
    return {
      bottomGap: window.innerHeight - workspaceBox.bottom,
      summaryOffset: summaryBox.top - workspaceBox.top,
      viewportWidth: window.innerWidth,
    };
  });
  expect(participantLayout?.summaryOffset).toBeLessThanOrEqual(2);
  if ((participantLayout?.viewportWidth ?? 0) > 780) {
    expect(participantLayout?.bottomGap).toBeGreaterThanOrEqual(0);
    expect(participantLayout?.bottomGap).toBeLessThanOrEqual(16);
  }

  await page.getByRole("button", { name: "Mark weekday hours free" }).click();
  await page.getByRole("button", { name: "Generate response" }).click();
  await expect(outputCode).toContainText("tm2p_");
  const participantToken = await outputCode.textContent();
  expect(participantToken).toMatch(/^tm2p_/u);
  await expect(page.getByText("Copy the URL and send it back to the organizer.")).toBeVisible();
  await page.getByRole("button", { name: "Copy URL" }).click();
  const responseUrl = await page.evaluate(() => window.sessionStorage.getItem("timemesh-test-clipboard"));
  expect(responseUrl).toContain(`#/${baseToken}/${participantToken}`);

  await page.goto(responseUrl!);
  await page.reload();
  await expect(page.getByText("Best shared time")).toBeVisible();
  await expect(page.getByText("Compare 1 response", { exact: true })).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(page.getByLabel("TimeMesh tokens")).toHaveValue(/tm2b_[A-Za-z0-9_-]+\ntm2p_[A-Za-z0-9_-]+/u);
});

test("restores a generated base through the token console", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Create meeting link" }).click();
  const token = await page.locator(".output-copy code").textContent();
  expect(token).toMatch(/^tm2b_/u);

  await page.getByLabel("TimeMesh tokens").fill(token!);
  await page.getByRole("button", { name: "Open tokens" }).click();
  await expect(page.getByRole("heading", { name: "Share when you are free" })).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(page.getByLabel("TimeMesh tokens")).toHaveCount(0);
});

test("opens a base token from a pretty path route", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Create meeting link" }).click();
  const token = await page.locator(".output-copy code").textContent();
  expect(token).toMatch(/^tm2b_/u);

  await page.goto(`./t/${token}`);
  await expect(page.getByRole("heading", { name: "Share when you are free" })).toBeVisible();
  await expect(page.getByLabel("TimeMesh tokens")).toHaveCount(0);
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

test("finds major cities that map to canonical IANA zones", async ({ page }) => {
  await page.goto("./");
  const timeZone = page.getByRole("combobox", { name: "Organizer time zone" });

  await timeZone.click();
  await timeZone.fill("San Francisco");
  const sanFrancisco = page.getByRole("option", { name: /San Francisco, America\/Los_Angeles/u });
  await expect(sanFrancisco).toBeVisible();
  await sanFrancisco.click();
  await expect(timeZone).toHaveValue("America/Los_Angeles");

  await timeZone.fill("Miami");
  const miami = page.getByRole("option", { name: /Miami, America\/New_York/u });
  await expect(miami).toBeVisible();
  await miami.click();
  await expect(timeZone).toHaveValue("America/New_York");
});

test("renders the organizer time zone as one unified control", async ({ page }) => {
  await page.goto("./");
  const input = page.getByRole("combobox", { name: "Organizer time zone" });
  const control = input.locator("xpath=..");
  const label = page.locator('label[for="organizer-timezone"]');

  await expect(input).toBeVisible();
  await expect(control).toHaveCSS("height", "36px");
  await expect(input).toHaveCSS("border-top-width", "0px");
  await expect(input).toHaveCSS("border-radius", "0px");

  const labelAlignment = await label.evaluate((node) => {
    const icon = node.querySelector("svg");
    if (!icon) return Number.POSITIVE_INFINITY;
    const labelBox = node.getBoundingClientRect();
    const iconBox = icon.getBoundingClientRect();
    return Math.abs(labelBox.top + labelBox.height / 2 - (iconBox.top + iconBox.height / 2));
  });
  expect(labelAlignment).toBeLessThan(1);
});

test("customizes weekday hours and guards an inverted range", async ({ page }) => {
  await page.goto("./");
  const start = page.getByLabel("Weekday hours start");
  const end = page.getByLabel("Weekday hours end");
  const apply = page.getByRole("button", { name: "Keep weekday hours" });

  await start.fill("21:00");
  await end.fill("08:00");
  await expect(page.getByRole("alert")).toHaveText("Choose an end time later than the start.");
  await expect(apply).toBeDisabled();

  await start.fill("07:30");
  await end.fill("21:15");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await apply.click();
  expect(await page.locator(".marked-unavailable").count()).toBeGreaterThan(0);
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

  const workspaceGeometry = await page.locator(".workspace").evaluate((workspace) => ({
    bottomGap: window.innerHeight - workspace.getBoundingClientRect().bottom,
    viewportHeight: window.innerHeight,
  }));
  if (workspaceGeometry.viewportHeight >= 800) {
    expect(workspaceGeometry.bottomGap).toBeGreaterThanOrEqual(0);
    expect(workspaceGeometry.bottomGap).toBeLessThanOrEqual(18);
  }
});

test("keeps the product controls usable on a narrow viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile-specific layout check");
  await page.goto("./");
  await expect(page.getByRole("heading", { name: /Shared time/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open tokens" })).toBeVisible();
  await expect(page.getByText("Create a meeting · mark organizer conflicts")).toBeVisible();
  await expect(page.getByTestId("calendar-grid")).toBeVisible();
});

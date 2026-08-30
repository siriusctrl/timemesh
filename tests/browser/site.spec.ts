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
  await expect(page.getByLabel("Grid")).toHaveValue("15");
  await expect(page.getByLabel("Starts")).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);

  await expect(page.getByLabel("Weekday hours start")).toHaveValue("08:00");
  await expect(page.getByLabel("Weekday hours end")).toHaveValue("20:00");
  await page.getByRole("button", { name: "Keep weekday hours" }).click();
  await page.getByRole("button", { name: "Generate token" }).click();
  await expect(page.getByText("Meeting token", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate token" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copy bundle" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copy token" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy URL" })).toBeVisible();
  const outputCode = page.locator(".output-copy code");
  const baseToken = await outputCode.textContent();
  expect(baseToken).toMatch(/^tm2b_/u);
  await page.getByRole("button", { name: "Copy URL" }).click();
  const meetingUrl = await page.evaluate(() => window.sessionStorage.getItem("timemesh-test-clipboard"));
  expect(meetingUrl).toContain(`#/${baseToken}`);

  await page.goto(meetingUrl!);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Share when you are free" })).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(page.getByLabel("TimeMesh tokens")).toHaveValue(baseToken!);
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
  await expect(page.getByText("Response bundle", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate response" })).toHaveCount(0);
  const generatedBundle = await page.getByLabel("TimeMesh tokens").inputValue();
  const participantToken = generatedBundle.split(/\s+/u).find((token) => token.startsWith("tm2p_"));
  expect(participantToken).toMatch(/^tm2p_/u);
  await expect(page.getByText("The bundle keeps this response attached to its meeting.")).toBeVisible();
  await page.getByRole("button", { name: "Copy bundle" }).click();
  const copiedBundle = await page.evaluate(() => window.sessionStorage.getItem("timemesh-test-clipboard"));
  expect(copiedBundle).toBe(`${baseToken}\n${participantToken}`);
  await page.getByRole("button", { name: "Copy URL" }).click();
  const responseUrl = await page.evaluate(() => window.sessionStorage.getItem("timemesh-test-clipboard"));
  expect(responseUrl).toContain(`#/${baseToken}/${participantToken}`);

  await page.goto(responseUrl!);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Share when you are free" })).toBeVisible();
  await expect(page.getByText("Best shared time")).toHaveCount(0);
  await expect(page.locator(".marked-free").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate response" })).toHaveCount(0);
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(page.getByLabel("TimeMesh tokens")).toHaveValue(/tm2b_[A-Za-z0-9_-]+\ntm2p_[A-Za-z0-9_-]+/u);

  await page.locator(".marked-free").first().click();
  await expect(page.getByRole("button", { name: "Generate response" })).toBeVisible();
  await expect(page.getByLabel("TimeMesh tokens")).toHaveValue(baseToken!);
  await page.getByRole("button", { name: "Generate response" }).click();
  const revisedBundle = await page.getByLabel("TimeMesh tokens").inputValue();
  const revisedParticipantToken = revisedBundle.split(/\s+/u).find((token) => token.startsWith("tm2p_"));
  expect(revisedParticipantToken).toMatch(/^tm2p_/u);
  expect(revisedParticipantToken).not.toBe(participantToken);

  await page.getByLabel("TimeMesh tokens").fill(`${baseToken}\n${participantToken}\n${revisedParticipantToken}`);
  await page.getByRole("button", { name: "Open tokens" }).click();
  await expect(page.getByText("Best shared time")).toBeVisible();
  await expect(page.getByLabel("TimeMesh tokens")).toHaveValue(/tm2b_[A-Za-z0-9_-]+\ntm2p_[A-Za-z0-9_-]+\ntm2p_[A-Za-z0-9_-]+/u);
});

test("restores a generated base through the token console", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Generate token" }).click();
  const token = await page.locator(".output-copy code").textContent();
  expect(token).toMatch(/^tm2b_/u);

  await page.getByLabel("TimeMesh tokens").fill(token!);
  await page.getByRole("button", { name: "Open tokens" }).click();
  await expect(page.getByRole("heading", { name: "Share when you are free" })).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(page.getByLabel("TimeMesh tokens")).toHaveValue(token!);
});

test("accepts a participant token on an already opened meeting", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Generate token" }).click();
  const outputCode = page.locator(".output-copy code");
  await expect(outputCode).toContainText("tm2b_");
  const baseToken = await outputCode.textContent();

  await page.goto(`./#/${baseToken}`);
  await page.reload();
  await page.getByRole("button", { name: "Generate response" }).click();
  const responseBundle = await page.getByLabel("TimeMesh tokens").inputValue();
  const participantToken = responseBundle.split(/\s+/u).find((token) => token.startsWith("tm2p_"));
  expect(participantToken).toMatch(/^tm2p_/u);

  await page.goto(`./#/${baseToken}`);
  await page.reload();
  await page.getByLabel("TimeMesh tokens").fill(participantToken!);
  await page.getByRole("button", { name: "Open tokens" }).click();
  await expect(page.getByLabel("TimeMesh tokens")).toHaveValue(`${baseToken}\n${participantToken}`);
  await expect(page.getByText("Response loaded. Review it here or edit it and generate a new bundle.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate response" })).toHaveCount(0);
});

test("opens a base token from a pretty path route", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Generate token" }).click();
  const token = await page.locator(".output-copy code").textContent();
  expect(token).toMatch(/^tm2b_/u);

  await page.goto(`./t/${token}`);
  await expect(page.getByRole("heading", { name: "Share when you are free" })).toBeVisible();
  await expect(page.getByLabel("TimeMesh tokens")).toHaveValue(token!);
});

test("opens the agent skill and switches appearance", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("timemesh-theme", "light"));
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => window.localStorage.getItem("timemesh-theme"))).toBeNull();
  await expect(page.getByText("Local only")).toHaveCount(0);
  await expect(page.locator(".theme-action")).toHaveText("");
  await expect(page.locator(".theme-action")).toHaveAttribute("title", /Following system dark mode/u);
  const themeRightGap = await page.locator(".theme-action").evaluate((button) =>
    window.innerWidth - button.getBoundingClientRect().right);
  expect(themeRightGap).toBeLessThanOrEqual(20);

  await page.getByRole("button", { name: "Agent skill", exact: true }).click();
  const skillDialog = page.getByRole("dialog", { name: "Agent skill" });
  await expect(skillDialog).toBeVisible();
  await expect(page.getByLabel("Close agent skill")).toBeFocused();
  await expect(page.getByText("Use the repository codec for every token operation.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(skillDialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Agent skill", exact: true })).toBeFocused();

  const iconOffset = await page.locator(".theme-action-icon").evaluate((slot) => {
    const icon = [...slot.querySelectorAll("svg")].find((candidate) => getComputedStyle(candidate).display !== "none");
    if (!icon) return Number.POSITIVE_INFINITY;
    const slotBox = slot.getBoundingClientRect();
    const iconBox = icon.getBoundingClientRect();
    return Math.max(
      Math.abs(slotBox.left + slotBox.width / 2 - (iconBox.left + iconBox.width / 2)),
      Math.abs(slotBox.top + slotBox.height / 2 - (iconBox.top + iconBox.height / 2)),
    );
  });
  expect(iconOffset).toBeLessThan(0.75);

  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByLabel("Weekday hours start").fill("07:30");
  const themeToggle = page.getByLabel("Switch to dark mode");
  const toggleBounds = await themeToggle.boundingBox();
  expect(toggleBounds).not.toBeNull();
  await themeToggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme-transition", "active");
  const revealState = await page.locator("[data-theme-reveal]").evaluate((element) => {
    const style = getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    const scaleX = bounds.width / (element as HTMLElement).offsetWidth || 1;
    const scaleY = bounds.height / (element as HTMLElement).offsetHeight || scaleX;
    const x = Number.parseFloat(style.getPropertyValue("--theme-reveal-x"));
    const y = Number.parseFloat(style.getPropertyValue("--theme-reveal-y"));
    const state = {
      animationId: element.querySelector("[data-theme-reveal-circle]")?.getAnimations()[0]?.id,
      rootTheme: document.documentElement.dataset.theme,
      layerTheme: (element as HTMLElement).dataset.theme,
      clonedStart: element.querySelector<HTMLInputElement>('[aria-label="Weekday hours start"]')?.value,
      visualX: bounds.left + x * scaleX,
      visualY: bounds.top + y * scaleY,
    };
    document.querySelector<HTMLButtonElement>("#root .theme-action")?.click();
    return state;
  });
  expect(revealState.animationId).toBe("theme-reveal");
  expect(revealState.rootTheme).toBe("light");
  expect(revealState.layerTheme).toBe("dark");
  expect(revealState.clonedStart).toBe("07:30");
  expect(Math.abs(revealState.visualX - (toggleBounds!.x + toggleBounds!.width / 2))).toBeLessThan(1.1);
  expect(Math.abs(revealState.visualY - (toggleBounds!.y + toggleBounds!.height / 2))).toBeLessThan(1.1);
  const syncedScroll = await page.evaluate(() => {
    const source = document.querySelector<HTMLElement>("#root .calendar-scroll");
    const clone = document.querySelector<HTMLElement>("[data-theme-reveal] .calendar-scroll");
    if (!source || !clone) return null;
    source.scrollTop = 180;
    source.dispatchEvent(new Event("scroll"));
    return { source: source.scrollTop, clone: clone.scrollTop };
  });
  expect(syncedScroll?.source).toBeGreaterThan(0);
  expect(syncedScroll?.clone).toBe(syncedScroll?.source);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme-transition", "active");
  await expect(page.locator("[data-theme-reveal]")).toHaveCount(0);

  const darkContrast = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    const luminance = (hex: string) => {
      const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
        .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const pageLuminance = luminance(styles.getPropertyValue("--page").trim());
    const inkLuminance = luminance(styles.getPropertyValue("--ink").trim());
    return (Math.max(pageLuminance, inkLuminance) + 0.05) / (Math.min(pageLuminance, inkLuminance) + 0.05);
  });
  expect(darkContrast).toBeGreaterThanOrEqual(7);
  expect(darkContrast).toBeLessThan(12);

  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByLabel("Switch to light mode").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme-transition", "active");
  await expect(page.locator("[data-theme-reveal]")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("[data-theme-reveal]")).toHaveCount(0);
});

test("switches themes without a reveal when reduced motion is requested", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("./");
  await page.getByLabel("Switch to dark mode").click();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme-transition", "active");
  await expect(page.locator("[data-theme-reveal]")).toHaveCount(0);
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

test("applies participant weekday hours in the display time zone", async ({ page }) => {
  await page.goto("./");
  const organizerZone = page.getByRole("combobox", { name: "Organizer time zone" });
  await organizerZone.fill("Shanghai");
  await page.getByRole("option", { name: /Asia\/Shanghai/u }).click();
  await page.getByRole("button", { name: "Generate token" }).click();
  const baseToken = await page.locator(".output-copy code").textContent();

  await page.goto(`./#/${baseToken}`);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Share when you are free" })).toBeVisible();
  const displayZone = page.getByRole("combobox", { name: "Display time zone" });
  await displayZone.fill("Los Angeles");
  await page.getByRole("option", { name: /America\/Los Angeles/u }).click();
  await page.getByRole("button", { name: "Mark weekday hours free" }).click();

  const markedTimes = await page.locator(".marked-free").evaluateAll((slots) =>
    slots.map((slot) => slot.getAttribute("title")?.slice(0, 5)));
  expect(markedTimes).toContain("08:00");
  expect(markedTimes).toContain("19:45");
  expect(markedTimes).not.toContain("07:45");
  expect(markedTimes).not.toContain("20:00");
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

test("keeps organizer edits canonical after generation", async ({ page }) => {
  await page.goto("./");
  const firstSlot = page.locator('[data-slot-index="0"]');
  await firstSlot.click();
  await page.getByRole("button", { name: "Generate token" }).click();
  const firstToken = await page.locator(".output-copy code").textContent();

  await firstSlot.click();
  await expect(firstSlot).not.toHaveClass(/marked-unavailable/u);
  await expect(firstSlot).toHaveAttribute("title", /Available$/u);
  await page.getByRole("button", { name: "Generate token" }).click();
  const secondToken = await page.locator(".output-copy code").textContent();
  expect(secondToken).not.toBe(firstToken);

  const startDate = page.locator('input[type="date"]');
  const validDate = await startDate.inputValue();
  await startDate.fill("");
  await expect(page.getByText(/valid ISO 8601 string|invalid/i)).toBeVisible();
  await expect(startDate).toHaveValue(validDate);
});

test("supports pointer drag and roving keyboard selection", async ({ page }) => {
  await page.goto("./");
  const first = page.locator('[data-slot-index="0"]');
  const second = page.locator('[data-slot-index="1"]');
  const firstBox = await first.boundingBox();
  const secondBox = await second.boundingBox();
  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();

  if ((await page.viewportSize())!.width <= 780) {
    await first.click();
    await second.click();
  } else {
    await page.mouse.move(firstBox!.x + firstBox!.width / 2, firstBox!.y + firstBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(secondBox!.x + secondBox!.width / 2, secondBox!.y + secondBox!.height / 2);
    await page.mouse.up();
  }
  await expect(first).toHaveClass(/marked-unavailable/u);
  await expect(second).toHaveClass(/marked-unavailable/u);

  expect(await page.locator('.time-slot[tabindex="0"]').count()).toBe(1);
  await first.focus();
  await page.keyboard.press("ArrowDown");
  await expect(second).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(second).not.toHaveClass(/marked-unavailable/u);
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
  await expect(page.getByLabel("Starts")).toBeVisible();
  await expect(page.getByTestId("calendar-grid")).toBeVisible();
});

import { spawn, spawnSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";

const root = resolve(".");
const outputDirectory = resolve("artifacts/verification");
const baseUrl = "http://127.0.0.1:4173/timemesh/";

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const build = spawnSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);

const server = spawn(
  "npm",
  ["run", "preview", "--", "--host", "127.0.0.1", "--port", "4173"],
  { cwd: root, stdio: "ignore" },
);

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Retry while the static preview starts.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(`Preview server did not start at ${baseUrl}`);
}

const captures = [];
async function capture(page, name, fullPage = true) {
  const path = resolve(outputDirectory, `${name}.png`);
  await page.screenshot({ path, fullPage });
  captures.push({ name, path });
}

try {
  await waitForServer();
  const browser = await chromium.launch();
  const desktop = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    colorScheme: "light",
  });
  await desktop.goto(baseUrl, { waitUntil: "networkidle" });
  await desktop.waitForTimeout(700);
  await capture(desktop, "01-base-workbench");

  const displayTimeZone = desktop.getByRole("combobox", { name: "Display time zone" });
  await displayTimeZone.click();
  await displayTimeZone.fill("San Francisco");
  await desktop.getByRole("option", { name: /San Francisco, America\/Los_Angeles/u }).waitFor();
  await capture(desktop, "02-city-timezone-search", false);
  await desktop.keyboard.press("Escape");

  await desktop.getByRole("button", { name: "Keep weekday hours" }).click();
  await desktop.getByRole("button", { name: "Generate token" }).click();
  const baseToken = await desktop.locator(".output-copy code").textContent();
  await desktop.evaluate(() => window.scrollTo(0, 0));
  await capture(desktop, "03-generated-base");

  await desktop.goto(`${baseUrl}?participant#/${baseToken}`, { waitUntil: "networkidle" });
  await desktop.getByRole("button", { name: "Mark weekday hours free" }).click();
  await desktop.getByRole("button", { name: "Generate response" }).click();
  const participantToken = await desktop.locator(".output-copy code").textContent();
  await desktop.evaluate(() => window.scrollTo(0, 0));
  await capture(desktop, "04-response-ready");

  await desktop.goto(`${baseUrl}?organizer#/${baseToken}/${participantToken}`, { waitUntil: "networkidle" });
  await capture(desktop, "05-overlap-plan");

  await desktop.getByLabel("Switch to dark mode").click();
  await desktop.waitForTimeout(430);
  await capture(desktop, "06-theme-reveal", false);
  await desktop.waitForFunction(() => !document.documentElement.dataset.themeTransition);
  await desktop.evaluate(() => window.scrollTo(0, 0));
  await capture(desktop, "07-dark-plan");

  const mobile = await browser.newPage({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 1,
    colorScheme: "light",
  });
  await mobile.goto(baseUrl, { waitUntil: "networkidle" });
  await capture(mobile, "08-mobile-workbench");
  await browser.close();

  const thumbWidth = 620;
  const thumbHeight = 520;
  const gap = 18;
  const columns = 2;
  const rows = Math.ceil(captures.length / columns);
  const composites = await Promise.all(captures.map(async (item, index) => ({
    input: await sharp(item.path)
      .resize(thumbWidth, thumbHeight, { fit: "contain", background: "#f1f1f3" })
      .png()
      .toBuffer(),
    left: (index % columns) * (thumbWidth + gap),
    top: Math.floor(index / columns) * (thumbHeight + gap),
  })));
  await sharp({
    create: {
      width: columns * thumbWidth + gap,
      height: rows * thumbHeight + (rows - 1) * gap,
      channels: 3,
      background: "#f1f1f3",
    },
  }).composite(composites).png().toFile(resolve(outputDirectory, "contact-sheet.png"));

  await writeFile(
    resolve(outputDirectory, "manifest.json"),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl, captures: captures.map(({ name }) => `${name}.png`) }, null, 2)}\n`,
  );
  console.log(`Wrote ${captures.length} screenshots and contact sheet to ${outputDirectory}`);
} finally {
  server.kill("SIGTERM");
}

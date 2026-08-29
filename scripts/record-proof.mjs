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
  await capture(desktop, "01-base-workbench");

  await desktop.getByRole("button", { name: "Keep weekdays 09:00-18:00" }).click();
  await desktop.getByRole("button", { name: "Generate base" }).click();
  await desktop.evaluate(() => window.scrollTo(0, 0));
  await capture(desktop, "02-generated-base");

  await desktop.getByRole("tab", { name: "Availability" }).click();
  await desktop.getByRole("button", { name: "Keep weekdays 09:00-18:00" }).click();
  await desktop.getByRole("button", { name: "Generate response" }).click();
  await desktop.getByRole("button", { name: "Add to plan" }).click();
  await desktop.evaluate(() => window.scrollTo(0, 0));
  await capture(desktop, "03-overlap-plan");

  await desktop.getByLabel("Switch to dark mode").click();
  await desktop.evaluate(() => window.scrollTo(0, 0));
  await capture(desktop, "04-dark-plan");

  const mobile = await browser.newPage({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 1,
    colorScheme: "light",
  });
  await mobile.goto(baseUrl, { waitUntil: "networkidle" });
  await capture(mobile, "05-mobile-workbench");
  await browser.close();

  const thumbWidth = 620;
  const thumbHeight = 520;
  const gap = 18;
  const columns = 2;
  const rows = Math.ceil(captures.length / columns);
  const composites = await Promise.all(captures.map(async (item, index) => ({
    input: await sharp(item.path)
      .resize(thumbWidth, thumbHeight, { fit: "contain", background: "#edf1ec" })
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
      background: "#edf1ec",
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

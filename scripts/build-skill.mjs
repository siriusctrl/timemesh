#!/usr/bin/env node

import { execFile } from "node:child_process";
import { chmod, cp, mkdir, mkdtemp, readdir, rm, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { build } from "esbuild";

const run = promisify(execFile);
const root = process.cwd();
const skillName = "plan-time-with-tokens";
const skillDirectory = path.join(root, "skills", skillName);
const bundledCli = path.join(skillDirectory, "scripts", "time-token.mjs");
const archive = path.join(root, "public", `${skillName}.zip`);
const fixedTime = new Date("2000-01-01T00:00:00.000Z");

async function normalizeTimes(directory) {
  for (const entry of await readdir(directory)) {
    const target = path.join(directory, entry);
    if ((await stat(target)).isDirectory()) await normalizeTimes(target);
    await utimes(target, fixedTime, fixedTime);
  }
}

await build({
  entryPoints: [path.join(skillDirectory, "scripts", "time-token.ts")],
  outfile: bundledCli,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  legalComments: "none",
});
await chmod(bundledCli, 0o755);
await mkdir(path.dirname(archive), { recursive: true });

const stagingRoot = await mkdtemp(path.join(tmpdir(), "timemesh-skill-"));
try {
  const stagedSkill = path.join(stagingRoot, skillName);
  await cp(skillDirectory, stagedSkill, { recursive: true });
  await rm(path.join(stagedSkill, "scripts", "time-token.ts"));
  await normalizeTimes(stagedSkill);
  await utimes(stagedSkill, fixedTime, fixedTime);
  await rm(archive, { force: true });
  await run("zip", ["-X", "-q", "-r", archive, skillName], { cwd: stagingRoot });
  await chmod(archive, 0o644);
} finally {
  await rm(stagingRoot, { force: true, recursive: true });
}

console.log(`Built ${path.relative(root, bundledCli)} and ${path.relative(root, archive)}.`);

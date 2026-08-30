import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";
import { encodeBaseToken, encodeParticipantToken } from "../src/protocol/codec";
import { createBaseAllocation } from "../src/protocol/time";

const run = promisify(execFile);
const cli = path.resolve("skills/plan-time-with-tokens/scripts/time-token.mjs");
const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "timemesh-cli-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { force: true, recursive: true })
  ));
});

describe("portable TimeMesh Skill CLI", () => {
  test("returns a complete response bundle from outside the repository", async () => {
    const directory = await temporaryDirectory();
    const base = createBaseAllocation({
      startDate: "2026-09-01",
      days: 1,
      timezone: "UTC",
      meetingMinutes: 30,
    });
    const baseToken = encodeBaseToken(base);
    const freePath = path.join(directory, "free.json");
    await writeFile(freePath, JSON.stringify({
      ranges: [{ start: "2026-09-01T10:00Z", end: "2026-09-01T10:30Z" }],
    }));

    const { stdout } = await run(process.execPath, [
      cli,
      "participant",
      "--base",
      baseToken,
      "--free-json",
      freePath,
      "--output",
      "bundle",
    ], { cwd: directory });

    const tokens = stdout.trim().split("\n");
    expect(tokens).toHaveLength(2);
    expect(tokens[0]).toBe(baseToken);
    expect(tokens[1]).toMatch(/^tm2p_/u);
  });

  test("ranks repeated response bundles with transparent organizer preferences", async () => {
    const directory = await temporaryDirectory();
    const base = createBaseAllocation({
      startDate: "2026-09-01",
      days: 1,
      timezone: "UTC",
      meetingMinutes: 30,
    });
    const baseToken = encodeBaseToken(base);
    const responseTokens = await Promise.all([
      encodeParticipantToken(baseToken, base, [40, 41, 48, 49]),
      encodeParticipantToken(baseToken, base, [40, 41]),
      encodeParticipantToken(baseToken, base, [48, 49]),
    ]);
    const bundlePath = path.join(directory, "bundles.txt");
    await writeFile(bundlePath, responseTokens
      .map((responseToken) => `${baseToken}\n${responseToken}`)
      .join("\n\n"));
    const preferencesPath = path.join(directory, "preferences.json");
    await writeFile(preferencesPath, JSON.stringify({
      minimumAttendees: 2,
      allowedRanges: [{ start: "2026-09-01T10:00Z", end: "2026-09-01T12:30Z" }],
      preferredRanges: [{ start: "2026-09-01T12:00Z", end: "2026-09-01T12:30Z" }],
    }));

    const { stdout } = await run(process.execPath, [
      cli,
      "compare",
      "--bundle-file",
      bundlePath,
      "--preferences-json",
      preferencesPath,
      "--timezone",
      "UTC",
    ], { cwd: directory });
    const result = JSON.parse(stdout) as {
      uniqueResponseCount: number;
      candidates: Array<{
        start: string;
        attendeeCount: number;
        responseNumbers: number[];
        fullyPreferred: boolean;
      }>;
    };

    expect(result.uniqueResponseCount).toBe(3);
    expect(result.candidates[0]).toMatchObject({
      start: "2026-09-01T12:00:00+00:00[UTC]",
      attendeeCount: 2,
      responseNumbers: [1, 3],
      fullyPreferred: true,
    });
  });
});

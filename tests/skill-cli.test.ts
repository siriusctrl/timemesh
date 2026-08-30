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
      "--base-name",
      "Organizer",
      "--name",
      "Alice",
    ], { cwd: directory });

    const lines = stdout.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(`Organizer | ${baseToken}`);
    expect(lines[1]).toMatch(/^Alice \| tm2p_/u);
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
    const responseNames = ["Alice", "Bob", "Cara"];
    await writeFile(bundlePath, responseTokens
      .map((responseToken, index) => `Organizer | ${baseToken}\n${responseNames[index]} | ${responseToken}`)
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
      responseCount: number;
      candidates: Array<{
        start: string;
        attendeeCount: number;
        responseNumbers: number[];
        responseNames: string[];
        fullyPreferred: boolean;
      }>;
    };

    expect(result.responseCount).toBe(3);
    expect(result.candidates[0]).toMatchObject({
      start: "2026-09-01T12:00:00+00:00[UTC]",
      attendeeCount: 2,
      responseNumbers: [1, 3],
      responseNames: ["Alice", "Cara"],
      fullyPreferred: true,
    });
  });

  test("allocates one non-overlapping meeting per named response from outside the repository", async () => {
    const directory = await temporaryDirectory();
    const base = createBaseAllocation({
      startDate: "2026-09-01",
      days: 1,
      timezone: "UTC",
      meetingMinutes: 60,
    });
    const baseToken = encodeBaseToken(base);
    const responseTokens = await Promise.all([
      encodeParticipantToken(baseToken, base, [36, 37, 38, 39, 40, 41, 42, 43]),
      encodeParticipantToken(baseToken, base, [36, 37, 38, 39]),
      encodeParticipantToken(baseToken, base, []),
    ]);
    const bundlePath = path.join(directory, "individual-bundles.txt");
    await writeFile(bundlePath, [
      `Jordan | ${baseToken}`,
      `Alice | ${responseTokens[0]}`,
      `Bob | ${responseTokens[1]}`,
      `Cara | ${responseTokens[2]}`,
    ].join("\n"));

    const { stdout } = await run(process.execPath, [
      cli,
      "allocate",
      "--bundle-file",
      bundlePath,
      "--timezone",
      "UTC",
    ], { cwd: directory });
    const result = JSON.parse(stdout) as {
      objective: { meetingsAssigned: number };
      assignments: Array<{ responseName: string; start: string; end: string }>;
      unassignedResponses: Array<{ responseName: string; reason: string; candidateCount: number }>;
      noOrganizerOverlap: boolean;
      validation: string;
    };

    expect(result.objective.meetingsAssigned).toBe(2);
    expect(result.assignments).toEqual([
      expect.objectContaining({
        responseName: "Bob",
        start: "2026-09-01T09:00:00+00:00[UTC]",
        end: "2026-09-01T10:00:00+00:00[UTC]",
      }),
      expect.objectContaining({
        responseName: "Alice",
        start: "2026-09-01T10:00:00+00:00[UTC]",
        end: "2026-09-01T11:00:00+00:00[UTC]",
      }),
    ]);
    expect(result.unassignedResponses).toEqual([
      { responseNumber: 3, responseName: "Cara", reason: "no-feasible-window", candidateCount: 0 },
    ]);
    expect(result.noOrganizerOverlap).toBe(true);
    expect(result.validation).toBe("VALID allocation");
  });
});

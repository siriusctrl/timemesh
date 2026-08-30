import { describe, expect, it } from "vitest";
import {
  canonicalTimeZoneOptions,
  filterTimeZoneOptions,
  supportedTimeZones,
} from "../src/timezones/catalog";

describe("time-zone catalog", () => {
  const timeZones = ["UTC", "America/Los_Angeles", "America/New_York", "America/Toronto", "Asia/Tokyo"];
  const canonicalOptions = canonicalTimeZoneOptions(timeZones);

  it("keeps the preferred zone first without duplicating it", () => {
    const supported = supportedTimeZones("Asia/Tokyo");
    expect(supported[0]).toBe("Asia/Tokyo");
    expect(supported.filter((timeZone) => timeZone === "Asia/Tokyo")).toHaveLength(1);
  });

  it("returns city aliases in catalog order and matches canonical zones", () => {
    expect(
      filterTimeZoneOptions(canonicalOptions, timeZones, "silicon valley", "UTC")
        .map(({ label, timeZone }) => [label, timeZone]),
    ).toEqual([
      ["San Francisco", "America/Los_Angeles"],
      ["San Jose", "America/Los_Angeles"],
    ]);

    expect(filterTimeZoneOptions(canonicalOptions, timeZones, "america", "UTC")).toEqual(
      canonicalOptions.slice(1, 4),
    );
  });

  it("normalizes aliases and excludes zones outside the available catalog", () => {
    const results = filterTimeZoneOptions(canonicalOptions, timeZones, "montréal", "UTC");
    expect(results.map(({ label }) => label)).toEqual(["Montreal"]);

    const limitedOptions = canonicalTimeZoneOptions(["UTC"]);
    expect(filterTimeZoneOptions(limitedOptions, ["UTC"], "Miami", "UTC")).toEqual([]);
  });

  it("shows the full canonical list for the selected zone", () => {
    expect(filterTimeZoneOptions(canonicalOptions, timeZones, "UTC", "UTC")).toEqual(canonicalOptions);
  });
});

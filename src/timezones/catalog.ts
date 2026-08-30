export type TimeZoneOption = {
  alias: boolean;
  key: string;
  label: string;
  timeZone: string;
};

type CityAlias = {
  label: string;
  search?: string;
  timeZone: string;
};

const fallbackTimeZones = [
  "UTC",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "America/Anchorage",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/New_York",
  "America/Sao_Paulo",
  "America/Toronto",
  "America/Vancouver",
  "Asia/Bangkok",
  "Asia/Dubai",
  "Asia/Hong_Kong",
  "Asia/Jakarta",
  "Asia/Kolkata",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Melbourne",
  "Australia/Sydney",
  "Europe/Amsterdam",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Rome",
  "Pacific/Auckland",
];

const majorCityAliases: readonly CityAlias[] = [
  { label: "San Francisco", timeZone: "America/Los_Angeles", search: "sf bay area silicon valley" },
  { label: "San Jose", timeZone: "America/Los_Angeles", search: "silicon valley" },
  { label: "San Diego", timeZone: "America/Los_Angeles" },
  { label: "Seattle", timeZone: "America/Los_Angeles" },
  { label: "Portland", timeZone: "America/Los_Angeles" },
  { label: "Las Vegas", timeZone: "America/Los_Angeles" },
  { label: "Miami", timeZone: "America/New_York", search: "south florida" },
  { label: "Boston", timeZone: "America/New_York" },
  { label: "Washington, DC", timeZone: "America/New_York", search: "washington dc d.c." },
  { label: "Philadelphia", timeZone: "America/New_York", search: "philly" },
  { label: "Atlanta", timeZone: "America/New_York" },
  { label: "Orlando", timeZone: "America/New_York" },
  { label: "Charlotte", timeZone: "America/New_York" },
  { label: "Austin", timeZone: "America/Chicago" },
  { label: "Dallas", timeZone: "America/Chicago" },
  { label: "Houston", timeZone: "America/Chicago" },
  { label: "New Orleans", timeZone: "America/Chicago" },
  { label: "Minneapolis", timeZone: "America/Chicago" },
  { label: "Nashville", timeZone: "America/Chicago" },
  { label: "St. Louis", timeZone: "America/Chicago", search: "saint louis" },
  { label: "Kansas City", timeZone: "America/Chicago" },
  { label: "Salt Lake City", timeZone: "America/Denver" },
  { label: "Ottawa", timeZone: "America/Toronto" },
  { label: "Montreal", timeZone: "America/Toronto", search: "montreal montréal" },
  { label: "Beijing", timeZone: "Asia/Shanghai", search: "peking" },
  { label: "Shenzhen", timeZone: "Asia/Shanghai" },
  { label: "Guangzhou", timeZone: "Asia/Shanghai", search: "canton" },
  { label: "Mumbai", timeZone: "Asia/Kolkata", search: "bombay" },
  { label: "New Delhi", timeZone: "Asia/Kolkata", search: "delhi" },
  { label: "Bengaluru", timeZone: "Asia/Kolkata", search: "bangalore" },
  { label: "Abu Dhabi", timeZone: "Asia/Dubai" },
  { label: "Cape Town", timeZone: "Africa/Johannesburg" },
];

function searchableName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replaceAll("_", " ")
    .replaceAll("/", " ")
    .replace(/[^a-z0-9]+/giu, " ")
    .trim()
    .toLocaleLowerCase();
}

export function supportedTimeZones(preferred: string): string[] {
  const values = typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : fallbackTimeZones;
  return [...new Set([preferred, "UTC", ...values])];
}

export function canonicalTimeZoneOptions(timeZones: readonly string[]): TimeZoneOption[] {
  return timeZones.map((timeZone) => ({
    alias: false,
    key: `zone:${timeZone}`,
    label: timeZone.replaceAll("_", " "),
    timeZone,
  }));
}

export function filterTimeZoneOptions(
  canonicalOptions: readonly TimeZoneOption[],
  timeZones: readonly string[],
  query: string,
  selectedTimeZone: string,
): TimeZoneOption[] {
  const normalized = searchableName(query);
  if (!normalized || normalized === searchableName(selectedTimeZone)) return [...canonicalOptions];

  const aliasOptions = majorCityAliases
    .filter(({ timeZone }) => timeZones.includes(timeZone))
    .filter(({ label, search = "" }) => searchableName(`${label} ${search}`).includes(normalized))
    .map(({ label, timeZone }) => ({
      alias: true,
      key: `city:${label}:${timeZone}`,
      label,
      timeZone,
    }));
  const matchingZones = canonicalOptions.filter(
    ({ timeZone }) => searchableName(timeZone).includes(normalized),
  );
  return [...aliasOptions, ...matchingZones];
}

import { CaretDown, MagnifyingGlass } from "@phosphor-icons/react";
import { useEffect, useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";

type TimeZoneSelectProps = {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  label: ReactNode;
  onChange: (timeZone: string) => void;
  value: string;
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

type CityAlias = {
  label: string;
  search?: string;
  timeZone: string;
};

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

type TimeZoneOption = {
  alias: boolean;
  key: string;
  label: string;
  timeZone: string;
};

const offsetCache = new Map<string, string>();

function supportedTimeZones(preferred: string): string[] {
  const values = typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : fallbackTimeZones;
  return [...new Set([preferred, "UTC", ...values])];
}

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

function displayName(timeZone: string): string {
  return timeZone.replaceAll("_", " ");
}

function offsetName(timeZone: string): string {
  const cached = offsetCache.get(timeZone);
  if (cached) return cached;
  try {
    const part = new Intl.DateTimeFormat("en", {
      hour: "2-digit",
      timeZone,
      timeZoneName: "shortOffset",
    }).formatToParts(Date.now()).find(({ type }) => type === "timeZoneName");
    const offset = part?.value ?? timeZone;
    offsetCache.set(timeZone, offset);
    return offset;
  } catch {
    return timeZone;
  }
}

export function TimeZoneSelect({
  ariaLabel,
  className = "",
  disabled = false,
  id,
  label,
  onChange,
  value,
}: TimeZoneSelectProps) {
  const generatedId = useId();
  const inputId = id ?? `timezone-${generatedId}`;
  const listId = `${inputId}-options`;
  const timeZones = useMemo(() => supportedTimeZones(value), [value]);
  const canonicalOptions = useMemo<TimeZoneOption[]>(() => timeZones.map((timeZone) => ({
    alias: false,
    key: `zone:${timeZone}`,
    label: displayName(timeZone),
    timeZone,
  })), [timeZones]);
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => setQuery(value), [value]);

  const filteredOptions = useMemo<TimeZoneOption[]>(() => {
    const normalized = searchableName(query);
    if (!normalized || normalized === searchableName(value)) return canonicalOptions;

    const aliasOptions = majorCityAliases
      .filter(({ timeZone }) => timeZones.includes(timeZone))
      .filter(({ label, search = "" }) => searchableName(`${label} ${search}`).includes(normalized))
      .map(({ label, timeZone }) => ({
        alias: true,
        key: `city:${label}:${timeZone}`,
        label,
        timeZone,
      }));
    const matchingZones = canonicalOptions.filter(({ timeZone }) => searchableName(timeZone).includes(normalized));
    return [...aliasOptions, ...matchingZones];
  }, [canonicalOptions, query, timeZones, value]);

  const selectTimeZone = (timeZone: string) => {
    setQuery(timeZone);
    setOpen(false);
    setActiveIndex(0);
    onChange(timeZone);
  };

  const openOptions = () => {
    if (disabled) return;
    setOpen(true);
    setActiveIndex(Math.max(0, filteredOptions.findIndex((option) => option.timeZone === value)));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      setQuery(value);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openOptions();
        return;
      }
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => Math.min(
        Math.max(current + direction, 0),
        Math.max(filteredOptions.length - 1, 0),
      ));
      return;
    }

    if (event.key === "Enter" && open && filteredOptions[activeIndex]) {
      event.preventDefault();
      selectTimeZone(filteredOptions[activeIndex].timeZone);
    }
  };

  return (
    <div className={`timezone-select ${className}`.trim()}>
      <label htmlFor={inputId}>{label}</label>
      <div className="timezone-control" data-open={open || undefined}>
        <MagnifyingGlass aria-hidden="true" size={14} />
        <input
          aria-activedescendant={open && filteredOptions[activeIndex]
            ? `${listId}-${activeIndex}`
            : undefined}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          aria-label={ariaLabel}
          autoComplete="off"
          disabled={disabled}
          id={inputId}
          onBlur={() => window.setTimeout(() => {
            const exactMatch = timeZones.find(
              (timeZone) => timeZone.toLocaleLowerCase() === query.trim().toLocaleLowerCase(),
            );
            if (exactMatch && exactMatch !== value) onChange(exactMatch);
            setOpen(false);
            setQuery(exactMatch ?? value);
          }, 120)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onFocus={openOptions}
          onKeyDown={handleKeyDown}
          role="combobox"
          spellCheck={false}
          value={query}
        />
        <button
          aria-label={`Show ${ariaLabel} options`}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => (open ? setOpen(false) : openOptions())}
          type="button"
        >
          <CaretDown aria-hidden="true" size={13} />
        </button>
      </div>
      {open ? (
        <ul aria-label={`${ariaLabel} options`} className="timezone-options" id={listId} role="listbox">
          {filteredOptions.length > 0 ? filteredOptions.map((option, index) => (
            <li
              aria-label={option.alias
                ? `${option.label}, ${option.timeZone}, ${offsetName(option.timeZone)}`
                : `${option.label}, ${offsetName(option.timeZone)}`}
              aria-selected={option.timeZone === value}
              data-active={index === activeIndex || undefined}
              id={`${listId}-${index}`}
              key={option.key}
              onMouseDown={(event) => {
                event.preventDefault();
                selectTimeZone(option.timeZone);
              }}
              onMouseEnter={() => setActiveIndex(index)}
              role="option"
            >
              <span className={option.alias ? "timezone-city-option" : undefined}>
                {option.label}
                {option.alias ? <small>{option.timeZone}</small> : null}
              </span>
              <small>{offsetName(option.timeZone)}</small>
            </li>
          )) : (
            <li className="timezone-empty">No matching IANA time zone</li>
          )}
        </ul>
      ) : null}
    </div>
  );
}

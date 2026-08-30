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

const offsetCache = new Map<string, string>();

function supportedTimeZones(preferred: string): string[] {
  const values = typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : fallbackTimeZones;
  return [...new Set([preferred, "UTC", ...values])];
}

function searchableName(timeZone: string): string {
  return timeZone.replaceAll("_", " ").replaceAll("/", " ").toLocaleLowerCase();
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
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => setQuery(value), [value]);

  const filteredTimeZones = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized || normalized === value.toLocaleLowerCase()) return timeZones;
    return timeZones.filter((timeZone) => searchableName(timeZone).includes(normalized));
  }, [query, timeZones, value]);

  const selectTimeZone = (timeZone: string) => {
    setQuery(timeZone);
    setOpen(false);
    setActiveIndex(0);
    onChange(timeZone);
  };

  const openOptions = () => {
    if (disabled) return;
    setOpen(true);
    setActiveIndex(Math.max(0, filteredTimeZones.indexOf(value)));
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
        Math.max(filteredTimeZones.length - 1, 0),
      ));
      return;
    }

    if (event.key === "Enter" && open && filteredTimeZones[activeIndex]) {
      event.preventDefault();
      selectTimeZone(filteredTimeZones[activeIndex]);
    }
  };

  return (
    <div className={`timezone-select ${className}`.trim()}>
      <label htmlFor={inputId}>{label}</label>
      <div className="timezone-control" data-open={open || undefined}>
        <MagnifyingGlass aria-hidden="true" size={14} />
        <input
          aria-activedescendant={open && filteredTimeZones[activeIndex]
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
          {filteredTimeZones.length > 0 ? filteredTimeZones.map((timeZone, index) => (
            <li
              aria-selected={timeZone === value}
              data-active={index === activeIndex || undefined}
              id={`${listId}-${index}`}
              key={timeZone}
              onMouseDown={(event) => {
                event.preventDefault();
                selectTimeZone(timeZone);
              }}
              onMouseEnter={() => setActiveIndex(index)}
              role="option"
            >
              <span>{displayName(timeZone)}</span>
              <small>{offsetName(timeZone)}</small>
            </li>
          )) : (
            <li className="timezone-empty">No matching IANA time zone</li>
          )}
        </ul>
      ) : null}
    </div>
  );
}

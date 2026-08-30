import { CaretDown, MagnifyingGlass } from "@phosphor-icons/react";
import { useEffect, useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  canonicalTimeZoneOptions,
  filterTimeZoneOptions,
  supportedTimeZones,
} from "../timezones/catalog";

type TimeZoneSelectProps = {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  label: ReactNode;
  onChange: (timeZone: string) => void;
  value: string;
};

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
  const canonicalOptions = useMemo(
    () => canonicalTimeZoneOptions(timeZones),
    [timeZones],
  );
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => setQuery(value), [value]);

  const filteredOptions = useMemo(
    () => filterTimeZoneOptions(canonicalOptions, timeZones, query, value),
    [canonicalOptions, query, timeZones, value],
  );

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
                ? `${option.label}, ${option.timeZone}`
                : option.label}
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
            </li>
          )) : (
            <li className="timezone-empty">No matching IANA time zone</li>
          )}
        </ul>
      ) : null}
    </div>
  );
}

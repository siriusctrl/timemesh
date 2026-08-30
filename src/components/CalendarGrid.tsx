import { useEffect, useMemo, useRef } from "react";
import { getBit } from "../protocol/bits";
import { groupSlotsByDay } from "../protocol/time";
import type { BaseAllocation } from "../protocol/types";

export type CalendarMode = "base" | "respond" | "plan";

type CalendarGridProps = {
  base: BaseAllocation;
  mode: CalendarMode;
  selected: Set<number>;
  onSelectedChange?: (next: Set<number>) => void;
  scores?: number[];
  participantCount?: number;
  displayTimezone: string;
  fullDay: boolean;
};

export function CalendarGrid({
  base,
  mode,
  selected,
  onSelectedChange,
  scores = [],
  participantCount = 0,
  displayTimezone,
  fullDay,
}: CalendarGridProps) {
  const dragging = useRef(false);
  const dragValue = useRef(false);
  const days = useMemo(
    () => groupSlotsByDay(base, displayTimezone),
    [base, displayTimezone],
  );
  const visibleDays = useMemo(
    () => days.map((day) => ({
      ...day,
      slots: day.slots.filter((slot) => fullDay || (slot.hour >= 7 && slot.hour < 22)),
    })),
    [days, fullDay],
  );

  useEffect(() => {
    const stopDragging = () => {
      dragging.current = false;
    };
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    return () => {
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, []);

  const setSlot = (index: number, value: boolean) => {
    if (!onSelectedChange || mode === "plan") return;
    if (mode === "respond" && getBit(base.unavailable, index)) return;
    const next = new Set(selected);
    if (value) next.add(index);
    else next.delete(index);
    onSelectedChange(next);
  };

  const beginDrag = (index: number) => {
    if (mode === "plan" || (mode === "respond" && getBit(base.unavailable, index))) return;
    dragValue.current = !selected.has(index);
    dragging.current = true;
    setSlot(index, dragValue.current);
  };

  const statusForSlot = (index: number): string => {
    if (getBit(base.unavailable, index)) return "Organizer unavailable";
    if (mode === "base") return selected.has(index) ? "Unavailable" : "Available";
    if (mode === "respond") return selected.has(index) ? "Free" : "Not selected";
    const score = scores[index] ?? 0;
    return participantCount === 0
      ? "Organizer available"
      : `${score} of ${participantCount} participants free`;
  };

  const timeRail = visibleDays[0]?.slots ?? [];

  return (
    <div className="calendar-shell" data-testid="calendar-grid">
      <div className="calendar-scroll">
        <div
          className="calendar-grid"
          style={{ gridTemplateColumns: `48px repeat(${visibleDays.length}, minmax(56px, 1fr))` }}
        >
          <div className="calendar-corner">Time</div>
          {visibleDays.map((day) => (
            <div className="day-heading" key={day.key}>
              <span>{day.weekdayLabel}</span>
              <strong>{day.dateLabel}</strong>
            </div>
          ))}
          <div className="time-rail" aria-hidden="true">
            {timeRail.map((slot) => (
              <div className="time-rail-slot" key={slot.index}>
                {slot.minute === 0 ? slot.timeLabel : ""}
              </div>
            ))}
          </div>
          {visibleDays.map((day) => (
            <div className="day-column" key={day.key}>
              {day.slots.map((slot) => {
                const hostBlocked = getBit(base.unavailable, slot.index);
                const active = mode === "base" ? selected.has(slot.index) : mode === "respond" && selected.has(slot.index);
                const score = scores[slot.index] ?? 0;
                const ratio = participantCount > 0 ? score / participantCount : 0;
                const classNames = [
                  "time-slot",
                  slot.minute === 0 ? "hour-start" : "",
                  hostBlocked ? "host-blocked" : "",
                  active ? (mode === "base" ? "marked-unavailable" : "marked-free") : "",
                  mode === "plan" && !hostBlocked ? "heat-slot" : "",
                ].filter(Boolean).join(" ");
                return (
                  <button
                    aria-label={`${day.weekdayLabel} ${day.dateLabel} ${slot.timeLabel}: ${statusForSlot(slot.index)}`}
                    className={classNames}
                    data-slot-index={slot.index}
                    disabled={mode === "respond" && hostBlocked}
                    key={slot.index}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSlot(slot.index, !selected.has(slot.index));
                      }
                    }}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      beginDrag(slot.index);
                    }}
                    onPointerEnter={() => {
                      if (dragging.current) setSlot(slot.index, dragValue.current);
                    }}
                    style={{ "--heat-strength": `${Math.round(ratio * 82)}%` } as React.CSSProperties}
                    title={`${slot.timeLabel} ${slot.offset} - ${statusForSlot(slot.index)}`}
                    type="button"
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

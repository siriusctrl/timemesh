import { useEffect, useMemo, useRef, useState } from "react";
import { alignSlotDays } from "../calendar/alignDays";
import { getBit } from "../protocol/bits";
import { groupSlotsByDay } from "../protocol/time";
import type { BaseAllocation } from "../protocol/types";
import type { WorkspaceKind } from "../workspace";

type CalendarGridProps = {
  base: BaseAllocation;
  workspace: WorkspaceKind;
  selected: Set<number>;
  onSelectedChange?: (next: Set<number>) => void;
  scores?: number[];
  participantCount?: number;
  displayTimezone: string;
  fullDay: boolean;
};

export function CalendarGrid({
  base,
  workspace,
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
  const aligned = useMemo(
    () => alignSlotDays(visibleDays, base.slotMinutes),
    [base.slotMinutes, visibleDays],
  );
  const firstEditableSlot = useMemo(() => aligned.days
    .flatMap((day) => day.slots)
    .find((slot) => slot && (workspace !== "response" || !getBit(base.unavailable, slot.index)))?.index ?? -1,
  [aligned.days, base.unavailable, workspace]);
  const [focusedSlot, setFocusedSlot] = useState(firstEditableSlot);
  const slotButtons = useRef(new Map<number, HTMLButtonElement>());

  useEffect(() => setFocusedSlot(firstEditableSlot), [firstEditableSlot]);

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
    if (!onSelectedChange || workspace === "comparison") return;
    if (workspace === "response" && getBit(base.unavailable, index)) return;
    const next = new Set(selected);
    if (value) next.add(index);
    else next.delete(index);
    onSelectedChange(next);
  };

  const beginDrag = (index: number) => {
    if (workspace === "comparison" || (workspace === "response" && getBit(base.unavailable, index))) return;
    dragValue.current = !selected.has(index);
    dragging.current = true;
    setSlot(index, dragValue.current);
  };

  const statusForSlot = (index: number): string => {
    if (getBit(base.unavailable, index)) return "Organizer unavailable";
    if (workspace === "organizer") return selected.has(index) ? "Unavailable" : "Available";
    if (workspace === "response") return selected.has(index) ? "Free" : "Not selected";
    const score = scores[index] ?? 0;
    return participantCount === 0
      ? "Organizer available"
      : `${score} of ${participantCount} participants free`;
  };

  const focusCell = (dayIndex: number, rowIndex: number, dayStep: number, rowStep: number) => {
    let nextDay = dayIndex + dayStep;
    let nextRow = rowIndex + rowStep;
    while (nextDay >= 0 && nextDay < aligned.days.length && nextRow >= 0 && nextRow < aligned.rows.length) {
      const slot = aligned.days[nextDay]?.slots[nextRow];
      if (slot && (workspace !== "response" || !getBit(base.unavailable, slot.index))) {
        setFocusedSlot(slot.index);
        slotButtons.current.get(slot.index)?.focus();
        return;
      }
      nextDay += dayStep;
      nextRow += rowStep;
    }
  };

  return (
    <div className="calendar-shell" data-testid="calendar-grid">
      <div className="calendar-scroll">
        <div
          className="calendar-grid"
          style={{ gridTemplateColumns: `48px repeat(${aligned.days.length}, minmax(56px, 1fr))` }}
        >
          <div className="calendar-corner">Time</div>
          {aligned.days.map((day) => (
            <div className="day-heading" key={day.key}>
              <span>{day.weekdayLabel}</span>
              <strong>{day.dateLabel}</strong>
            </div>
          ))}
          <div className="time-rail" aria-hidden="true">
            {aligned.rows.map((slot) => (
              <div className="time-rail-slot" key={slot.key}>
                {slot.minute === 0 ? slot.timeLabel : ""}
              </div>
            ))}
          </div>
          {aligned.days.map((day, dayIndex) => (
            <div className="day-column" key={day.key}>
              {day.slots.map((slot, rowIndex) => {
                if (!slot) return <span aria-hidden="true" className="time-slot time-slot-empty" key={`empty-${rowIndex}`} />;
                const hostBlocked = getBit(base.unavailable, slot.index);
                const active = workspace === "organizer" ? selected.has(slot.index) : workspace === "response" && selected.has(slot.index);
                const score = scores[slot.index] ?? 0;
                const ratio = participantCount > 0 ? score / participantCount : 0;
                const heatStyle = { "--heat-strength": `${Math.round(ratio * 82)}%` } as React.CSSProperties;
                const classNames = [
                  "time-slot",
                  slot.minute === 0 ? "hour-start" : "",
                  hostBlocked ? "host-blocked" : "",
                  active ? (workspace === "organizer" ? "marked-unavailable" : "marked-free") : "",
                  workspace === "comparison" && !hostBlocked ? "heat-slot" : "",
                ].filter(Boolean).join(" ");
                if (workspace === "comparison") {
                  return <span aria-label={`${day.weekdayLabel} ${day.dateLabel} ${slot.timeLabel}: ${statusForSlot(slot.index)}`} className={classNames} key={slot.index} role="img" style={heatStyle} />;
                }
                return (
                  <button
                    aria-label={`${day.weekdayLabel} ${day.dateLabel} ${slot.timeLabel}: ${statusForSlot(slot.index)}`}
                    className={classNames}
                    data-slot-index={slot.index}
                    disabled={workspace === "response" && hostBlocked}
                    key={slot.index}
                    onFocus={() => setFocusedSlot(slot.index)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSlot(slot.index, !selected.has(slot.index));
                      } else if (event.key.startsWith("Arrow")) {
                        event.preventDefault();
                        if (event.key === "ArrowUp") focusCell(dayIndex, rowIndex, 0, -1);
                        if (event.key === "ArrowDown") focusCell(dayIndex, rowIndex, 0, 1);
                        if (event.key === "ArrowLeft") focusCell(dayIndex, rowIndex, -1, 0);
                        if (event.key === "ArrowRight") focusCell(dayIndex, rowIndex, 1, 0);
                      }
                    }}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      beginDrag(slot.index);
                    }}
                    onPointerEnter={() => {
                      if (dragging.current) setSlot(slot.index, dragValue.current);
                    }}
                    style={heatStyle}
                    tabIndex={slot.index === focusedSlot ? 0 : -1}
                    title={`${slot.timeLabel} ${slot.offset} - ${statusForSlot(slot.index)}`}
                    type="button"
                    ref={(button) => {
                      if (button) slotButtons.current.set(slot.index, button);
                      else slotButtons.current.delete(slot.index);
                    }}
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

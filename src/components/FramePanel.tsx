import { ArrowCounterClockwise, Clock, GlobeHemisphereWest, MagicWand } from "@phosphor-icons/react";
import { useState } from "react";
import type { SlotMinutes } from "../protocol/types";
import { TimeZoneSelect } from "./TimeZoneSelect";

export type FrameSettings = {
  startDate: string;
  days: number;
  timezone: string;
  slotMinutes: SlotMinutes;
  meetingMinutes: number;
};

type FramePanelProps = {
  settings: FrameSettings;
  onChange: (next: FrameSettings) => void;
  onApplyWorkHours: (startMinute: number, endMinute: number) => void;
  onClear: () => void;
  frameDisabled?: boolean;
  participantView?: boolean;
};

export function FramePanel({
  settings,
  onChange,
  onApplyWorkHours,
  onClear,
  frameDisabled = false,
  participantView = false,
}: FramePanelProps) {
  const [workdayStart, setWorkdayStart] = useState("08:00");
  const [workdayEnd, setWorkdayEnd] = useState("20:00");

  const update = <Key extends keyof FrameSettings>(key: Key, value: FrameSettings[Key]) => {
    onChange({ ...settings, [key]: value });
  };

  const toMinuteOfDay = (value: string) => {
    const [hour, minute] = value.split(":").map(Number);
    return hour * 60 + minute;
  };
  const startMinute = toMinuteOfDay(workdayStart);
  const endMinute = toMinuteOfDay(workdayEnd);
  const completeWorkHours = /^\d{2}:\d{2}$/u.test(workdayStart) && /^\d{2}:\d{2}$/u.test(workdayEnd);
  const invalidWorkHours = !completeWorkHours || endMinute <= startMinute;

  return (
    <aside className="frame-panel">
      {participantView ? (
        <div className="panel-heading">
          <h2>Share when you are free</h2>
          <Clock aria-hidden="true" size={23} />
        </div>
      ) : null}
      <div className="field-grid">
        <label>
          <span>Starts</span>
          <input
            disabled={frameDisabled}
            onChange={(event) => update("startDate", event.target.value)}
            type="date"
            value={settings.startDate}
          />
        </label>
        <label>
          <span>Window</span>
          <select
            disabled={frameDisabled}
            onChange={(event) => update("days", Number(event.target.value))}
            value={settings.days}
          >
            {[7, 14, 21, 28, 31].map((days) => <option key={days} value={days}>{days} days</option>)}
          </select>
        </label>
        <TimeZoneSelect
          ariaLabel="Organizer time zone"
          className="wide-field"
          disabled={frameDisabled}
          id="organizer-timezone"
          label={<><GlobeHemisphereWest aria-hidden="true" size={14} /> Organizer time zone</>}
          onChange={(timeZone) => update("timezone", timeZone)}
          value={settings.timezone}
        />
        <label>
          <span>Grid</span>
          <select
            disabled={frameDisabled}
            onChange={(event) => update("slotMinutes", Number(event.target.value) as SlotMinutes)}
            value={settings.slotMinutes}
          >
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={60}>60 minutes</option>
          </select>
        </label>
        <label>
          <span>Meeting</span>
          <select
            disabled={frameDisabled}
            onChange={(event) => update("meetingMinutes", Number(event.target.value))}
            value={settings.meetingMinutes}
          >
            {[15, 30, 45, 60, 90, 120].filter((minutes) => minutes % settings.slotMinutes === 0).map(
              (minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>,
            )}
          </select>
        </label>
      </div>
      <div className="work-hours-preset">
        <div className="work-hours-label">
          <MagicWand aria-hidden="true" size={15} />
          <span>Weekday hours</span>
        </div>
        <div className="work-hours-inputs">
          <input
            aria-label="Weekday hours start"
            onChange={(event) => setWorkdayStart(event.target.value)}
            step={settings.slotMinutes * 60}
            type="time"
            value={workdayStart}
          />
          <span aria-hidden="true">to</span>
          <input
            aria-label="Weekday hours end"
            onChange={(event) => setWorkdayEnd(event.target.value)}
            step={settings.slotMinutes * 60}
            type="time"
            value={workdayEnd}
          />
        </div>
        {invalidWorkHours ? <p role="alert">Choose an end time later than the start.</p> : null}
        <button
          disabled={invalidWorkHours}
          onClick={() => onApplyWorkHours(startMinute, endMinute)}
          type="button"
        >
          {participantView ? "Mark weekday hours free" : "Keep weekday hours"}
        </button>
      </div>
      <div className="preset-actions">
        <button onClick={onClear} type="button">
          <ArrowCounterClockwise aria-hidden="true" size={16} />
          Clear marks
        </button>
      </div>
      <p className="panel-footnote">{participantView
        ? "The organizer's unavailable times stay blocked. Your response remains in this browser until you copy it."
        : "Times use an IANA zone so daylight-saving boundaries remain accurate."}</p>
    </aside>
  );
}

import { ArrowCounterClockwise, Clock, GlobeHemisphereWest, MagicWand } from "@phosphor-icons/react";
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
  onApplyWorkHours: () => void;
  onClear: () => void;
  frameDisabled?: boolean;
  selectionDisabled?: boolean;
};

export function FramePanel({
  settings,
  onChange,
  onApplyWorkHours,
  onClear,
  frameDisabled = false,
  selectionDisabled = false,
}: FramePanelProps) {
  const update = <Key extends keyof FrameSettings>(key: Key, value: FrameSettings[Key]) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <aside className="frame-panel">
      <div className="panel-heading">
        <div>
          <span>Base frame</span>
          <h2>Set the coordinate system</h2>
        </div>
        <Clock aria-hidden="true" size={23} />
      </div>
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
      <div className="preset-actions">
        <button disabled={selectionDisabled} onClick={onApplyWorkHours} type="button">
          <MagicWand aria-hidden="true" size={16} />
          Keep weekdays 09:00-18:00
        </button>
        <button disabled={selectionDisabled} onClick={onClear} type="button">
          <ArrowCounterClockwise aria-hidden="true" size={16} />
          Clear marks
        </button>
      </div>
      <p className="panel-footnote">The token stores absolute slots. The IANA zone preserves daylight-saving boundaries.</p>
    </aside>
  );
}

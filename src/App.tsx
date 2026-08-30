import { Eye, EyeSlash } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import agentSkill from "../skills/plan-time-with-tokens/SKILL.md?raw";
import { AppHeader } from "./components/AppHeader";
import { CalendarGrid } from "./components/CalendarGrid";
import { ComparisonPanel } from "./components/ComparisonPanel";
import { FramePanel, type FrameSettings } from "./components/FramePanel";
import { OutputBar } from "./components/OutputBar";
import { SkillDrawer } from "./components/SkillDrawer";
import { TimeZoneSelect } from "./components/TimeZoneSelect";
import { TokenConsole } from "./components/TokenConsole";
import { bitsetToSet, createBitset, getBit } from "./protocol/bits";
import {
  decodeParticipantToken,
  decodeTokenBundle,
  encodeBaseToken,
  encodeParticipantToken,
  extractTokens,
  formatTokenBundle,
  formatTokenLine,
} from "./protocol/codec";
import { availabilityScores, findCandidateWindows } from "./protocol/planner";
import {
  baseStartDate,
  baseWindowDays,
  createBaseAllocation,
  describeBaseRange,
  systemTimeZone,
  todayInTimeZone,
  workHoursSlotSet,
} from "./protocol/time";
import {
  BASE_TOKEN_PREFIX,
  DEFAULT_SLOT_MINUTES,
  type BaseAllocation,
  type ParticipantAllocation,
} from "./protocol/types";
import { useTheme } from "./useTheme";
import { type WorkspaceKind, workspaceForImportedResponses } from "./workspace";

type Notice = { kind: "success" | "error" | "info"; message: string };

function createInitialState(): { settings: FrameSettings; base: BaseAllocation } {
  const timezone = systemTimeZone();
  const settings: FrameSettings = {
    startDate: todayInTimeZone(timezone),
    days: 14,
    timezone,
    slotMinutes: DEFAULT_SLOT_MINUTES,
    meetingMinutes: 60,
  };
  return { settings, base: createBaseAllocation(settings) };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "The token could not be processed.";
}

function routeTokenBundle(): string | null {
  const pathTokens = extractTokens(window.location.pathname);
  if (pathTokens.length > 0) return pathTokens.join("\n");
  const hashTokens = extractTokens(window.location.hash);
  return hashTokens.length > 0 ? hashTokens.join("\n") : null;
}

function safeTimeZone(candidate: string, fallback: string): string {
  try {
    new Intl.DateTimeFormat("en", { timeZone: candidate }).format(0);
    return candidate;
  } catch {
    return fallback;
  }
}

export default function App() {
  const initial = useMemo(createInitialState, []);
  const { followsSystem, theme, toggleTheme } = useTheme();
  const [workspace, setWorkspace] = useState<WorkspaceKind>("organizer");
  const [settings, setSettings] = useState<FrameSettings>(initial.settings);
  const [base, setBase] = useState<BaseAllocation>(initial.base);
  const [freeSlots, setFreeSlots] = useState<Set<number>>(new Set());
  const [baseToken, setBaseToken] = useState("");
  const [baseLabel, setBaseLabel] = useState("");
  const [participantToken, setParticipantToken] = useState("");
  const [responseLabel, setResponseLabel] = useState("");
  const [participants, setParticipants] = useState<ParticipantAllocation[]>([]);
  const [participantLabels, setParticipantLabels] = useState<Array<string | undefined>>([]);
  const [tokenInput, setTokenInput] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [displayTimezone, setDisplayTimezone] = useState(systemTimeZone);
  const [fullDay, setFullDay] = useState(true);
  const [skillOpen, setSkillOpen] = useState(false);
  const [copiedValue, setCopiedValue] = useState<"token" | "bundle" | "url" | null>(null);

  const scores = useMemo(
    () => availabilityScores(base, participants),
    [base, participants],
  );
  const candidates = useMemo(
    () => workspace === "comparison" ? findCandidateWindows(base, participants) : [],
    [base, participants, workspace],
  );
  const effectiveDisplayTimezone = useMemo(
    () => safeTimeZone(displayTimezone, base.timezone),
    [base.timezone, displayTimezone],
  );

  const markBaseDirty = (nextBlocked: Set<number>) => {
    setBase((current) => ({
      ...current,
      unavailable: createBitset(current.slotCount, nextBlocked),
    }));
    if (baseToken) {
      setBaseToken("");
      setParticipantToken("");
      setParticipants([]);
      setParticipantLabels([]);
      setTokenInput("");
      setNotice({ kind: "info", message: "Organizer availability changed. Generate a new meeting token before collecting responses." });
    }
  };

  const markResponseDirty = (nextFree: Set<number>) => {
    setFreeSlots(nextFree);
    if (participantToken) {
      setParticipantToken("");
      setParticipants([]);
      setParticipantLabels([]);
      setTokenInput(formatTokenLine(baseToken, baseLabel));
      setNotice({ kind: "info", message: "Response changed. Generate a new response bundle." });
    }
  };

  const updateSettings = (next: FrameSettings) => {
    const validMeeting = next.meetingMinutes % next.slotMinutes === 0
      ? next.meetingMinutes
      : Math.max(next.slotMinutes, Math.ceil(next.meetingMinutes / next.slotMinutes) * next.slotMinutes);
    const normalized = { ...next, meetingMinutes: validMeeting };
    try {
      const nextBase = createBaseAllocation(normalized);
      setSettings(normalized);
      setBase(nextBase);
      setFreeSlots(new Set());
      setBaseToken("");
      setParticipantToken("");
      setParticipants([]);
      setParticipantLabels([]);
      setTokenInput("");
      setNotice(null);
    } catch (error) {
      setNotice({ kind: "error", message: errorMessage(error) });
    }
  };

  const applyWorkHours = (startMinute: number, endMinute: number) => {
    const workHours = workHoursSlotSet(
      base,
      workspace === "response" ? effectiveDisplayTimezone : base.timezone,
      startMinute,
      endMinute,
      true,
    );
    if (workspace === "organizer") {
      const unavailable = new Set<number>();
      for (let index = 0; index < base.slotCount; index += 1) {
        if (!workHours.has(index)) unavailable.add(index);
      }
      markBaseDirty(unavailable);
    } else if (workspace === "response") {
      const available = new Set<number>();
      for (const index of workHours) {
        if (!getBit(base.unavailable, index)) available.add(index);
      }
      markResponseDirty(available);
    }
  };

  const clearSelection = () => {
    if (workspace === "organizer") markBaseDirty(new Set());
    else if (workspace === "response") markResponseDirty(new Set());
  };

  const generateBase = () => {
    try {
      const token = encodeBaseToken(base);
      setBaseToken(token);
      setParticipantToken("");
      setParticipantLabels([]);
      setTokenInput(formatTokenLine(token, baseLabel));
      setNotice({ kind: "success", message: "Meeting token generated and verified locally." });
    } catch (error) {
      setNotice({ kind: "error", message: errorMessage(error) });
    }
  };

  const generateParticipant = async () => {
    if (!baseToken) return;
    setBusy(true);
    try {
      const token = await encodeParticipantToken(baseToken, base, freeSlots);
      const decoded = await decodeParticipantToken(token, baseToken, base);
      setParticipantToken(token);
      setParticipants([decoded]);
      setParticipantLabels([responseLabel.trim() || undefined]);
      setTokenInput(formatTokenBundle(baseToken, [token], {
        base: baseLabel,
        participants: [responseLabel],
      }));
      setNotice({ kind: "success", message: "Response bundle ready. Copy the bundle or URL and send it back to the organizer." });
    } catch (error) {
      setNotice({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const openTokens = async (input = tokenInput) => {
    setBusy(true);
    try {
      const pasted = extractTokens(input);
      const hasBase = pasted.some((token) => token.startsWith(BASE_TOKEN_PREFIX));
      const source = hasBase || !baseToken ? input : `${formatTokenLine(baseToken, baseLabel)}\n${input}`;
      const bundle = await decodeTokenBundle(source);
      setBase(bundle.base);
      setSettings({
        startDate: baseStartDate(bundle.base),
        days: baseWindowDays(bundle.base),
        timezone: bundle.base.timezone,
        slotMinutes: bundle.base.slotMinutes,
        meetingMinutes: bundle.base.meetingMinutes,
      });
      setBaseToken(bundle.baseToken);
      setBaseLabel(bundle.baseLabel ?? "");
      const nextWorkspace = workspaceForImportedResponses(bundle.participants.length);
      setParticipants(bundle.participants);
      setParticipantLabels(bundle.participantLabels);
      setParticipantToken(bundle.participantTokens.length === 1 ? bundle.participantTokens[0] : "");
      setResponseLabel(bundle.participantTokens.length === 1 ? bundle.participantLabels[0] ?? "" : "");
      setFreeSlots(bundle.participants.length === 1
        ? bitsetToSet(bundle.participants[0].free, bundle.base.slotCount)
        : new Set());
      setWorkspace(nextWorkspace);
      setTokenInput(formatTokenBundle(bundle.baseToken, bundle.participantTokens, {
        base: bundle.baseLabel,
        participants: bundle.participantLabels,
      }));
      setNotice({
        kind: "success",
        message: bundle.participants.length > 1
          ? `Loaded ${bundle.participants.length} responses for comparison.`
          : bundle.participants.length === 1
            ? "Response loaded. Review it here or edit it and generate a new bundle."
            : "Meeting opened. Mark every time that works for you.",
      });
    } catch (error) {
      setNotice({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const routedBundle = routeTokenBundle();
    if (!routedBundle) return;
    setTokenInput(routedBundle);
    void openTokens(routedBundle);
    // Route tokens are consumed only once at startup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyText = async (value: string, type: "token" | "bundle" | "url") => {
    await navigator.clipboard.writeText(value);
    setCopiedValue(type);
    window.setTimeout(() => setCopiedValue(null), 1600);
  };

  const updateResponseLabel = (value: string) => {
    setResponseLabel(value);
    if (!participantToken) return;
    setParticipantLabels([value.trim() || undefined]);
    setTokenInput(formatTokenBundle(baseToken, [participantToken], {
      base: baseLabel,
      participants: [value],
    }));
  };

  const urlTokenBundle = workspace === "response" && participantToken
    ? `${baseToken}/${participantToken}`
    : workspace === "organizer" ? baseToken : "";
  const shareUrl = urlTokenBundle
    ? `${window.location.origin}${import.meta.env.BASE_URL}#/${urlTokenBundle}`
    : "";
  const blockedSlots = useMemo(
    () => bitsetToSet(base.unavailable, base.slotCount),
    [base],
  );
  const activeSelection = workspace === "organizer" ? blockedSlots : freeSlots;
  return (
    <div className={`app-shell app-shell-${workspace}`}>
      <AppHeader
        followsSystem={followsSystem}
        onOpenSkill={() => setSkillOpen(true)}
        onToggleTheme={toggleTheme}
        theme={theme}
      />

      <main id="schedule-workspace">
        <section className="command-strip">
          <TokenConsole
            busy={busy}
            notice={notice}
            onChange={setTokenInput}
            onDecode={() => void openTokens()}
            value={tokenInput}
          />
        </section>

        <section className="workspace" aria-label="Time allocation workspace">
          <div className="workspace-summary">
            <strong className="workspace-range">{describeBaseRange(base, effectiveDisplayTimezone)}</strong>
            <div className="view-controls">
              <TimeZoneSelect
                ariaLabel="Display time zone"
                id="display-timezone"
                label="Display zone"
                onChange={setDisplayTimezone}
                value={displayTimezone}
              />
              <button className="view-toggle" onClick={() => setFullDay(!fullDay)} type="button">
                {fullDay ? <EyeSlash aria-hidden="true" size={16} /> : <Eye aria-hidden="true" size={16} />}
                {fullDay ? "Focus hours" : "Full day"}
              </button>
            </div>
          </div>

          <div className="workspace-layout">
            {workspace === "comparison" ? (
              <ComparisonPanel
                base={base}
                candidates={candidates}
                displayTimezone={effectiveDisplayTimezone}
                participantLabels={participantLabels}
              />
            ) : (
              <FramePanel
                frameDisabled={workspace !== "organizer"}
                onApplyWorkHours={applyWorkHours}
                onChange={updateSettings}
                onClear={clearSelection}
                identityLabel={workspace === "response" ? responseLabel : undefined}
                onIdentityLabelChange={workspace === "response" ? updateResponseLabel : undefined}
                participantView={workspace === "response"}
                settings={settings}
              />
            )}
            <div className="calendar-region">
              <div className="calendar-legend">
                {workspace === "organizer" ? (
                  <><span><i className="legend-blocked" /> Unavailable</span><span><i className="legend-open" /> Open</span></>
                ) : workspace === "response" ? (
                  <><span><i className="legend-free" /> Your free time</span><span><i className="legend-blocked" /> Organizer unavailable</span></>
                ) : (
                  <><span><i className="legend-free" /> More people free</span><span><i className="legend-blocked" /> Organizer unavailable</span></>
                )}
                <span className="legend-help">{workspace === "comparison" ? "Read the overlap grid" : "Drag or use arrow keys"}</span>
              </div>
              <CalendarGrid
                base={base}
                displayTimezone={effectiveDisplayTimezone}
                fullDay={fullDay}
                workspace={workspace}
                onSelectedChange={workspace === "comparison" ? undefined : workspace === "organizer" ? markBaseDirty : markResponseDirty}
                participantCount={participants.length}
                scores={scores}
                selected={activeSelection}
              />
            </div>
          </div>

          <OutputBar
            baseToken={baseToken}
            busy={busy}
            copiedValue={copiedValue}
            error={notice?.kind === "error" ? notice.message : undefined}
            workspace={workspace}
            onCopy={(value, type) => void copyText(value, type)}
            onGenerateBase={generateBase}
            onCreateResponse={() => void generateParticipant()}
            participantCount={participants.length}
            participantToken={participantToken}
            shareUrl={shareUrl}
            tokenBundle={tokenInput}
          />
        </section>

      </main>

      <SkillDrawer onClose={() => setSkillOpen(false)} open={skillOpen} skillText={agentSkill} />
    </div>
  );
}

import {
  BracketsCurly,
  Check,
  Copy,
  Eye,
  EyeSlash,
  LinkSimple,
  Moon,
  Robot,
  ShieldCheck,
  Sun,
} from "@phosphor-icons/react";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import agentSkill from "../skills/plan-time-with-tokens/SKILL.md?raw";
import { CalendarGrid, type CalendarMode } from "./components/CalendarGrid";
import { FramePanel, type FrameSettings } from "./components/FramePanel";
import { PlannerPanel } from "./components/PlannerPanel";
import { SkillDrawer } from "./components/SkillDrawer";
import { TimeZoneSelect } from "./components/TimeZoneSelect";
import { TokenConsole } from "./components/TokenConsole";
import { bitsetToSet, countBits, createBitset, getBit } from "./protocol/bits";
import {
  decodeParticipantToken,
  decodeTokenBundle,
  encodeBaseToken,
  encodeParticipantToken,
  extractTokens,
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
  PARTICIPANT_TOKEN_PREFIX,
  type BaseAllocation,
  type ParticipantAllocation,
  type TokenError,
} from "./protocol/types";

type Theme = "light" | "dark";
type Notice = { kind: "success" | "error" | "info"; message: string };

function initialTheme(): Theme {
  try {
    const saved = window.localStorage.getItem("timemesh-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // System preference remains available when storage is disabled.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

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
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [mode, setMode] = useState<CalendarMode>("base");
  const [settings, setSettings] = useState<FrameSettings>(initial.settings);
  const [base, setBase] = useState<BaseAllocation>(initial.base);
  const [blockedSlots, setBlockedSlots] = useState<Set<number>>(new Set());
  const [freeSlots, setFreeSlots] = useState<Set<number>>(new Set());
  const [baseToken, setBaseToken] = useState("");
  const [participantToken, setParticipantToken] = useState("");
  const [participants, setParticipants] = useState<ParticipantAllocation[]>([]);
  const [tokenInput, setTokenInput] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [displayTimezone, setDisplayTimezone] = useState(systemTimeZone);
  const [fullDay, setFullDay] = useState(true);
  const [skillOpen, setSkillOpen] = useState(false);
  const [copiedValue, setCopiedValue] = useState<"token" | "url" | null>(null);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
      window.localStorage.setItem("timemesh-theme", theme);
    } catch {
      // The selected theme still applies to the current tab.
    }
  }, [theme]);

  const scores = useMemo(
    () => availabilityScores(base, participants),
    [base, participants],
  );
  const candidates = useMemo(
    () => findCandidateWindows(base, participants),
    [base, participants],
  );
  const effectiveDisplayTimezone = useMemo(
    () => safeTimeZone(displayTimezone, base.timezone),
    [base.timezone, displayTimezone],
  );

  const markBaseDirty = (nextBlocked: Set<number>) => {
    setBlockedSlots(nextBlocked);
    if (baseToken) {
      setBaseToken("");
      setParticipantToken("");
      setParticipants([]);
      setNotice({ kind: "info", message: "Organizer availability changed. Create a new meeting link before collecting responses." });
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
      setBlockedSlots(new Set());
      setFreeSlots(new Set());
      setBaseToken("");
      setParticipantToken("");
      setParticipants([]);
      setNotice(null);
    } catch (error) {
      setSettings(normalized);
      setNotice({ kind: "error", message: errorMessage(error) });
    }
  };

  const applyWorkHours = (startMinute: number, endMinute: number) => {
    const workHours = workHoursSlotSet(base, base.timezone, startMinute, endMinute, true);
    if (mode === "base") {
      const unavailable = new Set<number>();
      for (let index = 0; index < base.slotCount; index += 1) {
        if (!workHours.has(index)) unavailable.add(index);
      }
      markBaseDirty(unavailable);
    } else if (mode === "respond") {
      const available = new Set<number>();
      for (const index of workHours) {
        if (!getBit(base.unavailable, index)) available.add(index);
      }
      setFreeSlots(available);
      setParticipantToken("");
    }
  };

  const clearSelection = () => {
    if (mode === "base") markBaseDirty(new Set());
    else {
      setFreeSlots(new Set());
      setParticipantToken("");
    }
  };

  const generateBase = () => {
    try {
      const nextBase = { ...base, unavailable: createBitset(base.slotCount, blockedSlots) };
      const token = encodeBaseToken(nextBase);
      setBase(nextBase);
      setBaseToken(token);
      setParticipantToken("");
      setTokenInput(token);
      setNotice({ kind: "success", message: "Meeting link created and verified locally." });
    } catch (error) {
      setNotice({ kind: "error", message: errorMessage(error) });
    }
  };

  const generateParticipant = async () => {
    if (!baseToken) return;
    setBusy(true);
    try {
      const token = await encodeParticipantToken(baseToken, base, freeSlots);
      await decodeParticipantToken(token, baseToken, base);
      setParticipantToken(token);
      setTokenInput(`${baseToken}\n${token}`);
      setNotice({ kind: "success", message: "Response ready. Copy the URL and send it back to the organizer." });
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
      const source = hasBase || !baseToken ? input : `${baseToken}\n${input}`;
      const bundle = await decodeTokenBundle(source);
      const uniqueParticipantTokens = [...new Set(bundle.participantTokens)];
      const uniqueParticipants = await Promise.all(
        uniqueParticipantTokens.map((token) => decodeParticipantToken(token, bundle.baseToken, bundle.base)),
      );
      setBase(bundle.base);
      setSettings({
        startDate: baseStartDate(bundle.base),
        days: baseWindowDays(bundle.base),
        timezone: bundle.base.timezone,
        slotMinutes: bundle.base.slotMinutes,
        meetingMinutes: bundle.base.meetingMinutes,
      });
      setBlockedSlots(bitsetToSet(bundle.base.unavailable, bundle.base.slotCount));
      setBaseToken(bundle.baseToken);
      setParticipants(uniqueParticipants);
      setParticipantToken("");
      setFreeSlots(new Set());
      setMode(uniqueParticipants.length > 0 ? "plan" : "respond");
      setTokenInput([bundle.baseToken, ...uniqueParticipantTokens].join("\n"));
      setNotice({
        kind: "success",
        message: uniqueParticipants.length > 0
          ? `Loaded ${uniqueParticipants.length} response${uniqueParticipants.length === 1 ? "" : "s"} for comparison.`
          : "Meeting opened. Mark every time that works for you.",
      });
    } catch (error) {
      const tokenError = error as TokenError;
      setNotice({ kind: "error", message: tokenError.message || errorMessage(error) });
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

  const copyText = async (value: string, type: "token" | "url") => {
    await navigator.clipboard.writeText(value);
    setCopiedValue(type);
    window.setTimeout(() => setCopiedValue(null), 1600);
  };

  const outputToken = mode === "base" ? baseToken : mode === "respond" ? participantToken : "";
  const urlTokenBundle = mode === "respond" && participantToken
    ? `${baseToken}/${participantToken}`
    : outputToken;
  const shareUrl = urlTokenBundle
    ? `${window.location.origin}${import.meta.env.BASE_URL}#/${urlTokenBundle}`
    : "";
  const activeSelection = mode === "base" ? blockedSlots : freeSlots;
  const selectedCount = mode === "base"
    ? blockedSlots.size
    : mode === "respond"
      ? freeSlots.size
      : scores.filter((score) => score >= 0).length;

  return (
    <div className={`app-shell app-shell-${mode}`}>
      <header className="site-header">
        <div className="header-identity">
          <a className="brand" href={import.meta.env.BASE_URL}>
            <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
            <span>TimeMesh</span>
          </a>
          <h1 className="header-tagline">Shared time, <em>encoded.</em></h1>
        </div>
        <nav aria-label="Primary">
          <button onClick={() => setSkillOpen(true)} type="button">
            <Robot aria-hidden="true" size={17} />
            Agent skill
          </button>
          <span className="local-status"><ShieldCheck aria-hidden="true" size={16} weight="fill" /> Local only</span>
          <button
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            className="theme-action"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            type="button"
          >
            <span className="theme-action-icon">
              {theme === "light" ? <Moon aria-hidden="true" size={16} /> : <Sun aria-hidden="true" size={16} />}
            </span>
            <span>{theme === "light" ? "Dark" : "Light"}</span>
          </button>
        </nav>
      </header>

      <main>
        {mode !== "respond" ? (
          <section className="command-strip">
            <TokenConsole
              busy={busy}
              notice={notice}
              onChange={setTokenInput}
              onDecode={() => void openTokens()}
              value={tokenInput}
            />
          </section>
        ) : null}

        <section className="workspace" aria-label="Time allocation workspace">
          <div className="workspace-summary">
            <div>
              <span>{mode === "base"
                ? "Create a meeting · mark organizer conflicts"
                : mode === "respond"
                  ? "Your response · mark every time that works"
                  : `Compare ${participants.length} response${participants.length === 1 ? "" : "s"}`}</span>
              <strong>{describeBaseRange(base, effectiveDisplayTimezone)}</strong>
            </div>
            <div className="workspace-summary-tools">
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
              <dl>
                <div><dt>Grid</dt><dd>{base.slotMinutes}m</dd></div>
                <div><dt>{mode === "base" ? "Blocked" : mode === "respond" ? "Free" : "Open"}</dt><dd>{selectedCount}</dd></div>
                <div>
                  <dt>{mode === "respond" ? "Meeting" : "Responses"}</dt>
                  <dd>{mode === "respond" ? `${base.meetingMinutes}m` : participants.length}</dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="workspace-layout">
            {mode === "plan" ? (
              <PlannerPanel base={base} candidates={candidates} displayTimezone={effectiveDisplayTimezone} />
            ) : (
              <FramePanel
                frameDisabled={mode !== "base"}
                onApplyWorkHours={applyWorkHours}
                onChange={updateSettings}
                onClear={clearSelection}
                participantView={mode === "respond"}
                settings={settings}
              />
            )}
            <div className="calendar-region">
              <div className="calendar-legend">
                {mode === "base" ? (
                  <><span><i className="legend-blocked" /> Unavailable</span><span><i className="legend-open" /> Open</span></>
                ) : mode === "respond" ? (
                  <><span><i className="legend-free" /> Your free time</span><span><i className="legend-blocked" /> Organizer unavailable</span></>
                ) : (
                  <><span><i className="legend-free" /> More people free</span><span><i className="legend-blocked" /> Organizer unavailable</span></>
                )}
                <span className="legend-help">Drag across the grid</span>
              </div>
              <CalendarGrid
                base={base}
                displayTimezone={effectiveDisplayTimezone}
                fullDay={fullDay}
                mode={mode}
                onSelectedChange={mode === "plan" ? undefined : mode === "base" ? markBaseDirty : (next) => {
                  setFreeSlots(next);
                  setParticipantToken("");
                }}
                participantCount={participants.length}
                scores={scores}
                selected={activeSelection}
              />
            </div>
          </div>

          <div className="output-bar">
            <div className="output-copy">
              <BracketsCurly aria-hidden="true" size={21} />
              <div>
                <span>{mode === "base" ? "Meeting link" : mode === "respond" ? "Your response" : "Responses being compared"}</span>
                <code>
                  {mode === "plan"
                    ? `${BASE_TOKEN_PREFIX}... + ${participants.length} ${PARTICIPANT_TOKEN_PREFIX}...`
                    : outputToken || "Generate when the allocation is ready"}
                </code>
                {mode === "respond" && participantToken ? (
                  <small role="status">Copy the URL and send it back to the organizer.</small>
                ) : mode === "respond" && notice?.kind === "error" ? (
                  <small className="output-error" role="status">{notice.message}</small>
                ) : null}
              </div>
            </div>
            <div className="output-actions">
              {mode === "base" ? (
                <button className="primary-action" onClick={generateBase} type="button">Create meeting link</button>
              ) : mode === "respond" ? (
                <button className="primary-action" disabled={!baseToken || busy} onClick={() => void generateParticipant()} type="button">
                  Generate response
                </button>
              ) : (
                <button className="secondary-action" onClick={() => void copyText(tokenInput, "token")} type="button">
                  <Copy aria-hidden="true" size={16} /> Copy bundle
                </button>
              )}
              {outputToken ? (
                <>
                  <button className="secondary-action" onClick={() => void copyText(outputToken, "token")} type="button">
                    {copiedValue === "token" ? <Check aria-hidden="true" size={16} /> : <Copy aria-hidden="true" size={16} />}
                    {copiedValue === "token" ? "Copied" : "Copy token"}
                  </button>
                  <button className="secondary-action" onClick={() => void copyText(shareUrl, "url")} type="button">
                    {copiedValue === "url" ? <Check aria-hidden="true" size={16} /> : <LinkSimple aria-hidden="true" size={16} />}
                    {copiedValue === "url" ? "Copied" : "Copy URL"}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </section>

      </main>

      <SkillDrawer onClose={() => setSkillOpen(false)} open={skillOpen} skillText={agentSkill} />
    </div>
  );
}

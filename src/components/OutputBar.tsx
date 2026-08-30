import { BracketsCurly, Check, Copy, LinkSimple } from "@phosphor-icons/react";
import type { CalendarMode } from "./CalendarGrid";
import { BASE_TOKEN_PREFIX, PARTICIPANT_TOKEN_PREFIX } from "../protocol/types";

type CopiedValue = "token" | "url" | null;

type OutputBarProps = {
  baseToken: string;
  busy: boolean;
  copiedValue: CopiedValue;
  error?: string;
  mode: CalendarMode;
  onCopy: (value: string, type: Exclude<CopiedValue, null>) => void;
  onCreateBase: () => void;
  onCreateResponse: () => void;
  participantCount: number;
  participantToken: string;
  shareUrl: string;
  tokenBundle: string;
};

export function OutputBar({
  baseToken,
  busy,
  copiedValue,
  error,
  mode,
  onCopy,
  onCreateBase,
  onCreateResponse,
  participantCount,
  participantToken,
  shareUrl,
  tokenBundle,
}: OutputBarProps) {
  const outputToken = mode === "base" ? baseToken : mode === "respond" ? participantToken : "";

  return (
    <div className="output-bar">
      <div className="output-copy">
        <BracketsCurly aria-hidden="true" size={21} />
        <div>
          <span>{mode === "base" ? "Meeting link" : mode === "respond" ? "Your response" : "Responses being compared"}</span>
          <code>
            {mode === "plan"
              ? `${BASE_TOKEN_PREFIX}... + ${participantCount} ${PARTICIPANT_TOKEN_PREFIX}...`
              : outputToken || "Generate when the allocation is ready"}
          </code>
          {mode === "respond" && participantToken ? (
            <small role="status">Copy the URL and send it back to the organizer.</small>
          ) : mode === "respond" && error ? (
            <small className="output-error" role="status">{error}</small>
          ) : null}
        </div>
      </div>
      <div className="output-actions">
        {mode === "base" ? (
          <button className="primary-action" onClick={onCreateBase} type="button">Create meeting link</button>
        ) : mode === "respond" ? (
          <button className="primary-action" disabled={!baseToken || busy} onClick={onCreateResponse} type="button">
            Generate response
          </button>
        ) : (
          <button className="secondary-action" onClick={() => onCopy(tokenBundle, "token")} type="button">
            <Copy aria-hidden="true" size={16} /> Copy bundle
          </button>
        )}
        {outputToken ? (
          <>
            <button className="secondary-action" onClick={() => onCopy(outputToken, "token")} type="button">
              {copiedValue === "token" ? <Check aria-hidden="true" size={16} /> : <Copy aria-hidden="true" size={16} />}
              {copiedValue === "token" ? "Copied" : "Copy token"}
            </button>
            <button className="secondary-action" onClick={() => onCopy(shareUrl, "url")} type="button">
              {copiedValue === "url" ? <Check aria-hidden="true" size={16} /> : <LinkSimple aria-hidden="true" size={16} />}
              {copiedValue === "url" ? "Copied" : "Copy URL"}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

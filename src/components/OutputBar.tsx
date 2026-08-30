import { BracketsCurly, Check, Copy, LinkSimple } from "@phosphor-icons/react";
import { BASE_TOKEN_PREFIX, PARTICIPANT_TOKEN_PREFIX } from "../protocol/types";
import type { WorkspaceKind } from "../workspace";

type CopiedValue = "token" | "bundle" | "url" | null;

type OutputBarProps = {
  baseToken: string;
  busy: boolean;
  copiedValue: CopiedValue;
  error?: string;
  workspace: WorkspaceKind;
  onCopy: (value: string, type: Exclude<CopiedValue, null>) => void;
  onGenerateBase: () => void;
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
  workspace,
  onCopy,
  onGenerateBase,
  onCreateResponse,
  participantCount,
  participantToken,
  shareUrl,
  tokenBundle,
}: OutputBarProps) {
  const responseReady = workspace === "response" && Boolean(participantToken);

  return (
    <div className="output-bar">
      <div className="output-copy">
        <BracketsCurly aria-hidden="true" size={21} />
        <div>
          <span>{workspace === "organizer" ? "Meeting token" : workspace === "response" ? "Response bundle" : "Responses being compared"}</span>
          <code>
            {workspace === "comparison"
              ? `${BASE_TOKEN_PREFIX}... + ${participantCount} ${PARTICIPANT_TOKEN_PREFIX}...`
              : responseReady
                ? `${BASE_TOKEN_PREFIX}... + ${PARTICIPANT_TOKEN_PREFIX}...`
                : baseToken || "Generate when the allocation is ready"}
          </code>
          {responseReady ? (
            <small role="status">The bundle keeps this response attached to its meeting.</small>
          ) : workspace === "response" && error ? (
            <small className="output-error" role="status">{error}</small>
          ) : null}
        </div>
      </div>
      <div className="output-actions">
        {workspace === "organizer" ? (
          !baseToken
            ? <button className="primary-action" onClick={onGenerateBase} type="button">Generate token</button>
            : null
        ) : workspace === "response" ? (
          !participantToken
            ? <button className="primary-action" disabled={!baseToken || busy} onClick={onCreateResponse} type="button">
                Generate response
              </button>
            : null
        ) : (
          <button className="secondary-action" onClick={() => onCopy(tokenBundle, "bundle")} type="button">
            {copiedValue === "bundle" ? <Check aria-hidden="true" size={16} /> : <Copy aria-hidden="true" size={16} />}
            {copiedValue === "bundle" ? "Copied" : "Copy token bundle"}
          </button>
        )}
        {workspace === "organizer" && baseToken ? (
          <>
            <button className="secondary-action" onClick={() => onCopy(baseToken, "token")} type="button">
              {copiedValue === "token" ? <Check aria-hidden="true" size={16} /> : <Copy aria-hidden="true" size={16} />}
              {copiedValue === "token" ? "Copied" : "Copy token"}
            </button>
            <button className="secondary-action" onClick={() => onCopy(shareUrl, "url")} type="button">
              {copiedValue === "url" ? <Check aria-hidden="true" size={16} /> : <LinkSimple aria-hidden="true" size={16} />}
              {copiedValue === "url" ? "Copied" : "Copy URL"}
            </button>
          </>
        ) : null}
        {responseReady ? (
          <>
            <button className="secondary-action" onClick={() => onCopy(tokenBundle, "bundle")} type="button">
              {copiedValue === "bundle" ? <Check aria-hidden="true" size={16} /> : <Copy aria-hidden="true" size={16} />}
              {copiedValue === "bundle" ? "Copied" : "Copy token bundle"}
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

import { ArrowRight, BracketsCurly } from "@phosphor-icons/react";

type TokenConsoleProps = {
  value: string;
  onChange: (value: string) => void;
  onDecode: () => void;
  notice?: { kind: "success" | "error" | "info"; message: string } | null;
  busy?: boolean;
};

export function TokenConsole({
  value,
  onChange,
  onDecode,
  notice,
  busy = false,
}: TokenConsoleProps) {
  return (
    <section className="token-console" aria-label="Token console">
      <div className="console-label">
        <BracketsCurly aria-hidden="true" size={18} weight="bold" />
        <span>Token console</span>
        <span className="local-note">decoded in this tab</span>
      </div>
      <div className="console-entry">
        <textarea
          aria-label="TimeMesh tokens"
          onChange={(event) => onChange(event.target.value)}
          placeholder={"Paste tm1b_... followed by any tm1p_... tokens"}
          rows={3}
          spellCheck={false}
          value={value}
        />
        <button className="primary-action console-action" disabled={busy} onClick={onDecode} type="button">
          {busy ? "Decoding" : "Open tokens"}
          <ArrowRight aria-hidden="true" size={17} weight="bold" />
        </button>
      </div>
      {notice ? <p className={`console-notice ${notice.kind}`} role="status">{notice.message}</p> : null}
    </section>
  );
}

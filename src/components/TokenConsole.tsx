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
        <span>Tokens</span>
      </div>
      <div className="console-input">
        <textarea
          aria-label="TimeMesh tokens"
          onChange={(event) => onChange(event.target.value)}
          placeholder={"Paste tm2b_... followed by any tm2p_... tokens"}
          rows={1}
          spellCheck={false}
          value={value}
        />
        {notice ? <p className={`console-notice ${notice.kind}`} role="status">{notice.message}</p> : null}
      </div>
      <button className="primary-action console-action" disabled={busy} onClick={onDecode} type="button">
        {busy ? "Decoding" : "Open tokens"}
        <ArrowRight aria-hidden="true" size={15} weight="bold" />
      </button>
    </section>
  );
}

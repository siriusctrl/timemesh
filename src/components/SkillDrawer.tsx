import { Check, Copy, DownloadSimple, X } from "@phosphor-icons/react";
import { useState } from "react";

type SkillDrawerProps = {
  open: boolean;
  onClose: () => void;
  skillText: string;
};

export function SkillDrawer({ open, onClose, skillText }: SkillDrawerProps) {
  const [copied, setCopied] = useState(false);
  if (!open) return null;

  const copySkill = async () => {
    await navigator.clipboard.writeText(skillText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const downloadSkill = () => {
    const url = URL.createObjectURL(new Blob([skillText], { type: "text/markdown" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "SKILL.md";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="drawer-backdrop" onMouseDown={onClose} role="presentation">
      <aside
        aria-label="Agent skill"
        aria-modal="true"
        className="skill-drawer"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header>
          <div>
            <span>Agent-ready workflow</span>
            <h2>Plan time with tokens</h2>
          </div>
          <button aria-label="Close agent skill" className="icon-action" onClick={onClose} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </header>
        <p>Paste this skill into an agent with access to the repository. It turns calendar facts into deterministic CLI inputs, then validates the resulting token.</p>
        <div className="skill-actions">
          <button className="primary-action" onClick={copySkill} type="button">
            {copied ? <Check aria-hidden="true" size={17} /> : <Copy aria-hidden="true" size={17} />}
            {copied ? "Copied" : "Copy skill"}
          </button>
          <button className="secondary-action" onClick={downloadSkill} type="button">
            <DownloadSimple aria-hidden="true" size={17} />
            Download
          </button>
        </div>
        <pre className="skill-preview"><code>{skillText}</code></pre>
      </aside>
    </div>
  );
}

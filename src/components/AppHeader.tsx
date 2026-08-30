import { Moon, Robot, Sun } from "@phosphor-icons/react";
import type { Theme } from "../useTheme";

type AppHeaderProps = {
  followsSystem: boolean;
  onOpenSkill: () => void;
  onToggleTheme: (trigger: HTMLButtonElement) => void;
  theme: Theme;
};

export function AppHeader({ followsSystem, onOpenSkill, onToggleTheme, theme }: AppHeaderProps) {
  const nextTheme = theme === "light" ? "dark" : "light";

  return (
    <header className="site-header">
      <a className="skip-link" href="#schedule-workspace">Skip to schedule</a>
      <div className="header-identity">
        <a className="brand" href={import.meta.env.BASE_URL}>
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
          <span>TimeMesh</span>
        </a>
        <h1 className="header-tagline">Shared time, <em>encoded.</em></h1>
      </div>
      <nav aria-label="Primary">
        <button onClick={onOpenSkill} type="button">
          <Robot aria-hidden="true" size={17} />
          Agent skill
        </button>
        <button
          aria-label={`Switch to ${nextTheme} mode`}
          className="theme-action"
          onClick={(event) => onToggleTheme(event.currentTarget)}
          title={followsSystem
            ? `Following system ${theme} mode. Switch to ${nextTheme} mode`
            : `Switch to ${nextTheme} mode`}
          type="button"
        >
          <span className="theme-action-icon">
            <Moon aria-hidden="true" className="theme-moon" size={16} />
            <Sun aria-hidden="true" className="theme-sun" size={16} />
          </span>
        </button>
      </nav>
    </header>
  );
}

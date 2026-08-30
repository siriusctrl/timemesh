export type RevealTheme = "light" | "dark";

const REVEAL_DURATION = 680;
const REVEAL_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

function commitDocumentTheme(theme: RevealTheme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#24252b" : "#f1f1f3");
}

export function beginThemeReveal(trigger: HTMLButtonElement, nextTheme: RevealTheme): boolean {
  const root = document.documentElement;
  if (
    root.dataset.themeTransition === "active" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    !document.startViewTransition
  ) return false;

  const triggerBounds = trigger.getBoundingClientRect();
  const x = triggerBounds.left + triggerBounds.width / 2;
  const y = triggerBounds.top + triggerBounds.height / 2;
  const startRadius = Math.max(triggerBounds.width, triggerBounds.height) / 2;
  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );

  root.style.setProperty("--theme-reveal-x", `${x}px`);
  root.style.setProperty("--theme-reveal-y", `${y}px`);
  root.style.setProperty("--theme-reveal-start-radius", `${startRadius}px`);
  root.style.setProperty("--theme-reveal-end-radius", `${endRadius}px`);
  root.dataset.themeTransition = "active";
  root.dataset.themeCommit = "active";

  let transition: ViewTransition;
  try {
    transition = document.startViewTransition(() => commitDocumentTheme(nextTheme));
  } catch {
    delete root.dataset.themeTransition;
    delete root.dataset.themeCommit;
    return false;
  }

  void transition.ready.then(() => {
    const animation = root.animate(
      {
        clipPath: [
          `circle(${startRadius}px at ${x}px ${y}px)`,
          `circle(${endRadius}px at ${x}px ${y}px)`,
        ],
      },
      {
        duration: REVEAL_DURATION,
        easing: REVEAL_EASING,
        fill: "both",
        pseudoElement: "::view-transition-new(root)",
      },
    );
    animation.id = "theme-reveal";
  }).catch(() => {
    // The theme is already committed; the reveal is progressive enhancement.
  });

  void transition.finished.finally(() => {
    delete root.dataset.themeTransition;
    delete root.dataset.themeCommit;
    root.style.removeProperty("--theme-reveal-x");
    root.style.removeProperty("--theme-reveal-y");
    root.style.removeProperty("--theme-reveal-start-radius");
    root.style.removeProperty("--theme-reveal-end-radius");
  });
  return true;
}

export type RevealTheme = "light" | "dark";

const REVEAL_DURATION = 920;
const REVEAL_KEYFRAME_COUNT = 121;
const REVEAL_CURVE = [
  { offset: 0, radius: 0 },
  { offset: 0.16, radius: 0.025 },
  { offset: 0.38, radius: 0.1 },
  { offset: 0.62, radius: 0.31 },
  { offset: 0.82, radius: 0.65 },
  { offset: 1, radius: 1 },
];
let revealSequence = 0;

function copyLiveState(source: HTMLElement, clone: HTMLElement) {
  if (source instanceof HTMLInputElement && clone instanceof HTMLInputElement) {
    clone.value = source.value;
    clone.checked = source.checked;
  } else if (source instanceof HTMLTextAreaElement && clone instanceof HTMLTextAreaElement) {
    clone.value = source.value;
  } else if (source instanceof HTMLSelectElement && clone instanceof HTMLSelectElement) {
    clone.value = source.value;
  }
  clone.scrollTop = source.scrollTop;
  clone.scrollLeft = source.scrollLeft;
}

function revealKeyframes(startRadius: number, endRadius: number) {
  return Array.from({ length: REVEAL_KEYFRAME_COUNT }, (_, frame) => {
    const offset = frame / (REVEAL_KEYFRAME_COUNT - 1);
    const upperIndex = REVEAL_CURVE.findIndex((point) => point.offset >= offset);
    const upper = REVEAL_CURVE[Math.max(upperIndex, 1)];
    const lower = REVEAL_CURVE[Math.max(upperIndex - 1, 0)];
    const segmentProgress = (offset - lower.offset) / (upper.offset - lower.offset);
    const radiusRatio = lower.radius + (upper.radius - lower.radius) * segmentProgress;
    return {
      r: `${Math.max(startRadius, endRadius * radiusRatio)}px`,
      offset,
    };
  });
}

function commitDocumentTheme(theme: RevealTheme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#24252b" : "#f1f1f3");
}

export function beginThemeReveal(trigger: HTMLButtonElement, nextTheme: RevealTheme): boolean {
  const root = document.documentElement;
  if (root.dataset.themeTransition === "active"
    || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;

  const sourceSurface = document.querySelector<HTMLElement>(".app-shell");
  if (!sourceSurface) return false;

  const rootZoom = Number.parseFloat(getComputedStyle(root).getPropertyValue("zoom")) || 1;
  const documentWidth = Math.max(root.scrollWidth / rootZoom, document.body.scrollWidth, root.clientWidth / rootZoom);
  const documentHeight = Math.max(root.scrollHeight / rootZoom, document.body.scrollHeight, root.clientHeight / rootZoom);
  const layer = document.createElement("div");
  const clone = sourceSurface.cloneNode(true) as HTMLElement;
  const sourceElements = [sourceSurface, ...sourceSurface.querySelectorAll("*")]
    .filter((element): element is HTMLElement => element instanceof HTMLElement);
  const cloneElements = [clone, ...clone.querySelectorAll("*")]
    .filter((element): element is HTMLElement => element instanceof HTMLElement);
  const pairBySource = new WeakMap<HTMLElement, HTMLElement>();

  layer.className = "theme-render-layer";
  layer.dataset.themeRenderLayer = "";
  layer.dataset.themeReveal = "";
  layer.dataset.theme = nextTheme;
  layer.setAttribute("aria-hidden", "true");
  layer.inert = true;
  layer.style.setProperty("--theme-render-width", `${documentWidth}px`);
  layer.style.setProperty("--theme-render-height", `${documentHeight}px`);
  clone.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));

  sourceElements.forEach((source, index) => {
    const cloneElement = cloneElements[index];
    if (!cloneElement) return;
    pairBySource.set(source, cloneElement);
    copyLiveState(source, cloneElement);
  });

  layer.append(clone);
  document.body.append(layer);
  layer.style.setProperty("--theme-render-height", `${Math.max(documentHeight, layer.scrollHeight)}px`);
  sourceElements.forEach((source) => {
    const cloneElement = pairBySource.get(source);
    if (cloneElement) copyLiveState(source, cloneElement);
  });

  const triggerBounds = trigger.getBoundingClientRect();
  const layerBounds = layer.getBoundingClientRect();
  const scaleX = layerBounds.width / layer.offsetWidth || 1;
  const scaleY = layerBounds.height / layer.offsetHeight || scaleX;
  const visualX = triggerBounds.left + triggerBounds.width / 2;
  const visualY = triggerBounds.top + triggerBounds.height / 2;
  const x = (visualX - layerBounds.left) / scaleX;
  const y = (visualY - layerBounds.top) / scaleY;
  const startRadius = Math.max(triggerBounds.width / scaleX, triggerBounds.height / scaleY) / 2;
  const visualRadius = Math.hypot(
    Math.max(visualX, root.clientWidth - visualX),
    Math.max(visualY, root.clientHeight - visualY),
  );
  const endRadius = visualRadius / Math.min(scaleX, scaleY);
  layer.style.setProperty("--theme-reveal-x", `${x}px`);
  layer.style.setProperty("--theme-reveal-y", `${y}px`);
  layer.style.setProperty("--theme-reveal-start-radius", `${startRadius}px`);
  layer.style.setProperty("--theme-reveal-end-radius", `${endRadius}px`);

  const svgNamespace = "http://www.w3.org/2000/svg";
  const definitions = document.createElementNS(svgNamespace, "svg");
  const definitionGroup = document.createElementNS(svgNamespace, "defs");
  const clip = document.createElementNS(svgNamespace, "clipPath");
  const circle = document.createElementNS(svgNamespace, "circle");
  const clipId = `timemesh-theme-reveal-${revealSequence += 1}`;
  definitions.classList.add("theme-reveal-defs");
  definitions.setAttribute("aria-hidden", "true");
  clip.id = clipId;
  clip.dataset.themeRevealClip = "";
  clip.setAttribute("clipPathUnits", "userSpaceOnUse");
  circle.dataset.themeRevealCircle = "";
  circle.setAttribute("cx", `${x}`);
  circle.setAttribute("cy", `${y}`);
  circle.setAttribute("r", `${startRadius}`);
  clip.append(circle);
  definitionGroup.append(clip);
  definitions.append(definitionGroup);
  layer.prepend(definitions);
  layer.style.clipPath = `url(#${clipId})`;

  let animation: Animation;
  try {
    animation = circle.animate(
      revealKeyframes(startRadius, endRadius),
      { duration: REVEAL_DURATION, easing: "linear", fill: "both" },
    );
  } catch {
    layer.remove();
    return false;
  }

  animation.id = "theme-reveal";
  root.dataset.themeTransition = "active";
  const initialScrollX = window.scrollX;
  const initialScrollY = window.scrollY;
  let lastScrollX = initialScrollX;
  let lastScrollY = initialScrollY;

  const syncWindowScroll = () => {
    if (window.scrollX === lastScrollX && window.scrollY === lastScrollY) return;
    lastScrollX = window.scrollX;
    lastScrollY = window.scrollY;
    const centerX = x + (lastScrollX - initialScrollX) / scaleX;
    const centerY = y + (lastScrollY - initialScrollY) / scaleY;
    layer.style.setProperty("--theme-reveal-x", `${centerX}px`);
    layer.style.setProperty("--theme-reveal-y", `${centerY}px`);
    circle.setAttribute("cx", `${centerX}`);
    circle.setAttribute("cy", `${centerY}`);
  };
  const syncNestedScroll = (event: Event) => {
    if (!(event.target instanceof HTMLElement)) return;
    const cloneElement = pairBySource.get(event.target);
    if (!cloneElement) return;
    cloneElement.scrollTop = event.target.scrollTop;
    cloneElement.scrollLeft = event.target.scrollLeft;
  };
  window.addEventListener("scroll", syncWindowScroll, { passive: true });
  document.addEventListener("scroll", syncNestedScroll, true);

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    window.removeEventListener("scroll", syncWindowScroll);
    document.removeEventListener("scroll", syncNestedScroll, true);
    root.dataset.themeCommit = "active";
    commitDocumentTheme(nextTheme);
    window.removeEventListener("pagehide", finish);
    requestAnimationFrame(() => {
      layer.remove();
      delete root.dataset.themeTransition;
      requestAnimationFrame(() => {
        delete root.dataset.themeCommit;
      });
    });
  };
  animation.addEventListener("finish", finish, { once: true });
  animation.addEventListener("cancel", finish, { once: true });
  window.addEventListener("pagehide", finish, { once: true });
  return true;
}

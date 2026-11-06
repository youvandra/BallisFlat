/**
 * Motion tokens and safe primitives. Copy to apps/web/src/lib/motion.ts.
 *
 * Wrap the app once:
 *   <LazyMotion features={domAnimation} strict>
 *     <MotionConfig reducedMotion="user" transition={transitions.base}>
 *       <App />
 *     </MotionConfig>
 *   </LazyMotion>
 * and call installMotionFailsafe() in main.tsx. Use `m.div` from "motion/react-m",
 * never `motion.div` (strict mode throws on it, keeping the bundle at ~5 kb).
 */
import type { Transition } from "motion/react";

// Same curves as tokens.css; Material 3 emphasized accelerate for exits.
export const ease = {
  out: [0.16, 1, 0.3, 1],
  inOut: [0.65, 0, 0.35, 1],
  exit: [0.3, 0, 0.8, 0.15],
} as const;

export const durationS = {
  instant: 0.1,
  fast: 0.15,
  base: 0.2,
  slow: 0.3,
} as const;

export const transitions = {
  fast: { duration: durationS.fast, ease: ease.out },
  base: { duration: durationS.base, ease: ease.out },
  slow: { duration: durationS.slow, ease: ease.out },
  move: { duration: durationS.slow, ease: ease.inOut },
  // Exits run at ~70% of the entry.
  exit: { duration: durationS.base * 0.7, ease: ease.exit },
  // UI default spring: duration-based, no overshoot (Motion docs: visualDuration + bounce).
  spring: { type: "spring", visualDuration: 0.3, bounce: 0 },
  // Drags and throws: physics spring so the gesture's velocity carries into the motion.
  drag: { type: "spring", stiffness: 400, damping: 32 },
} satisfies Record<string, Transition>;

// Enter from slightly small, never from scale(0).
export const popIn = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, transition: transitions.base },
  exit: { opacity: 0, scale: 0.98, transition: transitions.exit },
} as const;

export const pressScale = { whileTap: { scale: 0.97 } } as const;

/**
 * Whether an entrance animation may run at all. A hidden tab gets no animation
 * frames, so content that starts at opacity 0 there would stay blank.
 */
export function canAnimate(): boolean {
  if (typeof document === "undefined") return false;
  if (document.visibilityState !== "visible") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** After 1.6 s every [data-reveal] element is forced visible by tokens.css. */
export function installMotionFailsafe(delayMs = 1600): void {
  window.setTimeout(() => {
    document.documentElement.classList.add("motion-failsafe");
  }, delayMs);
}

/**
 * Props for a one-time entrance. Spread onto an `m.*` element that also carries
 * `data-reveal`. Returns no initial state when animating is unsafe, so the element
 * renders in its final state.
 */
export function revealProps(delayS = 0) {
  if (!canAnimate()) return {};
  return {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0, transition: { ...transitions.slow, delay: delayS } },
  };
}

/** Restore scroll on route change before paint, without animation. */
export function resetScroll(): void {
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
}

if (typeof window !== "undefined" && "scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}

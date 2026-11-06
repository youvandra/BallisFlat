import { useEffect, useState } from "react";

const lines = ["Shuffling the deck", "Sealing packs", "Checking the pitch", "Counting the pot"] as const;

type Props = {
  /** "screen" fills the page (first paint, route loads); "inline" sits inside a zone while data loads. */
  size?: "screen" | "inline";
  label?: string;
};

/**
 * The loader: a sealed foil pack that shakes, tears along the top and lets a card rise, on a loop, with a
 * short line that changes underneath. Pure CSS motion over content that is already drawn, so nothing waits
 * on it; reduced motion shows the still pack and the first line.
 */
export function PackLoader({ size = "inline", label }: Props) {
  const [line, setLine] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setLine((value) => (value + 1) % lines.length), 1400);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div
      className={`pack-loader ${size === "screen" ? "pack-loader-screen" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="pack-loader-rig" aria-hidden>
        <div className="pack-loader-card" />
        <div className="pack-loader-pack">
          <span className="pack-loader-strip" />
          <span className="pack-loader-mark">BIF</span>
        </div>
      </div>
      <p className="t-small text-ink">{label ?? `${lines[line]}…`}</p>
    </div>
  );
}

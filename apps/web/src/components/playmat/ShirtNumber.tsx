import { useEffect, useState } from "react";

const font = '800 100px "Unbounded"';
// Riso misregistration: cyan nudged up-left, pink down-right, by the same amount, so the pair stays centred.
const offset = 3.5;

interface Ink {
  left: number;
  right: number;
  ascent: number;
  descent: number;
}

/** Unbounded's digits sit on the baseline and reach 0.75em (round ones overshoot a little). */
function estimate(text: string): Ink {
  return { left: 2, right: text.length * 70 - 6, ascent: 75, descent: 0 };
}

const cache = new Map<string, Ink>();

/** The ink box of the glyphs, so the number is centred on what you see (a "1" has a flag on its left). */
function measure(text: string): Ink | null {
  const hit = cache.get(text);
  if (hit) return hit;
  if (typeof document === "undefined" || !document.fonts.check(font)) return null;
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return null;
  context.font = font;
  const metrics = context.measureText(text);
  const ink = {
    left: -metrics.actualBoundingBoxLeft,
    right: metrics.actualBoundingBoxRight,
    ascent: metrics.actualBoundingBoxAscent,
    descent: metrics.actualBoundingBoxDescent,
  };
  cache.set(text, ink);
  return ink;
}

/**
 * A shirt number printed twice, cyan under pink and off register, centred optically: the SVG's viewBox is
 * the glyphs' measured ink box, so the box centres the ink itself rather than the font's advance and line box.
 */
export function ShirtNumber({ value, className = "" }: { value: number; className?: string }) {
  const text = String(value);
  const [ink, setInk] = useState<Ink>(() => measure(text) ?? estimate(text));

  useEffect(() => {
    let live = true;
    const exact = measure(text);
    if (exact) setInk(exact);
    else
      document.fonts
        .load(font, text)
        .then(() => {
          const loaded = measure(text);
          if (live && loaded) setInk(loaded);
        })
        .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [text]);

  const pad = offset + 1;
  const x = ink.left - pad;
  const y = -ink.ascent - pad;
  const width = ink.right - ink.left + pad * 2;
  const height = ink.ascent + ink.descent + pad * 2;
  return (
    <svg
      viewBox={`${x} ${y} ${width} ${height}`}
      className={`shirt-number ${className}`}
      aria-hidden
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
    >
      <text x={-offset} y={-offset} className="shirt-number-cyan">
        {text}
      </text>
      <text x={offset} y={offset} className="shirt-number-pink">
        {text}
      </text>
    </svg>
  );
}

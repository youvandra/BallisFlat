import { useEffect, useRef, useState } from "react";
import { canAnimate } from "../../lib/motion";

type Props = { value: number; format: (value: number) => string; durationMs?: number };

/**
 * Counts from the previous value to the new one. Shows the final value whenever frames do not
 * run (hidden tab, reduced motion): a timeout lands it even if requestAnimationFrame never fires.
 */
export function CountUp({ value, format, durationMs = 900 }: Props) {
  const previous = useRef(value);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (from === value || !canAnimate()) {
      setShown(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (time: number) => {
      const progress = Math.min(1, (time - start) / durationMs);
      const eased = 1 - (1 - progress) ** 3;
      setShown(from + (value - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const landing = window.setTimeout(() => setShown(value), durationMs + 150);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(landing);
    };
  }, [value, durationMs]);

  return <span className="num">{format(shown)}</span>;
}

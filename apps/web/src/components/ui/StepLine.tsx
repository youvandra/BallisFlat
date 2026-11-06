import { Check } from "lucide-react";
import type { MintStep } from "../../lib/game/types";

const stepLabels: Record<MintStep, string> = { approve: "Approve $WIF", mint: "Mint Card", buy: "Buy Card" };

/** The two-step progress line (approve, then mint or buy), one row per wallet signature. */
export function StepLine({ steps, current }: { steps: MintStep[]; current: MintStep | null }) {
  return (
    <ol className="flex flex-col gap-1.5" aria-label="Progress">
      {steps.map((step, index) => {
        const done = current !== null && steps.indexOf(current) > index;
        const active = current === step;
        return (
          <li
            key={step}
            className={`t-body-strong flex items-center gap-2 ${active ? "text-ink" : done ? "text-cyan" : "text-graphite"}`}
          >
            <span className="num t-small grid size-6 place-items-center rounded-pill bg-card text-current">
              {done ? <Check size={12} aria-hidden /> : index + 1}
            </span>
            {/* The circle already numbers the step, so the label is the action alone. */}
            <span>
              {stepLabels[step]}
              {active ? "…" : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

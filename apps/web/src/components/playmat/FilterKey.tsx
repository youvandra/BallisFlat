import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

export interface FilterOption<K extends string> {
  key: K;
  label: string;
  /** Swatch class (bg-pink, bg-cyan, bg-note, …): the same legend chip on every page. */
  chip: string;
  count: number;
  /** Count wording, e.g. ["match", "matches"]; a bare number when left out. */
  noun?: readonly [string, string];
}

type Props<K extends string> = {
  options: readonly FilterOption<K>[];
  value: K;
  onChange: (key: K) => void;
  /** What the options filter, e.g. "Show cards from". */
  label: string;
  /** data-testid prefix: the trigger is `${testId}`, each option `${testId}-${key}`. */
  testId: string;
};

function countText(option: FilterOption<string>) {
  if (!option.noun) return String(option.count);
  return `${option.count} ${option.count === 1 ? option.noun[0] : option.noun[1]}`;
}

/**
 * The page's filter key (Board on Matches, Binder on Binder): a list of swatch rows on tablet and desktop,
 * and on a phone one row showing the current choice that drops the list down. Same rows, same behaviour.
 */
export function FilterKey<K extends string>({ options, value, onChange, label, testId }: Props<K>) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = options.find((option) => option.key === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === "Escape"
          : !root.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={root} className="filter-key" data-open={open}>
      {current ? (
        <button
          type="button"
          className="filter-key-trigger"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={`${label}: ${current.label}`}
          onClick={() => setOpen((value) => !value)}
          data-testid={testId}
        >
          <span className={`swatch ${current.chip}`} aria-hidden />
          <span className="t-body-strong flex-1 text-left">{current.label}</span>
          <span className="t-small num whitespace-nowrap">{countText(current)}</span>
          <ChevronDown size={16} strokeWidth={2} aria-hidden className="filter-key-chevron" />
        </button>
      ) : null}
      <ul id={listId} className="filter-key-list" aria-label={label}>
        {options.map((option) => {
          const active = option.key === value;
          return (
            <li key={option.key}>
              <button
                type="button"
                onClick={() => {
                  onChange(option.key);
                  setOpen(false);
                }}
                aria-pressed={active}
                data-testid={`${testId}-${option.key}`}
                className={`filter-key-option ${active ? "" : "opacity-60"}`}
              >
                <span className={`swatch ${option.chip}`} aria-hidden />
                <span className="flex flex-1 items-baseline justify-between gap-2">
                  <span className="t-body-strong">{option.label}</span>
                  <span className="t-small num whitespace-nowrap">{countText(option)}</span>
                </span>
                <Check size={14} strokeWidth={2.25} aria-hidden className="filter-key-check" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

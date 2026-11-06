type Option<T extends string> = { key: T; label: string };

type Props<T extends string> = {
  label: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (key: T) => void;
  /** "tabs" announces a tab list (aria-selected); "toggle" a group of pressed buttons. */
  kind?: "tabs" | "toggle";
  /** Stretch the items across the container (a narrow side column). */
  fill?: boolean;
  className?: string;
};

/**
 * Every tab row, filter and sort in the app, drawn as the Framer Dock (j2DqtmR34): Mat container with a
 * 1.5px cyan border and pink hard print, Body Strong items, the active one filled Pink with white text.
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  kind = "toggle",
  fill = false,
  className = "",
}: Props<T>) {
  const classes = `seg ${fill ? "seg-fill" : ""} ${className}`;
  if (kind === "tabs") {
    return (
      <div role="tablist" aria-label={label} className={classes}>
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={option.key === value}
            onClick={() => onChange(option.key)}
            className="seg-item"
          >
            {option.label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <fieldset aria-label={label} className={classes}>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          aria-pressed={option.key === value}
          onClick={() => onChange(option.key)}
          className="seg-item"
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}

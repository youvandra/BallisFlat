type Option<T extends string> = { key: T; label: string };

type Props<T extends string> = {
  label: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (key: T) => void;
  className?: string;
};

/**
 * A filter row, not a navbar: small quiet chips (no heavy border, no hard print) with a Pink fill on the
 * active one. Used where the Dock-style Segmented would read as navigation — squad side, sort, period.
 */
export function Chips<T extends string>({ label, options, value, onChange, className = "" }: Props<T>) {
  return (
    <fieldset aria-label={label} className={`chips ${className}`}>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          aria-pressed={option.key === value}
          onClick={() => onChange(option.key)}
          className="chip"
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}

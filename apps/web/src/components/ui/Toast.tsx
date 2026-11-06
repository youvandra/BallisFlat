import { X } from "lucide-react";
import { type ReactNode, useEffect } from "react";

/** A short confirmation that floats above the dock and leaves by itself after a few seconds. */
export function Toast({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 7000);
    return () => window.clearTimeout(timer);
  }, [onClose]);
  return (
    <div className="toast" role="status">
      <div className="t-small flex-1 text-ink">{children}</div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        title="Dismiss"
        className="icon-button size-8"
      >
        <X size={15} aria-hidden />
      </button>
    </div>
  );
}

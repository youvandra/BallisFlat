import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";

type Props = { open: boolean; onClose: () => void; title: string; children: ReactNode };

/**
 * The confirm drawer, styled like the landing's Contact Drawer: card fill, 24px corners, 8px cyan offset
 * shadow, sliding in from the right (from the bottom on phone). Built on <dialog> so focus is trapped,
 * Escape closes it and focus returns to the trigger.
 */
export function Sheet({ open, onClose, title, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // The page behind stays put while the drawer is open (the dialog's top layer already covers the dock).
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={() => undefined}
      className="drawer-dialog m-0 mt-auto max-h-dvh w-full max-w-none overflow-visible bg-transparent p-3 pb-4 text-ink tab:my-auto tab:mr-10 tab:ml-auto tab:w-120 tab:p-0"
    >
      <div className="drawer drawer-scroll relative">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          title="Close"
          className="icon-button absolute top-3 right-3"
        >
          <X size={18} aria-hidden />
        </button>
        {open ? children : null}
      </div>
    </dialog>
  );
}

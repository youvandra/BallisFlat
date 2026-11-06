import { useSyncExternalStore } from "react";

// The Framer phone breakpoint (< 810px), for props that cannot take a media query.
const query = "(max-width: 809.98px)";

function subscribe(onChange: () => void) {
  const list = window.matchMedia(query);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

export function usePhone(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

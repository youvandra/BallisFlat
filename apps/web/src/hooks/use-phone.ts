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

// The Framer tablet breakpoint (810-1199px), where a page's third column steps aside.
const tabletQuery = "(min-width: 810px) and (max-width: 1199.98px)";

function subscribeTablet(onChange: () => void) {
  const list = window.matchMedia(tabletQuery);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

export function useTablet(): boolean {
  return useSyncExternalStore(
    subscribeTablet,
    () => window.matchMedia(tabletQuery).matches,
    () => false,
  );
}

// The sound preference the landing's Pack Rip remembers. The masthead toggle writes it, and every pack on
// the page follows it.
import { useSyncExternalStore } from "react";

/** The localStorage key PackRip.tsx reads ("1" on, "0" off). */
export const soundKey = "nv-playmat-sound";
/** Fired on window when the preference changes in this tab; PackRip.tsx listens for it. */
export const soundEvent = "nv-playmat-sound";

function read(): boolean {
  try {
    return localStorage.getItem(soundKey) !== "0";
  } catch {
    return true;
  }
}

export function setSound(on: boolean): void {
  try {
    localStorage.setItem(soundKey, on ? "1" : "0");
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
  window.dispatchEvent(new Event(soundEvent));
}

function subscribe(onChange: () => void) {
  window.addEventListener(soundEvent, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(soundEvent, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useSound(): boolean {
  return useSyncExternalStore(subscribe, read, () => true);
}

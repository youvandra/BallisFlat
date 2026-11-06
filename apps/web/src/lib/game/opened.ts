// Remembers which packs were torn, per token id, so a reload shows the card already out. A card that has
// been opened never shows sealed again anywhere; a minted card stays sealed until it is opened.
import { useMemo, useSyncExternalStore } from "react";

const key = "ball-is-flat.opened";
const event = "ball-is-flat:opened";

function read(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    // Unreadable storage counts as nothing opened yet.
    return [];
  }
}

export function isOpened(tokenId: bigint | string): boolean {
  return read().includes(String(tokenId));
}

export function markOpened(tokenId: bigint | string): void {
  const id = String(tokenId);
  const opened = read();
  if (opened.includes(id)) return;
  localStorage.setItem(key, JSON.stringify([...opened, id]));
  window.dispatchEvent(new Event(event));
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === key || e.key === null) onChange();
  };
  window.addEventListener(event, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(event, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Whether a token's pack has been torn; re-renders when any pack is opened, in this tab or another. */
export function useOpened(tokenId: bigint | string | null | undefined): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (tokenId == null ? false : isOpened(tokenId)),
    () => false,
  );
}

/** Every opened token id; re-renders when any pack is opened. */
export function useOpenedSet(): ReadonlySet<string> {
  const raw = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(key) ?? "[]",
    () => "[]",
  );
  return useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(raw);
      return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
    } catch {
      return new Set<string>();
    }
  }, [raw]);
}

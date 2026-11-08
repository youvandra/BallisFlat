import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useLocation, useNavigation } from "react-router";
import { PackLoader } from "./PackLoader";

/** How often the page is checked, and how many calm checks in a row count as loaded. */
const TICK_MS = 100;
const CALM_TICKS = 3;
/** Images or fonts that take less than this after a route change never show the veil. */
const SHOW_AFTER_MS = 180;
/** Never hold a page longer than this: a stuck request or image must not keep the page hidden. */
const MAX_HOLD_MS = 10_000;

/**
 * Covers the whole screen (dark, blurred) with the pack loader in the middle, so a page appears at once
 * when it is ready instead of piece by piece.
 */
export function LoadingVeil({ visible = true }: { visible?: boolean }) {
  return (
    <div className={`loading-veil ${visible ? "" : "loading-veil-done"}`} aria-hidden={!visible}>
      {visible ? <PackLoader label="Loading…" /> : null}
    </div>
  );
}

/** True while a query has never answered yet (a first load, not a background refresh). */
function firstLoadsInFlight(client: ReturnType<typeof useQueryClient>): boolean {
  return client
    .getQueryCache()
    .findAll({ fetchStatus: "fetching" })
    .some((query) => query.state.dataUpdatedAt === 0 && query.state.errorUpdatedAt === 0);
}

/** True while an eager image in the page has not finished (loaded or failed). Lazy images do not count. */
function imagesPending(): boolean {
  const images = document.querySelectorAll<HTMLImageElement>("#main img, header img");
  for (const image of images) {
    if (image.loading === "lazy") continue;
    if (!image.complete) return true;
  }
  return false;
}

/**
 * Decides when the veil covers the page. The first paint always waits for everything. After that a route
 * change only brings the veil back when the new page really waits (its code, first data or images are not
 * cached yet) for longer than SHOW_AFTER_MS; a page already in cache appears at once. Checked with a timer,
 * never animation frames, which stop in hidden tabs.
 */
export function usePageReady(): boolean {
  const client = useQueryClient();
  const navigation = useNavigation();
  const { pathname } = useLocation();
  const [veiled, setVeiled] = useState(true);
  const navigating = navigation.state !== "idle";

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new path or navigation starts a new check
  useEffect(() => {
    let calm = 0;
    let busySince: number | null = null;
    const started = Date.now();
    let timer = 0;
    const check = () => {
      // Code or first data still missing: the page would show half drawn, so veil at once.
      const waiting = navigating || firstLoadsInFlight(client);
      // Images and fonts are usually in the browser cache: only veil if they are slow.
      const fontsIn = !document.fonts || document.fonts.status === "loaded";
      const settling = imagesPending() || !fontsIn;
      const now = Date.now();
      if (waiting || settling) {
        calm = 0;
        busySince ??= now;
        if (waiting || now - busySince >= SHOW_AFTER_MS) setVeiled(true);
      } else {
        busySince = null;
        calm += 1;
      }
      if (calm >= CALM_TICKS || now - started > MAX_HOLD_MS) {
        window.clearInterval(timer);
        setVeiled(false);
      }
    };
    // Child pages subscribe their queries before this effect runs, so the first check sees them.
    check();
    timer = window.setInterval(check, TICK_MS);
    return () => window.clearInterval(timer);
  }, [client, pathname, navigating]);

  return !veiled;
}

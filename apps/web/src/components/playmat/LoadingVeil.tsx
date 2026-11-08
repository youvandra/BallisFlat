import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useLocation, useNavigation } from "react-router";
import { PackLoader } from "./PackLoader";

/** How often the page is checked, and how many calm checks in a row count as loaded. */
const TICK_MS = 100;
const CALM_TICKS = 3;
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
 * Holds the veil on every route until the route's code, its first data, its eager images and the fonts are
 * all in, checked with a timer (never animation frames, which stop in hidden tabs).
 */
export function usePageReady(): boolean {
  const client = useQueryClient();
  const navigation = useNavigation();
  const { pathname } = useLocation();
  const [ready, setReady] = useState(false);
  const navigating = navigation.state !== "idle";

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new path starts a new wait
  useEffect(() => {
    setReady(false);
  }, [pathname]);

  useEffect(() => {
    if (ready || navigating) return;
    let calm = 0;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const fontsIn = !document.fonts || document.fonts.status === "loaded";
      const busy = firstLoadsInFlight(client) || imagesPending() || !fontsIn;
      calm = busy ? 0 : calm + 1;
      if (calm >= CALM_TICKS || Date.now() - started > MAX_HOLD_MS) {
        window.clearInterval(timer);
        setReady(true);
      }
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [client, ready, navigating]);

  return ready && !navigating;
}

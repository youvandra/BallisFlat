import { useEffect, useLayoutEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { ConnectionGuard } from "../../app/ConnectionGuard";
import { prefetchPages } from "../../app/prefetch";
import { ConnectPromptProvider } from "../../features/connect/ConnectPrompt";
import { useWallet } from "../../hooks/use-wallet";
import { reportSeen } from "../../lib/game/stats";
import { resetScroll } from "../../lib/motion";
import { palette } from "../../lib/palette";
import { Dock, LaunchDock } from "./Dock";
import { HandCursor } from "./framer-shell";
import { LoadingVeil, usePageReady } from "./LoadingVeil";
import { Masthead } from "./Masthead";
import { RisoBackdrop } from "./RisoBackdrop";

interface PageMeta {
  overprint: string;
  folio: string;
  backdrop: "default" | "quiet";
}

/** The landing gives every page its own overprint word and folio line (Playmat Layout variables). */
function metaFor(pathname: string): PageMeta {
  if (pathname === "/")
    return { overprint: "BIF-26", folio: "Rulebook, page 1. Kickoff.", backdrop: "default" };
  if (pathname === "/matches")
    return { overprint: "MATCHES", folio: "Rulebook, page 2. The fixtures.", backdrop: "quiet" };
  if (/^\/m\/[^/]+\/open\//.test(pathname))
    return { overprint: "PACK", folio: "Rulebook, page 3. Your pack.", backdrop: "quiet" };
  if (pathname.startsWith("/m/"))
    return { overprint: "MATCH", folio: "Rulebook, page 3. Match card.", backdrop: "quiet" };
  if (pathname === "/hunt")
    return { overprint: "WANTED", folio: "Rulebook, page 2. The hunt.", backdrop: "quiet" };
  if (pathname === "/binder")
    return { overprint: "PICKS", folio: "Rulebook, page 2. Your binder.", backdrop: "quiet" };
  if (pathname === "/rules")
    return { overprint: "RULES", folio: "Rulebook, page 4. House rules.", backdrop: "quiet" };
  if (pathname === "/leaderboard")
    return { overprint: "TABLE", folio: "Rulebook, page 5. The table.", backdrop: "quiet" };
  if (pathname === "/stats")
    return { overprint: "STATS", folio: "Rulebook, page 6. The numbers.", backdrop: "quiet" };
  if (pathname === "/ops") return { overprint: "OPS", folio: "Rulebook, back office.", backdrop: "quiet" };
  return { overprint: "404", folio: "Rulebook, missing page.", backdrop: "quiet" };
}

/**
 * The Playmat Layout template (Framer RUX6SQRfT): the Riso Backdrop behind everything, the Masthead bar
 * on top, the page's playmat in the Screen, the Dock fixed at the bottom and the riso hand cursor.
 */
export function AppShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const meta = metaFor(pathname);
  const ink = palette();
  // The landing stands alone with its Launch App bar; the app pages carry the wallet control and the dock,
  // with or without a wallet connected.
  const variant = pathname === "/" ? "landing" : "app";
  // Every page waits behind the veil until its code, first data, images and fonts are in.
  const ready = usePageReady();
  // Once the first page is up, fetch the other pages' code in the background.
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(prefetchPages, 300);
    return () => window.clearTimeout(timer);
  }, [ready]);

  // A connected wallet counts once per session toward "Wallets connected" on /stats.
  const { account } = useWallet();
  const connected = account.data?.address;
  useEffect(() => {
    if (connected) reportSeen(connected);
  }, [connected]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the scroll resets on every route change
  useLayoutEffect(() => {
    resetScroll();
  }, [pathname]);

  // The Framer components link with plain <a href>; keep those inside the app instead of reloading.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a");
      const href = anchor?.getAttribute("href");
      if (!anchor || !href || anchor.target || !href.startsWith("/") || href.startsWith("//")) return;
      event.preventDefault();
      navigate(href);
    };
    // Capture phase: some Framer links stop propagation in their own click handlers.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [navigate]);

  return (
    <ConnectPromptProvider>
      <div className="relative min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-input focus:bg-note focus:px-3 focus:py-2 focus:text-on-ink"
        >
          Skip to Content
        </a>
        <RisoBackdrop overprint={meta.overprint} folio={meta.folio} variant={meta.backdrop} />
        <Masthead variant={variant} />
        <main id="main" className="screen">
          <Outlet />
        </main>
        {variant === "landing" ? <LaunchDock /> : <Dock />}
        <LoadingVeil visible={!ready} />
        <ConnectionGuard />
        <HandCursor
          variant="Riso"
          size={34}
          line={ink.mat}
          fill={ink.ink}
          misprint={ink.pink}
          grab={ink.cyan}
        />
      </div>
    </ConnectPromptProvider>
  );
}

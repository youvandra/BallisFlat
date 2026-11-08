import type { ReactNode } from "react";
import { palette } from "../../lib/palette";
import { buttonStyles } from "../ui/button-styles";
import { MissingCard } from "./framer-shell";

export type StatusKind = "offline" | "rpc" | "api" | "update" | "crash" | "missing" | "boot";

type Copy = { code: string; label: string; hint: string; title: string; line: string };

/** One card, one heading and one plain line per failure; the actions are passed in. */
export const statusCopy: Record<StatusKind, Copy> = {
  offline: {
    code: "OFF",
    label: "No Signal",
    hint: "Offline",
    title: "You are offline",
    line: "Check your Wi-Fi or mobile data. The page comes back by itself once you are online.",
  },
  rpc: {
    code: "RPC",
    label: "No Chain",
    hint: "Can't reach it",
    title: "Robinhood Chain is out of reach",
    line: "Your network could not reach Robinhood Chain. Some internet providers block it: switch your DNS to 1.1.1.1 or turn on a VPN, then try again. Your cards and $WIF are safe on chain.",
  },
  api: {
    code: "API",
    label: "Server Down",
    hint: "Back soon",
    title: "Our server is not answering",
    line: "The board and your binder read from it. Your cards and $WIF are safe on chain. Try again in a minute.",
  },
  update: {
    code: "NEW",
    label: "New Version",
    hint: "Reload",
    title: "A new version is out",
    line: "This tab still runs the old one. Reload to pick it up.",
  },
  crash: {
    code: "ERR",
    label: "Torn Card",
    hint: "Something broke",
    title: "Something broke on this page",
    line: "Reload to try again. If it keeps happening, go back to the matches.",
  },
  missing: {
    code: "404",
    label: "Empty Slot",
    hint: "Not this one",
    title: "This page is off the pitch",
    line: "The link may be old or mistyped.",
  },
  boot: {
    code: "ERR",
    label: "No Kickoff",
    hint: "Did not start",
    title: "The app could not start",
    line: "Reload to try again. If it keeps happening, check your connection.",
  },
};

type Props = {
  kind: StatusKind;
  /** Buttons or links under the line. */
  children?: ReactNode;
  /** "screen" covers the whole app (connection and boot failures); "page" sits inside the shell. */
  layout?: "screen" | "page";
  /** Small print under the actions, e.g. "Checking again…". */
  note?: string;
};

/**
 * A failure as a page: the landing's empty binder slot card, a heading, one line and the way out. Renders
 * without the router, so it also works when the app fails before the router exists.
 */
export function StatusPage({ kind, children, layout = "page", note }: Props) {
  const ink = palette();
  const copy = statusCopy[kind];
  return (
    <section
      className={layout === "screen" ? "status-screen" : "status-page"}
      aria-labelledby="status-title"
      data-testid={`status-${kind}`}
    >
      <div className="aspect-sleeve w-55">
        <MissingCard
          code={copy.code}
          label={copy.label}
          hint={copy.hint}
          ink={ink.ink}
          muted={ink.graphite}
          back={ink.pink}
          edge={ink.cyan}
          dark={ink.mat}
        />
      </div>
      <h1 id="status-title" className="t-heading text-balance">
        {copy.title}
      </h1>
      <p className="t-small max-w-115 text-balance">{copy.line}</p>
      {children ? <div className="flex flex-wrap items-center justify-center gap-3">{children}</div> : null}
      {note ? <p className="t-small text-graphite">{note}</p> : null}
    </section>
  );
}

/** A full reload, for every failure where the fix is fresh code or a fresh start. */
export function ReloadButton({ label = "Reload" }: { label?: string }) {
  return (
    <button type="button" className={buttonStyles.primary} onClick={() => window.location.reload()}>
      {label}
    </button>
  );
}

/** A plain link to the board that works with or without the router. */
export function MatchesLink() {
  return (
    <a href="/matches" className={buttonStyles.secondary}>
      Back to Matches
    </a>
  );
}

import { Rocket } from "lucide-react";
import { Link, useLocation } from "react-router";

type DockStop = "matches" | "binder" | "leaderboard" | null;

const items = [
  { key: "matches", to: "/matches", label: "Matches" },
  { key: "binder", to: "/binder", label: "Binder" },
  { key: "leaderboard", to: "/leaderboard", label: "Leaderboard" },
] as const;

/** Which stop a path belongs to: the match list and every match under it, the binder, the leaderboard. */
function dockStopFor(pathname: string): DockStop {
  if (/^\/matches\/?$/.test(pathname) || /^\/m\/[^/]+(\/open\/[^/]+)?\/?$/.test(pathname)) return "matches";
  if (/^\/binder\/?$/.test(pathname)) return "binder";
  if (/^\/leaderboard\/?$/.test(pathname)) return "leaderboard";
  return null;
}

/**
 * The landing's bottom bar: the Dock shell (j2DqtmR34) with one action instead of the app's stops.
 */
export function LaunchDock() {
  return (
    <div className="dock-bar">
      <nav aria-label="Launch" className="dock dock-solo">
        <Link to="/matches" className="dock-item" aria-current="page">
          <span className="t-body-strong inline-flex items-center gap-2">
            <Rocket size={16} strokeWidth={2.25} aria-hidden />
            Launch App
          </span>
        </Link>
      </nav>
    </div>
  );
}

/**
 * Dock (Framer component j2DqtmR34): a pill of links fixed 24px above the bottom, cyan 1.5px border,
 * pink 4px offset shadow; the current stop is filled pink with white text. Sound lives in the masthead
 * as an icon button.
 */
export function Dock() {
  const active = dockStopFor(useLocation().pathname);
  return (
    <div className="dock-bar">
      <nav aria-label="Main" className="dock">
        {items.map((item) => (
          <Link
            key={item.key}
            to={item.to}
            className="dock-item"
            aria-current={active === item.key ? "page" : undefined}
          >
            <span className="t-body-strong">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

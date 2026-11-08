import { isRouteErrorResponse, useRouteError } from "react-router";
import { MatchesLink, ReloadButton, type StatusKind, StatusPage } from "../components/playmat/StatusPage";

/** A lazy page whose code file is gone: the site was redeployed while this tab stayed open. */
function isStaleCode(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /dynamically imported module|Importing a module script failed|Failed to fetch dynamically|error loading dynamically/i.test(
    message,
  );
}

function kindOf(error: unknown): StatusKind {
  if (error == null || (isRouteErrorResponse(error) && error.status === 404)) return "missing";
  if (isStaleCode(error)) return navigator.onLine ? "update" : "offline";
  return "crash";
}

/** Unknown URL, a page whose code is out of date, or a crash inside a screen: say which, and the way out. */
export function RouteError() {
  const error = useRouteError();
  const kind = kindOf(error);
  if (kind === "crash") console.error(error);
  return (
    <StatusPage kind={kind}>
      {kind === "missing" ? null : <ReloadButton />}
      <MatchesLink />
    </StatusPage>
  );
}

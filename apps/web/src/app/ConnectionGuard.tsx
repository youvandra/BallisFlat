import { useCallback, useEffect, useRef, useState } from "react";
import { StatusPage } from "../components/playmat/StatusPage";
import { Button } from "../components/ui/Button";
import { checkHealth, type Health } from "../lib/health";

/** While a problem is on screen, check again this often so the page clears by itself once it is fixed. */
const RECHECK_MS = 15_000;

/**
 * Covers the app with a status page when the browser is offline or cannot reach Robinhood Chain or the
 * API, checked at start, on the browser's online/offline events, when the tab comes back, and every 15s
 * while a problem shows. Clears itself as soon as a check passes.
 */
export function ConnectionGuard() {
  const [health, setHealth] = useState<Health>("ok");
  const [checking, setChecking] = useState(false);
  const running = useRef(false);

  const check = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setChecking(true);
    try {
      setHealth(await checkHealth());
    } finally {
      running.current = false;
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void check();
    const offline = () => setHealth("offline");
    const online = () => void check();
    const visible = () => {
      if (document.visibilityState === "visible") void check();
    };
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [check]);

  useEffect(() => {
    if (health === "ok") return;
    const timer = window.setInterval(() => void check(), RECHECK_MS);
    return () => window.clearInterval(timer);
  }, [health, check]);

  if (health === "ok") return null;
  return (
    <StatusPage
      kind={health}
      layout="screen"
      note={checking ? "Checking again…" : "Checks again every 15 seconds."}
    >
      <Button onClick={() => void check()} disabled={checking}>
        {checking ? "Checking…" : "Try Again"}
      </Button>
    </StatusPage>
  );
}

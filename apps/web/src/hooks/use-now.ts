import { useEffect, useState } from "react";
import { useGame } from "../lib/game/queries";

/** The game clock in unix seconds, re-read every `intervalMs` for countdowns. */
export function useNow(intervalMs = 1000): number {
  const client = useGame();
  const [now, setNow] = useState(() => client.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(client.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [client, intervalMs]);
  return now;
}

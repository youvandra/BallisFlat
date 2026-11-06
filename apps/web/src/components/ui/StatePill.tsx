import type { MatchState } from "../../lib/game/types";
import { Badge } from "./Badge";

// Fans read "Open / Live / Settling / Claim" (docs/ux-flow.md), the contract says Open / Locked / Proposed / Final.
// Badges come in Pink or cyan only: cyan while picks are open, Pink once the match is under way or done.
const labels: Record<MatchState, { text: string; tone: "pink" | "cyan" }> = {
  None: { text: "Not Listed", tone: "cyan" },
  Open: { text: "Open", tone: "cyan" },
  Locked: { text: "Live", tone: "pink" },
  Proposed: { text: "Settling", tone: "pink" },
  Final: { text: "Claim", tone: "pink" },
  RolledOver: { text: "Rolled Over", tone: "pink" },
  Void: { text: "Void", tone: "pink" },
};

/** The state in the fans' words, shared by the header pill and the state track so both say the same thing. */
export const stateLabel = (state: MatchState) => labels[state].text;

/** The state's badge tone, so every badge that shows the state (header pill, state track) matches. */
export const stateTone = (state: MatchState) => labels[state].tone;

/** The match state as a Badge, like the discipline badge on the landing's match card. */
export function StatePill({ state }: { state: MatchState }) {
  const label = labels[state];
  return <Badge tone={label.tone}>{label.text}</Badge>;
}

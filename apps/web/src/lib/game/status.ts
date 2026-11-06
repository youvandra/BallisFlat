// Where the wallet stands in one match, in the binder's words. Matches and the market share it.
import { binderGroupOf } from "./binder";
import type { BinderCard, MatchView } from "./queries";

export type CardStatus =
  | "Not Joined"
  | "Sealed"
  | "Joined"
  | "Locked"
  | "Result Posted"
  | "Claim"
  | "Missed"
  | "Refund"
  | "Claimed";

export function cardStatus(view: MatchView, card: BinderCard | undefined, opened: boolean): CardStatus {
  if (!card) return "Not Joined";
  const group = binderGroupOf(card, opened);
  if (group === "Claim" || group === "Missed" || group === "Refund" || group === "Claimed") return group;
  if (group === "Sealed") return "Sealed";
  if (view.state === "Locked") return "Locked";
  if (view.state === "Proposed") return "Result Posted";
  return "Joined";
}

export const statusNotes: Record<CardStatus, string> = {
  "Not Joined": "Pick a player to join. Your card comes sealed in a pack.",
  Sealed: "Your card is sealed. Open it to see who you hold.",
  Joined: "Your card is open. Picks lock at kickoff.",
  Locked: "Picks closed at kickoff. Result after full time.",
  "Result Posted": "Final when the dispute window closes.",
  Claim: "You called it. Burn the card in your binder.",
  Missed: "Another player took it. The card stays as your record.",
  Refund: "Called off. Your card refunds its price.",
  Claimed: "Burned for its payout. A ghost stays in your binder.",
};

/** The match as fans read it: Open before kickoff, Live until it is final, then Settled. */
export function matchPhase(view: MatchView): "Open" | "Live" | "Settled" {
  if (view.state === "Open") return "Open";
  if (view.state === "Locked" || view.state === "Proposed") return "Live";
  return "Settled";
}

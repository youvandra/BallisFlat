import type { BinderCard } from "./queries";

export const binderGroups = ["Claim", "Sealed", "Waiting", "Missed", "Refund", "Claimed"] as const;
export type BinderGroup = (typeof binderGroups)[number];

/**
 * Which Binder shelf a card sits on, from its match state, whether it has been burned and whether its pack
 * is open. An unopened card waits on the Sealed shelf until its match has a final answer; then it moves to
 * Claim, Missed or Refund and is still drawn sealed until it is opened.
 */
export function binderGroupOf(
  card: Pick<BinderCard, "burned" | "match" | "playerId" | "claimable">,
  opened = true,
): BinderGroup {
  if (card.burned) return "Claimed";
  const { state, winners } = card.match;
  if (state === "Void") return "Refund";
  if (state === "Final") return winners.includes(card.playerId) && card.claimable > 0n ? "Claim" : "Missed";
  if (state === "RolledOver") return "Missed";
  return opened ? "Waiting" : "Sealed";
}

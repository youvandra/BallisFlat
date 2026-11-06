import { sentenceFor } from "@app/core/errors";
import { GameError } from "./types";

// Wallet-side failures never reach the contract, so they have no ABI name. The contract errors are
// listed here until packages/core/errors.ts carries them; core wins whenever it has a sentence.
const appSentences: Record<string, string> = {
  NotConnected: "Connect a wallet first.",
  NoWallet: "No browser wallet found. Install MetaMask, Rabby or Robinhood Wallet and reload.",
  UserRejected: "You cancelled in the wallet. Nothing was sent.",
  Reverted: "The transaction failed on chain. Nothing was charged except gas.",
  NotListed: "This match is not on the board.",
  MintClosed: "Picks for this match closed at kickoff.",
  AlreadyHasCard: "This wallet already has a card for this match.",
  UnknownPlayer: "That player is not in this match's squad.",
  NotSettler: "Only the settler key can post or void results.",
  TooEarly: "Too early for that. Wait for kickoff or the end of the dispute window.",
  WrongStatus: "The match is not in the right state for that.",
  WindowClosed: "The dispute window has closed.",
  NotCardOwner: "This wallet does not hold that card. It may have been claimed already.",
  NotAWinner: "This card did not win, so there is nothing to claim.",
  MintPaused: "New picks are paused for now. Claims still work.",
  PlayerSoldOut: "Every card on this player is taken. Pick another player.",
  AlreadyOpened: "This pack is already open.",
  NotForSale: "This card is not for sale.",
  TradingClosed: "Trading on this match closed at kickoff.",
  PriceAboveMax: "The price went up before your purchase. Nothing was charged.",
  CannotBuyOwnCard: "This card is already yours.",
  ZeroPrice: "Set a price above zero.",
  ZeroAddress: "An address was empty.",
  InvalidBurnBps: "The burn share is out of range.",
  InvalidListing: "The match listing is invalid.",
  InvalidWinners: "The winner list is invalid for this match.",
};

/** One plain sentence for any failure a game call can throw. */
export function errorSentence(error: unknown): string {
  const code = error instanceof GameError ? error.code : "Unknown";
  const fromCore = sentenceFor(code);
  if (fromCore !== sentenceFor("Unknown") || code === "Unknown") return fromCore;
  return appSentences[code] ?? fromCore;
}

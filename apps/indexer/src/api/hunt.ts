// Hunt cards are read straight from the BallIsFlatHunt contract: the indexer does not track Hunt, and a card
// is a handful of view calls. What a card is (player, round, pack, tier) never changes once minted, so it is
// cached; the round's state (claimed, paid) is read fresh on every request.
import { ballIsFlatHuntAbi } from "@app/config/abi/BallIsFlatHunt";
import { hunt } from "@app/config/constants";
import { networks } from "@app/config/deployments";
import { createPublicClient, http } from "viem";
import type { HuntCardView } from "./metadata";
import { latestNumberOf, playerById, teams } from "./offchain";

const network = process.env.NETWORK === "local" ? "local" : "mainnet";
const address = networks[network].contracts.BallIsFlatHunt;
const client = createPublicClient({
  transport: http(
    process.env.RPC_URL ??
      (network === "local" ? "http://127.0.0.1:8545" : "https://rpc.mainnet.chain.robinhood.com"),
  ),
});
const contract = address ? ({ address, abi: ballIsFlatHuntAbi } as const) : null;

type Fixed = Omit<HuntCardView, "claimed" | "paid">;
const fixed = new Map<bigint, Fixed>();

async function fixedPart(tokenId: bigint): Promise<Fixed | null> {
  const cached = fixed.get(tokenId);
  if (cached) return cached;
  if (!contract) return null;
  // cardPlayer is 0 for a token that was never minted (player ids start at 1).
  const [player, round, packId] = await Promise.all([
    client.readContract({ ...contract, functionName: "cardPlayer", args: [tokenId] }),
    client.readContract({ ...contract, functionName: "cardRound", args: [tokenId] }),
    client.readContract({ ...contract, functionName: "cardPack", args: [tokenId] }),
  ]);
  if (player === 0) return null;
  const [pack, roundData, person, number, teamList] = await Promise.all([
    client.readContract({ ...contract, functionName: "pack", args: [packId] }),
    client.readContract({ ...contract, functionName: "round", args: [BigInt(round)] }),
    playerById(player),
    latestNumberOf(player),
    teams(),
  ]);
  if (!person) return null;
  const view: Fixed = {
    tokenId,
    round,
    packId,
    tier: hunt.tiers[pack.tier]?.name ?? "Pack",
    wanted: player === roundData.target,
    playerName: person.name,
    playerPosition: person.position,
    playerNumber: number,
    teamCode: person.teamCode,
    teamColour: teamList.find((t) => t.code === person.teamCode)?.colour ?? "#ff4fa3",
  };
  fixed.set(tokenId, view);
  return view;
}

/** A minted Hunt card with its round's current state; null when the card does not exist or Hunt is not deployed. */
export async function huntCardView(tokenId: bigint): Promise<HuntCardView | null> {
  const base = await fixedPart(tokenId);
  if (!base || !contract) return null;
  const r = await client.readContract({ ...contract, functionName: "round", args: [BigInt(base.round)] });
  return { ...base, claimed: r.claimed, paid: r.paid };
}

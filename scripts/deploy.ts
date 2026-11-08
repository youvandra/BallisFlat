// Deploys BallIsFlat, lists every fixture, and records addresses + match ids in
// packages/config/src/deployments.json.
//
//   npm run chain:local                 anvil on :8545 with Robinhood Chain's id (4663)
//   npm run deploy:local                deploy a mock $WIF + BallIsFlat, list fixtures, seed demo state
//   node scripts/deploy.ts --network mainnet --yes
//                                       real $WIF; needs DEPLOYER_KEY and SETTLER_ADDRESS, spends ETH gas
//
// Matches are listed latest kickoff first so each one can roll an uncalled pot into the next by kickoff
// (listMatch only accepts a nextMatch that already exists).
//
// A fixture whose kickoff has passed (the warm-up) is listed with a kickoff a few minutes ahead,
// because listMatch only accepts a future kickoff. Its result is still the real, published one.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Address,
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  type Hex,
  http,
  parseEventLogs,
  publicActions,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhoodChain } from "../packages/config/src/chain.ts";
import { game, hunt, wif } from "../packages/config/src/constants.ts";
import type { Deployment, Network } from "../packages/config/src/deployments.ts";
import { fixtures, playerIdOf } from "../packages/config/src/fixtures.ts";
import { squadIds, squadProof } from "../packages/core/src/squad.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contractsDir = resolve(root, "packages/contracts");
const deploymentsPath = resolve(root, "packages/config/src/deployments.json");

// anvil's first two default accounts: owner + settler, and the demo wallet the app signs with.
const ANVIL_OWNER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const ANVIL_DEMO = getAddress("0x70997970c51812dc3a010c7d01b50e0d17dc79c8");
const ANVIL_OTHERS = [
  "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
  "0x90f79bf6eb2c4f870365e785982e1f101e93b906",
  "0x15d34aaf54267db7d7c367839aaf71a00a2c6a65",
].map((address) => getAddress(address));

const args = process.argv.slice(2);
const network = (args[args.indexOf("--network") + 1] ?? "local") as Network;
if (network !== "local" && network !== "mainnet") throw new Error(`unknown network ${network}`);
if (network === "mainnet" && !args.includes("--yes")) {
  throw new Error("mainnet deploy spends real ETH gas: re-run with --yes once the owner has approved it");
}
const seed = network === "local" && !args.includes("--no-seed");
const warmUpLead = Number(process.env.WARMUP_LEAD_SECONDS ?? 600);

const rpcUrl =
  network === "local"
    ? "http://127.0.0.1:8545"
    : (process.env.RPC_URL ?? robinhoodChain.rpcUrls.default.http[0]);
const chain = defineChain({ ...robinhoodChain, rpcUrls: { default: { http: [rpcUrl] } } });
const key = network === "local" ? ANVIL_OWNER_KEY : (process.env.DEPLOYER_KEY as Hex | undefined);
if (!key) throw new Error("DEPLOYER_KEY is required for mainnet");
const owner = privateKeyToAccount(key);
const settler = (network === "local" ? owner.address : process.env.SETTLER_ADDRESS) as Address | undefined;
if (!settler) throw new Error("SETTLER_ADDRESS is required for mainnet");

const client = createWalletClient({ account: owner, chain, transport: http() }).extend(publicActions);
const publicClient = createPublicClient({ chain, transport: http() });

type Artifact = { abi: readonly unknown[]; bytecode: { object: Hex } };
function artifact(file: string, name: string): Artifact {
  return JSON.parse(readFileSync(resolve(contractsDir, `out/${file}/${name}.json`), "utf8"));
}

async function send(hash: Hex) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`reverted: ${hash}`);
  return receipt;
}

async function rpc(method: string, params: unknown[] = []) {
  // anvil cheat methods, local only.
  return client.request({ method, params } as never);
}

async function main() {
  const chainId = await publicClient.getChainId();
  if (chainId !== robinhoodChain.id) {
    throw new Error(
      `RPC reports chain ${chainId}; expected ${robinhoodChain.id} (start anvil with --chain-id 4663)`,
    );
  }

  execFileSync("forge", ["build"], { cwd: contractsDir, stdio: "inherit" });
  const bif = artifact("BallIsFlat.sol", "BallIsFlat");

  let wifAddress = wif.address as Address;
  if (network === "local") {
    const mock = artifact("Mocks.sol", "MockWIF");
    const receipt = await send(
      await client.deployContract({ abi: mock.abi, bytecode: mock.bytecode.object }),
    );
    wifAddress = receipt.contractAddress as Address;
  }

  const deployReceipt = await send(
    await client.deployContract({
      abi: bif.abi,
      bytecode: bif.bytecode.object,
      args: [wifAddress, settler, game.burnBps, BigInt(game.disputeWindowSeconds), game.saleBurnBps],
    }),
  );
  const address = deployReceipt.contractAddress as Address;
  console.log(`BallIsFlat ${address} (block ${deployReceipt.blockNumber}), $WIF ${wifAddress}`);

  const contract = { address, abi: bif.abi } as const;
  const now = Number((await publicClient.getBlock()).timestamp);
  const matches: Record<string, number> = {};
  // One transaction for every fixture, latest kickoff first, so each match rolls into the one listed
  // just before it (listMatches checks nextMatch against the ids that already exist).
  const byKickoffDesc = [...fixtures].sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff));
  const listings = byKickoffDesc.map((fixture, index) => {
    const real = Math.floor(Date.parse(fixture.kickoff) / 1000);
    return {
      kickoff: BigInt(real > now + 60 ? real : now + warmUpLead),
      price: game.cardPrice,
      nextMatch: BigInt(index), // 0 for the first, then the id listed just before
      maxPerPlayer: game.maxPerPlayer,
      playerIds: squadIds(fixture.players.map((player) => player.id)),
    };
  });
  const receipt = await send(
    await client.writeContract({ ...contract, functionName: "listMatches", args: [listings] }),
  );
  const listed = parseEventLogs({
    abi: bif.abi,
    logs: receipt.logs,
    eventName: "MatchListed",
  }) as unknown as {
    args: { matchId: bigint; kickoff: bigint };
  }[];
  for (const [index, fixture] of byKickoffDesc.entries()) {
    const event = listed[index];
    const id = Number(event?.args.matchId);
    matches[fixture.slug] = id;
    console.log(
      `  #${id} ${fixture.slug} kickoff ${new Date(Number(event?.args.kickoff) * 1000).toISOString()}`,
    );
  }
  console.log(`listed ${listed.length} matches in one transaction (gas ${receipt.gasUsed})`);

  const metadataBase = process.env.METADATA_BASE_URI;
  if (metadataBase) {
    const contractUri =
      process.env.METADATA_CONTRACT_URI ?? `${metadataBase.replace(/\/cards\/?$/, "")}/collection`;
    await send(
      await client.writeContract({
        ...contract,
        functionName: "setMetadataURIs",
        args: [metadataBase.endsWith("/") ? metadataBase : `${metadataBase}/`, contractUri],
      }),
    );
    console.log(`metadata: ${metadataBase} (+ ${contractUri})`);
  }

  // Hunt: wanted-player packs. Round 1 hunts HUNT_TARGET ("TEAM:Name", default Harry Kane) across every
  // player in the listed Nations League squads (the warm-up sheet is a subset of them).
  const huntArtifact = artifact("BallIsFlatHunt.sol", "BallIsFlatHunt");
  const huntReceipt = await send(
    await client.deployContract({
      abi: huntArtifact.abi,
      bytecode: huntArtifact.bytecode.object,
      args: [
        wifAddress,
        hunt.burnBps,
        hunt.winnerBps,
        hunt.tiers.map((tier) => ({ price: tier.price, cards: tier.cards })),
      ],
    }),
  );
  const huntAddress = huntReceipt.contractAddress as Address;
  const huntContract = { address: huntAddress, abi: huntArtifact.abi } as const;
  const [targetTeam, targetName] = (process.env.HUNT_TARGET ?? "ENG:Harry Kane").split(":");
  const target = playerIdOf(targetTeam ?? "", targetName ?? "");
  const huntPool = [
    ...new Set(fixtures.filter((f) => !f.warmUp).flatMap((f) => f.players.map((p) => p.id))),
  ].sort((a, b) => a - b);
  await send(
    await client.writeContract({ ...huntContract, functionName: "startRound", args: [target, huntPool] }),
  );
  if (metadataBase) {
    const huntBase = `${metadataBase.replace(/\/cards\/?$/, "")}/hunt/cards/`;
    await send(await client.writeContract({ ...huntContract, functionName: "setBaseURI", args: [huntBase] }));
  }
  console.log(
    `BallIsFlatHunt ${huntAddress}: round 1 hunts ${targetName} (${target}) across ${huntPool.length} players`,
  );

  const record: Deployment = {
    chainId,
    deployBlock: Number(deployReceipt.blockNumber),
    contracts: {
      BallIsFlat: address,
      BallIsFlatHunt: huntAddress,
      ...(network === "local" ? { WIF: wifAddress } : {}),
    },
    matches,
  };
  const all = JSON.parse(readFileSync(deploymentsPath, "utf8"));
  all[network] = record;
  writeFileSync(deploymentsPath, `${JSON.stringify(all, null, 2)}\n`);
  console.log(`wrote ${network} to packages/config/src/deployments.json`);

  if (seed) await seedLocal(contract, wifAddress, matches);
}

/**
 * Local demo state: every anvil wallet gets $WIF, the others pick across Matchday 5, and the warm-up is
 * played, settled and finalized with the demo wallet holding a winning card, so the Claim step is live.
 * The winner here is a stand-in for the local chain only; mainnet posts the published rating.
 */
async function seedLocal(
  contract: { address: Address; abi: readonly unknown[] },
  wifAddress: Address,
  matches: Record<string, number>,
) {
  const mock = artifact("Mocks.sol", "MockWIF");
  const wallets = [ANVIL_DEMO, ...ANVIL_OTHERS];
  for (const wallet of wallets) {
    await send(
      await client.writeContract({
        address: wifAddress,
        abi: mock.abi,
        functionName: "mint",
        args: [wallet, 100_000n * 10n ** 18n],
      }),
    );
  }

  // Wallets act through anvil's unlocked accounts.
  async function as(wallet: Address, functionName: string, args: unknown[], target = contract) {
    await rpc("anvil_impersonateAccount", [wallet]);
    const hash = await client.writeContract({
      ...target,
      account: wallet,
      functionName,
      args,
    } as never);
    await send(hash);
  }
  const squadOf = (slug: string) =>
    squadIds(fixtures.find((fixture) => fixture.slug === slug)?.players.map((player) => player.id) ?? []);
  async function pick(wallet: Address, slug: string, playerId: number) {
    await as(wallet, "approve", [contract.address, game.cardPrice], { address: wifAddress, abi: mock.abi });
    await as(wallet, "mint", [BigInt(matches[slug] ?? 0), playerId, squadProof(squadOf(slug), playerId)]);
  }

  const warmUp = fixtures.find((fixture) => fixture.warmUp);
  const open = fixtures.filter((fixture) => !fixture.warmUp);
  for (const [index, wallet] of ANVIL_OTHERS.entries()) {
    for (const fixture of open) {
      const forwards = fixture.players.filter((player) => player.position === "FW");
      const player = forwards[(index * 3) % forwards.length] ?? fixture.players[0];
      if (player) await pick(wallet, fixture.slug, player.id);
    }
  }

  if (!warmUp) return;
  const winner = warmUp.players.find((player) => player.position === "MF") ?? warmUp.players[0];
  const loser = warmUp.players.find((player) => player.position === "FW") ?? warmUp.players[1];
  if (!winner || !loser) return;
  await pick(ANVIL_DEMO, warmUp.slug, winner.id);
  await pick(ANVIL_OTHERS[0] as Address, warmUp.slug, winner.id);
  await pick(ANVIL_OTHERS[1] as Address, warmUp.slug, loser.id);

  const id = BigInt(matches[warmUp.slug] ?? 0);
  await rpc("evm_increaseTime", [warmUpLead + 60]);
  await rpc("evm_mine");
  await send(
    await client.writeContract({
      ...contract,
      functionName: "propose",
      args: [id, [winner.id], [squadProof(squadOf(warmUp.slug), winner.id)], "local-only stand-in result"],
    }),
  );
  await rpc("evm_increaseTime", [game.disputeWindowSeconds + 60]);
  await rpc("evm_mine");
  await send(await client.writeContract({ ...contract, functionName: "finalize", args: [id] }));
  console.log(`seeded: warm-up finalized, ${ANVIL_DEMO} holds a winning ${winner.name} card`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

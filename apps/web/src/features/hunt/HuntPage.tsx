import { product } from "@app/config/constants";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { PackLoader } from "../../components/playmat/PackLoader";
import { PlayerHoloCard } from "../../components/playmat/PlayerHoloCard";
import { Zone } from "../../components/playmat/Zone";
import { Button } from "../../components/ui/Button";
import { ButtonLink } from "../../components/ui/ButtonLink";
import { Logo } from "../../components/ui/Logo";
import { Notice } from "../../components/ui/Notice";
import { type PackFinish, packFoil } from "../../framer/PackRip";
import { useWallet } from "../../hooks/use-wallet";
import { formatPercent, formatWif, shortHash, surname } from "../../lib/format";
import { fetchAllowProof } from "../../lib/game/allowlist";
import { errorSentence } from "../../lib/game/errors";
import { facts, txUrl } from "../../lib/game/facts";
import { huntPlayer, tierKeys, useHunt, useHuntPacks } from "../../lib/game/hunt";
import { useGame } from "../../lib/game/queries";
import type { Account, Hash, HuntFind, HuntRound, HuntStep, HuntTier, HuntView } from "../../lib/game/types";
import { ConnectWallet } from "../connect/ConnectWallet";
import { HuntStage, type Stage } from "./HuntStage";

/**
 * Chance that the next pack of `cards` holds at least one wanted card when `wanted` of the `deck` cards
 * left are wanted (drawing without replacement, as the contract does).
 */
export function findChance(cards: number, wanted: number, deck: number): number {
  if (wanted <= 0 || deck <= 0) return 0;
  let miss = 1;
  for (let i = 0; i < Math.min(cards, deck); i += 1) miss *= Math.max(0, deck - wanted - i) / (deck - i);
  return 1 - miss;
}

/** The connected wallet's free-pack proof for an allowlisted tier, and whether it was used. */
function useFreePack(round: HuntRound, tier: HuntTier | undefined, current: Account | null | undefined) {
  const client = useGame();
  const root = tier?.allowRoot ?? null;
  return useQuery({
    queryKey: ["hunt-allow", round.id, tier?.id, root, current?.address],
    enabled: Boolean(root && current && tier),
    queryFn: async (): Promise<{ proof: Hash[] | null; used: boolean }> => {
      if (!root || !current || !tier) return { proof: null, used: false };
      const [proof, used] = await Promise.all([
        fetchAllowProof(root, current.address),
        client.huntAllowUsed(round.id, tier.id, current.address),
      ]);
      return { proof, used };
    },
  });
}

/**
 * The Hunt: one wanted player and a prize the Ball is Flat team posts. Buy a Silver, Gold or Diamond pack,
 * it is drawn one block later, tear it open and the cards come out one by one. The first pack holding the
 * wanted card wins the round; the team pays the prize by transfer and posts the receipt here.
 */
export function HuntPage() {
  const hunt = useHunt();

  if (hunt.isPending) {
    return (
      <div className="playmat">
        <div className="playmat-col col-fill">
          <Zone label="Hunt" field className="items-center justify-center">
            <PackLoader label="Putting up the poster…" />
          </Zone>
        </div>
      </div>
    );
  }
  if (hunt.isError || !hunt.data?.available || !hunt.data.round) {
    return (
      <div className="playmat">
        <div className="playmat-col col-fill">
          <Zone label="Hunt" field className="items-start gap-4 p-9">
            <h1 className="t-heading">The Hunt opens soon</h1>
            <p className="t-body text-graphite">
              One wanted player, a deck with a few of his cards in it, and a prize from the Ball is Flat team
              for every one of them.
            </p>
            <ButtonLink to="/matches">Go to Matches</ButtonLink>
          </Zone>
        </div>
      </div>
    );
  }
  return <Hunt view={hunt.data} />;
}

function Hunt({ view }: { view: HuntView }) {
  const client = useGame();
  const queryClient = useQueryClient();
  const { account } = useWallet();
  const packs = useHuntPacks(account.data);
  const [stage, setStage] = useState<Stage | null>(null);
  // HuntPage renders this only with a round.
  const round = view.round as HuntRound;
  const wanted = huntPlayer(round.target);
  const isOpen = round.status === "Open";
  const current = account.data;
  const wantedLeft = round.winners - round.found - round.lost;
  const deckLeft = round.supply - round.drawn;
  const unsold = round.supply - round.sold;
  const claimButton = (roundId: number, find: HuntFind, prize: bigint, className = "") => (
    <Button
      className={className}
      onClick={() => claim.mutate({ roundId, index: find.index })}
      disabled={claim.isPending}
      data-testid="hunt-claim"
    >
      {claim.isPending ? "Confirm in Your Wallet…" : `Claim ${formatWif(prize)} $WIF`}
    </Button>
  );
  const freeTier = view.tiers.find((tier) => tier.allowRoot);
  const free = useFreePack(round, freeTier, current);

  const draw = useMutation({
    mutationFn: async ({ tier, packId }: { tier: HuntTier; packId?: bigint }) => {
      const steps: HuntStep[] = packId === undefined ? ["approve", "buy", "seal", "open"] : ["seal", "open"];
      const show = (step: HuntStep | null) => setStage({ kind: "working", tier, steps, step, error: null });
      show(steps[0] ?? null);
      const proof = tier.allowRoot ? (free.data?.proof ?? []) : [];
      const id = packId ?? (await client.buyHuntPack(tier.id, show, proof)).packId;
      const result = await client.openHuntPack(id, show);
      return { tier, packId: id, players: result.players, found: result.found };
    },
    onSuccess: async (result) => {
      setStage({ kind: "pack", ...result });
      await queryClient.invalidateQueries();
    },
    onError: (error, { tier }) =>
      setStage({ kind: "working", tier, steps: [], step: null, error: errorSentence(error) }),
  });

  const claim = useMutation({
    mutationFn: ({ roundId, index }: { roundId: number; index: number }) =>
      client.claimHuntPrize(roundId, index),
    onSettled: () => queryClient.invalidateQueries(),
  });

  const mintCard = useMutation({
    mutationFn: ({ packId, slot }: { packId: bigint; slot: number }) =>
      client.mintHuntCard(packId, slot, () => undefined),
    onSettled: () => queryClient.invalidateQueries(),
  });

  const sealed = (packs.data ?? []).filter((pack) => !pack.opened);
  const openedPacks = (packs.data ?? []).filter((pack) => pack.opened).reverse();
  const mintedCount = (packs.data ?? []).reduce(
    (total, pack) => total + pack.minted.filter((id) => id !== null).length,
    0,
  );
  const stagePack =
    stage && stage.kind !== "working" ? packs.data?.find((pack) => pack.packId === stage.packId) : undefined;
  const mintLabel = view.mintPrice > 0n ? `Mint for ${formatWif(view.mintPrice)} $WIF` : "Mint This Card";
  const myWins = view.history.flatMap((r) =>
    r.finds
      .filter((find) => current && find.winner.toLowerCase() === current.address.toLowerCase())
      .map((find) => ({ round: r, find })),
  );
  const stageWin =
    stage && stage.kind !== "working"
      ? myWins.find((win) => win.find.packId === stage.packId && !win.find.claimed && !win.find.paid)
      : undefined;

  return (
    <div className="playmat">
      <div className="playmat-col col-case">
        <Zone label="Wanted" field className="items-center gap-4 px-5 pt-7.5 pb-5">
          {wanted ? (
            <div className="w-50">
              <PlayerHoloCard
                player={wanted.player}
                team={wanted.team}
                rarity="legendary"
                label="Wanted"
                setLabel={`Hunt ${round.id}`}
              />
            </div>
          ) : (
            <p className="t-title">Player #{round.target}</p>
          )}
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="t-zone">Prize per card</p>
            <p className="t-stat num" data-testid="hunt-prize">
              {formatWif(round.prizeEach)}
            </p>
            <p className="t-small">$WIF from the {product.name} team</p>
          </div>
          <dl className="t-small grid w-full grid-cols-2 gap-x-3 gap-y-1 border-y border-line-soft py-3">
            <dt>Wanted left</dt>
            <dd className="num text-right text-ink" data-testid="hunt-wanted-left">
              {wantedLeft} of {round.winners}
            </dd>
            <dt>Deck</dt>
            <dd className="num text-right text-ink" data-testid="hunt-deck">
              {round.sold.toLocaleString("en-US")} / {round.supply.toLocaleString("en-US")} sold
            </dd>
          </dl>
          {round.finds.length > 0 ? (
            <ul className="t-small flex w-full flex-col gap-1" aria-label="Found">
              {round.finds.map((find) => (
                <li key={find.index} className="flex justify-between gap-3">
                  <span>Found by</span>
                  <span className="num text-ink">
                    {shortHash(find.winner)}
                    {find.paid ? ", paid" : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {round.status === "Done" ? (
            <Notice>Every wanted card is out. The next poster goes up soon.</Notice>
          ) : round.status === "Closed" ? (
            <Notice>This round closed. The next poster goes up soon.</Notice>
          ) : null}
        </Zone>
      </div>

      <div className="playmat-col col-fill phone-first">
        <Zone label="Hunt" field className="gap-6 px-5 pt-7.5 pb-6 tab:px-9">
          <div className="flex flex-col gap-2">
            <p className="t-zone">Round {round.id}</p>
            <h1 className="t-display text-balance">
              Find {wanted ? surname(wanted.player.name) : "the wanted player"}
            </h1>
            <p className="t-body text-graphite">
              The deck holds {round.supply.toLocaleString("en-US")} cards and {round.winners} of them are{" "}
              {wanted?.player.name ?? "the wanted player"}. Every one you pull pays{" "}
              <span className="num text-ink">{formatWif(round.prizeEach)} $WIF</span> from the {product.name}{" "}
              team. The rest are players from the November squads. {formatPercent(view.burnBps / 10_000)} of
              every pack burns, and packs stop when the deck runs out.
            </p>
          </div>

          <ul className="grid grid-cols-1 gap-5 tab:grid-cols-3" aria-label="Packs">
            {view.tiers.map((tier) => {
              const gated = Boolean(tier.allowRoot);
              const canFree = gated && Boolean(free.data?.proof) && !free.data?.used;
              const soldOut = tier.cards > unsold;
              return (
                <li key={tier.id} className="flex flex-col gap-3">
                  <TierPack tier={tier} />
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <p className="t-body-strong num whitespace-nowrap">
                      {tier.price === 0n ? "Free" : `${formatWif(tier.price)} $WIF`}
                    </p>
                    <p className="t-small num whitespace-nowrap">
                      {formatPercent(findChance(tier.cards, wantedLeft, deckLeft))} to find
                    </p>
                  </div>
                  <Button
                    className="w-full"
                    variant={tier.id === 2 || canFree ? "primary" : "secondary"}
                    disabled={
                      !isOpen ||
                      soldOut ||
                      draw.isPending ||
                      !current?.isRightChain ||
                      current.wif < tier.price ||
                      (gated && !canFree)
                    }
                    onClick={() => draw.mutate({ tier })}
                    data-testid={`buy-${tierKeys[tier.id]}`}
                  >
                    {soldOut
                      ? "Sold Out"
                      : !gated
                        ? `Buy ${tier.name}`
                        : canFree
                          ? `Open Free ${tier.name}`
                          : free.data?.used
                            ? "Free Pack Used"
                            : "Allowlist Only"}
                  </Button>
                </li>
              );
            })}
          </ul>

          {!current?.isRightChain ? (
            <div className="flex flex-col gap-3" data-testid="connect-inline">
              <p className="t-body-strong">Connect a wallet to buy packs.</p>
              <ConnectWallet />
            </div>
          ) : !isOpen ? (
            <Notice>No one is wanted right now. Your cards stay in your binder.</Notice>
          ) : current.wif < (view.tiers[0]?.price ?? 0n) ? (
            <div className="flex flex-col gap-3">
              <Notice tone="warn">
                You need at least <span className="num">{formatWif(view.tiers[0]?.price ?? 0n)} $WIF</span>{" "}
                for a pack.
              </Notice>
              <ButtonLink to={facts.poolUrl} className="self-start">
                Get $WIF <ArrowUpRight size={14} strokeWidth={2} aria-hidden />
              </ButtonLink>
            </div>
          ) : null}
        </Zone>
      </div>

      <div className="playmat-col col-side">
        <Zone label="Your Hunt" className="gap-4 px-4.5 pt-7.5 pb-4.5">
          {!current ? (
            <p className="t-small">Connect to see your packs and wins.</p>
          ) : (
            <>
              {myWins.map(({ round: r, find }) => (
                <div key={`${r.id}-${find.index}`} className="flex flex-col gap-2" data-testid="hunt-win">
                  <p className="t-zone">
                    Round {r.id}, find {find.index + 1}
                  </p>
                  <p className="t-stat num">{formatWif(r.prizeEach)}</p>
                  {find.paid ? (
                    <p className="t-small">$WIF paid to this wallet.</p>
                  ) : find.claimed ? (
                    <p className="t-small">
                      Claimed. The {product.name} team is sending the $WIF to this wallet.
                    </p>
                  ) : (
                    <>
                      <p className="t-small">
                        $WIF from the {product.name} team. Claim it and the team sends it here.
                      </p>
                      {claimButton(r.id, find, r.prizeEach, "w-full")}
                      {claim.isError ? <Notice tone="danger">{errorSentence(claim.error)}</Notice> : null}
                    </>
                  )}
                  {find.payment && client.mode === "chain" ? (
                    <a href={txUrl(find.payment)} target="_blank" rel="noreferrer" className="text-link">
                      Payment <ArrowUpRight size={14} strokeWidth={2} aria-hidden />
                    </a>
                  ) : find.payment ? (
                    <p className="t-small num">Payment {shortHash(find.payment)}</p>
                  ) : null}
                </div>
              ))}
              <dl className="t-small flex flex-col gap-1 border-y border-line-soft py-3">
                <div className="flex justify-between gap-3">
                  <dt>Minted</dt>
                  <dd className="num text-ink" data-testid="hunt-cards">
                    {mintedCount}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Packs</dt>
                  <dd className="num text-ink">{packs.data?.length ?? 0}</dd>
                </div>
              </dl>
              {sealed.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <p className="t-zone">Sealed</p>
                  {sealed.map((pack) => {
                    const tier = view.tiers[pack.tier];
                    if (!tier) return null;
                    return (
                      <Button
                        key={pack.packId.toString()}
                        variant="secondary"
                        className="w-full"
                        disabled={draw.isPending}
                        onClick={() => draw.mutate({ tier, packId: pack.packId })}
                      >
                        Open {tier.name} #{pack.packId.toString()}
                      </Button>
                    );
                  })}
                </div>
              ) : null}
              {openedPacks.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <p className="t-zone">Opened</p>
                  {openedPacks.slice(0, 6).map((pack) => {
                    const tier = view.tiers[pack.tier];
                    if (!tier) return null;
                    const left = pack.minted.filter((id) => id === null).length;
                    return (
                      <Button
                        key={pack.packId.toString()}
                        variant="quiet"
                        className="w-full"
                        disabled={draw.isPending}
                        onClick={() =>
                          setStage({
                            kind: "cards",
                            tier,
                            packId: pack.packId,
                            players: pack.players,
                            found: pack.found,
                          })
                        }
                      >
                        {tier.name} #{pack.packId.toString()}, {left} to mint
                      </Button>
                    );
                  })}
                </div>
              ) : null}
              <ButtonLink to="/binder" variant="secondary" className="mt-auto">
                My Binder
              </ButtonLink>
            </>
          )}
        </Zone>
      </div>

      <HuntStage
        stage={stage}
        target={round.target}
        onTorn={() =>
          setStage((current) => (current?.kind === "pack" ? { ...current, kind: "cards" } : current))
        }
        onClose={() => {
          setStage(null);
          mintCard.reset();
        }}
        mint={
          stagePack
            ? {
                minted: stagePack.minted,
                pending: mintCard.isPending ? (mintCard.variables?.slot ?? null) : null,
                label: mintLabel,
                error: mintCard.isError ? errorSentence(mintCard.error) : null,
                onMint: (slot) => mintCard.mutate({ packId: stagePack.packId, slot }),
              }
            : undefined
        }
        claim={stageWin ? claimButton(stageWin.round.id, stageWin.find, stageWin.round.prizeEach) : null}
      />
    </div>
  );
}

/** A tier's sealed pack: Silver in Ink, Gold in Note, Diamond in cyan over pink. */
function TierPack({ tier }: { tier: HuntTier }) {
  return (
    <span
      className="pack-tile"
      data-tier={tierKeys[tier.id]}
      style={{ background: packFoil(tier.name as PackFinish) }}
      role="img"
      aria-label={`${tier.name} pack`}
    >
      <Logo className="pack-logo text-on-ink" title={product.name} />
      <span className="t-title text-on-ink">{tier.name}</span>
      <span className="t-small text-on-ink">{tier.cards} cards</span>
    </span>
  );
}

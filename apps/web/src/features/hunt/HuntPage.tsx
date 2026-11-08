import { product } from "@app/config/constants";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { PackLoader } from "../../components/playmat/PackLoader";
import { PickBadge } from "../../components/playmat/PickBadge";
import { PlayerHoloCard } from "../../components/playmat/PlayerHoloCard";
import { Zone } from "../../components/playmat/Zone";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ButtonLink } from "../../components/ui/ButtonLink";
import { CountUp } from "../../components/ui/CountUp";
import { Logo } from "../../components/ui/Logo";
import { Notice } from "../../components/ui/Notice";
import { StepLine } from "../../components/ui/StepLine";
import { useWallet } from "../../hooks/use-wallet";
import { formatPercent, formatWif, shortHash, surname } from "../../lib/format";
import { errorSentence } from "../../lib/game/errors";
import { facts } from "../../lib/game/facts";
import { huntPlayer, tierKeys, useHunt, useHuntClaimable, useHuntPacks } from "../../lib/game/hunt";
import { useGame } from "../../lib/game/queries";
import type { HuntPack, HuntRound, HuntStep, HuntTier, HuntView } from "../../lib/game/types";
import { ConnectWallet } from "../connect/ConnectWallet";

const WEI = 10n ** 18n;
const wifNumber = (amount: bigint) => Number(amount / 10n ** 14n) / 10_000;

/** Chance that a pack of `cards` holds the wanted player, drawing uniformly from `poolSize` players. */
function findChance(cards: number, poolSize: number): number {
  if (poolSize <= 0) return 0;
  return 1 - (1 - 1 / poolSize) ** cards;
}

type Reveal = { pack: HuntPack | null; players: number[]; found: boolean; target: number };

/**
 * The Hunt: one wanted player and a pot that grows with every pack. Buy a Silver, Gold or Diamond pack,
 * it opens one block later, and the first pack holding the wanted card takes the pot.
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
              One wanted player, a pot that grows with every pack, and the first card that finds him takes it.
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
  const claimable = useHuntClaimable(account.data);
  const [steps, setSteps] = useState<HuntStep[]>([]);
  const [step, setStep] = useState<HuntStep | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  // HuntPage renders this only with a round.
  const round = view.round as HuntRound;
  const wanted = huntPlayer(round.target);
  const isOpen = round.status === "Open";
  const winnerShare = (round.pot * BigInt(view.winnerBps)) / 10_000n;

  const buy = useMutation({
    mutationFn: async (tier: HuntTier) => {
      setReveal(null);
      setSteps(["approve", "buy", "seal", "open"]);
      const bought = await client.buyHuntPack(tier.id, setStep);
      const opened = await client.openHuntPack(bought.packId, setStep);
      return { ...opened, packId: bought.packId };
    },
    onSuccess: async (result) => {
      setReveal({ pack: null, players: result.players, found: result.found, target: round.target });
      await queryClient.invalidateQueries();
    },
    onSettled: () => setStep(null),
  });

  const openOne = useMutation({
    mutationFn: async (pack: HuntPack) => {
      setReveal(null);
      setSteps(["seal", "open"]);
      return { pack, ...(await client.openHuntPack(pack.packId, setStep)) };
    },
    onSuccess: async (result) => {
      setReveal({ pack: result.pack, players: result.players, found: result.found, target: round.target });
      await queryClient.invalidateQueries();
    },
    onSettled: () => setStep(null),
  });

  const claim = useMutation({
    mutationFn: () => client.claimHunt(),
    onSettled: () => queryClient.invalidateQueries(),
  });

  const busy = buy.isPending || openOne.isPending;
  const sealed = (packs.data ?? []).filter((pack) => !pack.opened);
  const cardsHeld = (packs.data ?? []).reduce((total, pack) => total + pack.players.length, 0);
  const current = account.data;
  const prize = claimable.data ?? 0n;

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
            <p className="t-zone">{isOpen ? "Pot" : round.status === "Won" ? "Won" : "Closed"}</p>
            <p className="t-stat num" data-testid="hunt-pot">
              <CountUp
                value={wifNumber(round.pot)}
                format={(value) => formatWif(BigInt(Math.round(value)) * WEI)}
              />
            </p>
            <p className="t-small">$WIF, {round.packs === 1 ? "1 pack" : `${round.packs} packs`} so far</p>
          </div>
          {round.status === "Won" && round.winner ? (
            <Notice>
              Found by <span className="num">{shortHash(round.winner)}</span>. The next poster goes up soon.
            </Notice>
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
              Every pack draws players from all {round.poolSize} in the November squads. The first pack that
              holds {wanted?.player.name ?? "him"} takes{" "}
              <span className="num text-ink">{formatPercent(view.winnerBps / 10_000)}</span> of the pot,{" "}
              <span className="num text-ink">{formatWif(winnerShare)} $WIF</span> right now.{" "}
              {formatPercent(view.burnBps / 10_000)} of every pack burns.
            </p>
          </div>

          <ul className="grid grid-cols-1 gap-5 tab:grid-cols-3" aria-label="Packs">
            {view.tiers.map((tier) => (
              <li key={tier.id} className="flex flex-col gap-3">
                <span
                  className="pack-tile"
                  data-tier={tierKeys[tier.id]}
                  role="img"
                  aria-label={`${tier.name} pack, ${tier.cards} cards`}
                >
                  <Logo className="pack-logo text-ink" title={product.name} />
                  <span className="t-title">{tier.name}</span>
                  <span className="t-small">{tier.cards} cards</span>
                  <span className="badge mt-2">Hunt {round.id}</span>
                </span>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="t-body-strong num">{formatWif(tier.price)} $WIF</p>
                  <p className="t-small num">
                    {formatPercent(findChance(tier.cards, round.poolSize))} to find
                  </p>
                </div>
                <Button
                  className="w-full"
                  variant={tier.id === 2 ? "primary" : "secondary"}
                  disabled={!isOpen || busy || !current?.isRightChain || current.wif < tier.price}
                  onClick={() => buy.mutate(tier)}
                  data-testid={`buy-${tierKeys[tier.id]}`}
                >
                  Buy {tier.name}
                </Button>
              </li>
            ))}
          </ul>

          {!current?.isRightChain ? (
            <div className="flex flex-col gap-3" data-testid="connect-inline">
              <p className="t-body-strong">Connect a wallet to buy packs.</p>
              <ConnectWallet />
            </div>
          ) : !isOpen ? (
            <Notice>No one is wanted right now. Your packs and prize stay here.</Notice>
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

          {busy ? (
            <div className="flex flex-col gap-3">
              <StepLine steps={steps} current={step} labels={{ buy: "Buy Pack" }} />
              {step === "seal" ? (
                <p className="t-small">The draw uses the next block, so nobody sees it before you pay.</p>
              ) : null}
            </div>
          ) : null}
          {buy.isError ? <Notice tone="danger">{errorSentence(buy.error)}</Notice> : null}
          {openOne.isError ? <Notice tone="danger">{errorSentence(openOne.error)}</Notice> : null}

          {reveal ? <RevealGrid reveal={reveal} /> : null}
        </Zone>
      </div>

      <div className="playmat-col col-side">
        <Zone label="Your Hunt" className="gap-4 px-4.5 pt-7.5 pb-4.5">
          {!current ? (
            <p className="t-small">Connect to see your packs and prize.</p>
          ) : (
            <>
              {prize > 0n ? (
                <div className="flex flex-col gap-3">
                  <p className="t-zone">Prize</p>
                  <p className="t-stat num">{formatWif(prize)}</p>
                  <p className="t-small">$WIF waiting for this wallet</p>
                  {claim.isError ? <Notice tone="danger">{errorSentence(claim.error)}</Notice> : null}
                  <Button className="w-full" onClick={() => claim.mutate()} disabled={claim.isPending}>
                    {claim.isPending ? "Confirm in Your Wallet…" : "Claim Prize"}
                  </Button>
                </div>
              ) : null}
              <dl className="t-small flex flex-col gap-1 border-y border-line-soft py-3">
                <div className="flex justify-between gap-3">
                  <dt>Cards</dt>
                  <dd className="num text-ink" data-testid="hunt-cards">
                    {cardsHeld}
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
                  {sealed.map((pack) => (
                    <Button
                      key={pack.packId.toString()}
                      variant="secondary"
                      className="w-full"
                      disabled={busy}
                      onClick={() => openOne.mutate(pack)}
                    >
                      Open {view.tiers[pack.tier]?.name ?? "Pack"} #{pack.packId.toString()}
                    </Button>
                  ))}
                </div>
              ) : null}
              <ButtonLink to="/binder" variant="secondary" className="mt-auto">
                My Binder
              </ButtonLink>
            </>
          )}
        </Zone>
      </div>
    </div>
  );
}

/** The cards a pack drew, the wanted one marked. */
function RevealGrid({ reveal }: { reveal: Reveal }) {
  const wanted = huntPlayer(reveal.target);
  return (
    <section className="flex flex-col gap-4" aria-label="Your pack" data-testid="hunt-reveal">
      {reveal.found ? (
        <Notice>
          You found {wanted?.player.name ?? "the wanted player"}. The prize is yours: claim it on the right.
        </Notice>
      ) : (
        <p className="t-body-strong">
          No {wanted ? surname(wanted.player.name) : "wanted card"} in this one.{" "}
          {reveal.players.length === 1 ? "1 card" : `${reveal.players.length} cards`} to your binder.
        </p>
      )}
      <ul className="grid grid-cols-3 gap-3 tab:grid-cols-4 desk:grid-cols-6">
        {reveal.players.map((playerId, index) => {
          const entry = huntPlayer(playerId);
          if (!entry) return null;
          const hit = playerId === reveal.target;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: a pack can hold the same player twice
            <li key={`${playerId}-${index}`} className="relative">
              <PlayerHoloCard
                player={entry.player}
                team={entry.team}
                rarity={hit ? "legendary" : "rare"}
                label={hit ? "Wanted" : entry.team.code}
                compact
              />
              {hit ? (
                <PickBadge label="Found" className="absolute -top-2.5 left-1/2 z-10 -translate-x-1/2" />
              ) : null}
            </li>
          );
        })}
      </ul>
      <Badge tone="cyan" className="self-start">
        {reveal.pack ? `Pack #${reveal.pack.packId.toString()}` : "New pack"}
      </Badge>
    </section>
  );
}

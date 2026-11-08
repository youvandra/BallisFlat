import { product } from "@app/config/constants";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { type CSSProperties, useState } from "react";
import { PackRip } from "../../components/playmat/framer";
import { PackLoader } from "../../components/playmat/PackLoader";
import { PickBadge } from "../../components/playmat/PickBadge";
import { PlayerHoloCard, positionNames } from "../../components/playmat/PlayerHoloCard";
import { Zone } from "../../components/playmat/Zone";
import { Button } from "../../components/ui/Button";
import { ButtonLink } from "../../components/ui/ButtonLink";
import { Logo } from "../../components/ui/Logo";
import { Notice } from "../../components/ui/Notice";
import { StepLine } from "../../components/ui/StepLine";
import { type PackFinish, packFoil } from "../../framer/PackRip";
import { useWallet } from "../../hooks/use-wallet";
import { playerArtUrl } from "../../lib/art";
import { formatPercent, formatWif, shortHash, surname } from "../../lib/format";
import { errorSentence } from "../../lib/game/errors";
import { facts, txUrl } from "../../lib/game/facts";
import { huntPlayer, tierKeys, useHunt, useHuntPacks } from "../../lib/game/hunt";
import { useGame } from "../../lib/game/queries";
import type { HuntRound, HuntStep, HuntTier, HuntView } from "../../lib/game/types";
import { palette } from "../../lib/palette";
import { ConnectWallet } from "../connect/ConnectWallet";

/** Chance that a pack of `cards` holds the wanted player, drawing uniformly from `poolSize` players. */
function findChance(cards: number, poolSize: number): number {
  if (poolSize <= 0) return 0;
  return 1 - (1 - 1 / poolSize) ** cards;
}

/** A pack drawn on chain, waiting to be torn, or torn and dealt. */
type Opened = { tier: HuntTier; packId: bigint; players: number[]; found: boolean; torn: boolean };

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
              One wanted player, a prize from the Ball is Flat team, and the first pack that finds him wins
              it.
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
  const [steps, setSteps] = useState<HuntStep[]>([]);
  const [step, setStep] = useState<HuntStep | null>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  // HuntPage renders this only with a round.
  const round = view.round as HuntRound;
  const wanted = huntPlayer(round.target);
  const isOpen = round.status === "Open";
  const current = account.data;

  const draw = useMutation({
    mutationFn: async ({ tier, packId }: { tier: HuntTier; packId?: bigint }) => {
      setOpened(null);
      let id = packId;
      if (id === undefined) {
        setSteps(["approve", "buy", "seal", "open"]);
        id = (await client.buyHuntPack(tier.id, setStep)).packId;
      } else {
        setSteps(["seal", "open"]);
      }
      const result = await client.openHuntPack(id, setStep);
      return { tier, packId: id, players: result.players, found: result.found, torn: false };
    },
    onSuccess: async (result) => {
      setOpened(result);
      await queryClient.invalidateQueries();
    },
    onSettled: () => setStep(null),
  });

  const sealed = (packs.data ?? []).filter((pack) => !pack.opened);
  const cardsHeld = (packs.data ?? []).reduce((total, pack) => total + pack.players.length, 0);
  const myWins = view.history.filter(
    (r) => r.status === "Won" && current && r.winner?.toLowerCase() === current.address.toLowerCase(),
  );

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
            <p className="t-zone">Prize</p>
            <p className="t-stat num" data-testid="hunt-prize">
              {formatWif(round.prize)}
            </p>
            <p className="t-small">$WIF from the {product.name} team</p>
          </div>
          {round.status === "Won" && round.winner ? (
            <Notice>
              Found by <span className="num">{shortHash(round.winner)}</span>.{" "}
              {round.paid ? "Prize paid." : "Prize on its way."} The next poster goes up soon.
            </Notice>
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
              Every pack draws from all {round.poolSize} players in the November squads. The first pack that
              holds {wanted?.player.name ?? "him"} wins{" "}
              <span className="num text-ink">{formatWif(round.prize)} $WIF</span>, paid by the {product.name}{" "}
              team. {formatPercent(view.burnBps / 10_000)} of every pack burns.
            </p>
          </div>

          {opened ? (
            <PackOpening
              opened={opened}
              target={round.target}
              onTorn={() => setOpened({ ...opened, torn: true })}
            />
          ) : null}

          {draw.isPending ? (
            <div className="flex flex-col gap-3">
              <StepLine steps={steps} current={step} labels={{ buy: "Buy Pack" }} />
              {step === "seal" ? (
                <p className="t-small">The draw uses the next block, so nobody sees it before you pay.</p>
              ) : null}
            </div>
          ) : null}
          {draw.isError ? <Notice tone="danger">{errorSentence(draw.error)}</Notice> : null}

          <ul className="grid grid-cols-1 gap-5 tab:grid-cols-3" aria-label="Packs">
            {view.tiers.map((tier) => (
              <li key={tier.id} className="flex flex-col gap-3">
                <TierPack tier={tier} round={round.id} />
                <div className="flex items-baseline justify-between gap-2">
                  <p className="t-body-strong num">{formatWif(tier.price)} $WIF</p>
                  <p className="t-small num">
                    {formatPercent(findChance(tier.cards, round.poolSize))} to find
                  </p>
                </div>
                <Button
                  className="w-full"
                  variant={tier.id === 2 ? "primary" : "secondary"}
                  disabled={!isOpen || draw.isPending || !current?.isRightChain || current.wif < tier.price}
                  onClick={() => draw.mutate({ tier })}
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
              {myWins.map((win) => (
                <div key={win.id} className="flex flex-col gap-2" data-testid="hunt-win">
                  <p className="t-zone">Round {win.id} win</p>
                  <p className="t-stat num">{formatWif(win.prize)}</p>
                  <p className="t-small">
                    {win.paid
                      ? "$WIF paid to this wallet."
                      : `$WIF from the ${product.name} team, sent to this wallet by transfer.`}
                  </p>
                  {win.payment && client.mode === "chain" ? (
                    <a href={txUrl(win.payment)} target="_blank" rel="noreferrer" className="text-link">
                      Payment <ArrowUpRight size={14} strokeWidth={2} aria-hidden />
                    </a>
                  ) : win.payment ? (
                    <p className="t-small num">Payment {shortHash(win.payment)}</p>
                  ) : null}
                </div>
              ))}
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

/** A tier's sealed pack: Silver in Ink, Gold in Note, Diamond in cyan over pink. */
function TierPack({ tier, round }: { tier: HuntTier; round: number }) {
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
      <span className="badge mt-2">Hunt {round}</span>
    </span>
  );
}

/**
 * The drawn pack, torn with the landing's own Pack Rip (drag across the top). The card that rises is the
 * wanted one when the pack found him; then every card is dealt out of the pack one after another.
 */
function PackOpening({ opened, target, onTorn }: { opened: Opened; target: number; onTorn: () => void }) {
  const ink = palette();
  const hit = opened.players.find((id) => id === target);
  const lead = huntPlayer(hit ?? opened.players[0] ?? target);
  const wanted = huntPlayer(target);
  const tierInk = [ink.ink, ink.note, ink.cyan][opened.tier.id] ?? ink.pink;

  if (!opened.torn && lead) {
    return (
      <section className="flex flex-col gap-3" aria-label="Your pack" data-testid="hunt-pack">
        <p className="t-body-strong">Your {opened.tier.name} pack is drawn. Tear it open.</p>
        <div className="relative h-140 w-full">
          <PackRip
            key={opened.packId.toString()}
            finish={opened.tier.name as PackFinish}
            packTitle={opened.tier.name}
            packLogo
            packSubtitle={`${opened.tier.cards} cards, pack #${opened.packId.toString()}`}
            badge={`Find ${wanted ? surname(wanted.player.name) : "him"}`}
            hint="Drag across the top to open"
            showReset={false}
            cardRarityLabel={hit ? "Wanted" : lead.team.code}
            onReveal={() => window.setTimeout(onTorn, 900)}
            soundToggle={false}
            cardImage={{ src: playerArtUrl(lead.player, lead.team), alt: lead.player.name }}
            cardName={surname(lead.player.name)}
            cardSubName={lead.player.name}
            cardNumber={`1/${opened.players.length}`}
            cardType={positionNames[lead.player.position]}
            cardYear={opened.tier.name}
            canvasState="sealed"
            ink={ink.mat}
            hintColor={ink.graphite}
            shadow="rgba(0, 0, 0, 0)"
            titleScale={1}
            printShadow={tierInk}
            printOffset={14}
            sound
            handCount={0}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4" aria-label="Your cards" data-testid="hunt-reveal">
      {opened.found ? (
        <Notice>
          You found {wanted?.player.name ?? "the wanted player"}. The {product.name} team sends the prize to
          this wallet by transfer and posts the receipt here.
        </Notice>
      ) : (
        <p className="t-body-strong">
          No {wanted ? surname(wanted.player.name) : "wanted card"} in this one.{" "}
          {opened.players.length === 1 ? "1 card" : `${opened.players.length} cards`} to your binder.
        </p>
      )}
      <ul className="grid grid-cols-3 gap-3 tab:grid-cols-4 desk:grid-cols-6">
        {opened.players.map((playerId, index) => {
          const entry = huntPlayer(playerId);
          if (!entry) return null;
          const isHit = playerId === target;
          return (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: a pack can hold the same player twice
              key={`${playerId}-${index}`}
              className="hunt-deal relative"
              style={{ "--deal-index": index } as CSSProperties}
            >
              <PlayerHoloCard
                player={entry.player}
                team={entry.team}
                rarity={isHit ? "legendary" : "rare"}
                label={isHit ? "Wanted" : entry.team.code}
                compact
              />
              {isHit ? (
                <PickBadge label="Found" className="absolute -top-2.5 left-1/2 z-10 -translate-x-1/2" />
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

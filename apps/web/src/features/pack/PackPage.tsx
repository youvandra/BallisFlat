import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, RotateCw } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router";
import { PackRip } from "../../components/playmat/framer";
import { MatchSleeve } from "../../components/playmat/MatchSleeve";
import { PackLoader } from "../../components/playmat/PackLoader";
import { PlayerHoloCard, positionNames } from "../../components/playmat/PlayerHoloCard";
import { Zone } from "../../components/playmat/Zone";
import { ArrowLink } from "../../components/ui/ArrowLink";
import { ButtonLink } from "../../components/ui/ButtonLink";
import { Notice } from "../../components/ui/Notice";
import { TextButton } from "../../components/ui/TextButton";
import { playerArtUrl } from "../../lib/art";
import { env } from "../../lib/env";
import { formatKickoff, surname } from "../../lib/format";
import { errorSentence } from "../../lib/game/errors";
import { fixtureBySlug, matchdayLabel, matchName, playerOf } from "../../lib/game/fixtures";
import { useOpened } from "../../lib/game/opened";
import { useAccount, useGame, useMyCards, useOpenCard } from "../../lib/game/queries";
import { sleeveCodes } from "../../lib/game/sleeve";
import { palette } from "../../lib/palette";
import { WalletGate } from "../connect/WalletGate";

const hint = "Drag across the top to open";

function parseTokenId(raw: string | undefined): bigint | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  return BigInt(raw);
}

/** Opening is a signed record, so the pack asks for a wallet first. */
export function PackPage() {
  return (
    <WalletGate label="Pack" title="Connect to open this pack" line="Your pack is in your wallet.">
      <Pack />
    </WalletGate>
  );
}

/** The pack, opened with the landing's own Pack Rip: drag across the top, the card rises out. */
function Pack() {
  const { slug = "", tokenId: rawTokenId } = useParams();
  const client = useGame();
  const fixture = fixtureBySlug(slug);
  const tokenId = parseTokenId(rawTokenId);
  const account = useAccount();
  const mine = useMyCards(account.data);
  const key = rawTokenId ?? "";
  const ink = palette();
  const openedHere = useOpened(key || null);
  const openCard = useOpenCard();
  // Torn on this visit: the Pack Rip keeps showing its own reveal.
  const [tornHere, setTornHere] = useState(false);

  const onReveal = () => {
    setTornHere(true);
    if (tokenId !== null) openCard.open(tokenId);
  };

  const card = useQuery({
    queryKey: ["pack", slug, key, mine.isSuccess],
    enabled: Boolean(fixture && tokenId !== null),
    queryFn: async () => {
      if (!fixture || tokenId === null) throw new Error("Unknown card");
      const owned = mine.data?.find((item) => item.tokenId === tokenId);
      const info = owned ?? (await client.cardInfo(tokenId));
      const match = await client.matchInfo(info.matchId);
      return {
        ...info,
        total: match.cards,
        mintedAt: owned?.mintedAt ?? null,
        opened: owned?.opened ?? false,
      };
    },
  });

  if (!fixture || tokenId === null) {
    return (
      <div className="playmat">
        <div className="playmat-col col-fill">
          <Zone label="Field" field className="items-start gap-4 p-9">
            <h1 className="t-heading">No card at this address</h1>
            <ButtonLink to="/binder">Go to Your Binder</ButtonLink>
          </Zone>
        </div>
      </div>
    );
  }

  // Opened before, here or anywhere: the card is shown straight away, never the sealed pack again.
  const openedBefore = !tornHere && (openedHere || Boolean(card.data?.opened));
  const opened = openedBefore || tornHere;
  const player = card.data ? playerOf(fixture, card.data.playerId) : undefined;
  const team = player?.side === "away" ? fixture.away : fixture.home;
  const kickoff = Math.floor(Date.parse(fixture.kickoff) / 1000);
  const shareUrl = `${env.VITE_SITE_URL.replace(/\/$/, "")}/m/${fixture.slug}`;
  const shareText = player
    ? `I picked ${player.name} as man of the match in ${matchName(fixture)}. Card #${card.data?.serial} on Ball is Flat.`
    : "";
  const cardNumber = card.data ? `#${card.data.serial}/${card.data.total}` : "";

  return (
    <div className="playmat">
      <div className="playmat-col col-case hide-tablet">
        <Zone label="Match" field className="items-center justify-center gap-5.5 px-5 pt-7.5 pb-5">
          <MatchSleeve fixture={fixture} />
          <p className="t-small text-center">Kickoff {formatKickoff(kickoff)}</p>
        </Zone>
      </div>

      <div className="playmat-col col-fill phone-first">
        <Zone label="Field" field className="items-center justify-center">
          <div className="mat-art" aria-hidden />
          <div className="relative z-4 flex flex-col gap-0.5 self-stretch px-5 pt-6">
            <p className="t-zone">{matchdayLabel(fixture)}</p>
            <h1 className="t-title">{opened ? "Your card is out" : "Your pack is here"}</h1>
          </div>
          <div className="relative z-3 grid w-full flex-1 place-items-center self-stretch max-tab:h-140 max-tab:flex-none">
            {card.isPending ? (
              <PackLoader label="Finding your pack…" />
            ) : card.isError || !card.data || !player ? (
              <Notice tone="danger" className="mx-5">
                Card not found. It may be claimed.
              </Notice>
            ) : openedBefore ? (
              <div className="w-67.5">
                <PlayerHoloCard
                  player={player}
                  team={team}
                  rarity="legendary"
                  label="Your Pick"
                  number={cardNumber}
                  maxTilt={10}
                />
              </div>
            ) : (
              <div className="absolute inset-0">
                <PackRip
                  packTitle={sleeveCodes(fixture)}
                  packSubtitle={`${matchdayLabel(fixture)}, ${formatKickoff(kickoff)}`}
                  badge="One MVP in every match"
                  hint={hint}
                  showReset={false}
                  cardRarityLabel="Your Pick"
                  onReveal={onReveal}
                  soundToggle={false}
                  cardImage={{
                    src: playerArtUrl(player, team),
                    alt: `${team.code} number ${player.number}`,
                  }}
                  cardName={surname(player.name)}
                  cardSubName={player.name}
                  cardNumber={cardNumber}
                  cardType={positionNames[player.position]}
                  cardYear={sleeveCodes(fixture)}
                  canvasState="sealed"
                  ink={ink.mat}
                  hintColor={ink.graphite}
                  shadow="rgba(0, 0, 0, 0)"
                  titleScale={1}
                  printShadow={ink.pink}
                  printOffset={14}
                  sound
                  handCount={0}
                />
              </div>
            )}
          </div>
        </Zone>
      </div>

      <div className="playmat-col col-side">
        <Zone label="Card" className="gap-4 px-4.5 pt-7.5 pb-4.5">
          {opened && card.data && player ? (
            <>
              <div className="flex flex-col gap-1">
                <p className="t-title">{player.name}</p>
                <p className="t-small">
                  {positionNames[player.position]}, {team.name}
                </p>
              </div>
              {openCard.error ? (
                <Notice tone="warn">
                  {errorSentence(openCard.error)} The card shows as open here; the record did not save.{" "}
                  <TextButton icon={RotateCw} onClick={openCard.retry}>
                    Try Again
                  </TextButton>
                </Notice>
              ) : null}
              <p className="t-body-strong num" data-testid="serial-line">
                Card #{card.data.serial} of {card.data.total}
              </p>
              <dl className="t-small flex flex-col gap-1 border-y border-line-soft py-3">
                <div className="flex justify-between gap-3">
                  <dt>Token</dt>
                  <dd className="num text-ink">{key}</dd>
                </div>
                {card.data.mintedAt ? (
                  <div className="flex justify-between gap-3">
                    <dt>Minted</dt>
                    <dd className="num text-ink">{formatKickoff(card.data.mintedAt)}</dd>
                  </div>
                ) : null}
              </dl>
              <div className="mt-auto flex flex-col gap-3">
                {shareText ? (
                  <ButtonLink
                    to={`https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`}
                    variant="secondary"
                  >
                    Share <ArrowUpRight size={14} strokeWidth={2} aria-hidden />
                  </ButtonLink>
                ) : null}
                <ButtonLink to={`/m/${fixture.slug}`} variant="secondary">
                  <ArrowLeft size={14} strokeWidth={2} aria-hidden /> Back to the Match
                </ButtonLink>
                <ButtonLink to="/binder">My Binder</ButtonLink>
              </div>
            </>
          ) : (
            <>
              <p className="t-small">Tear the pack to see your card.</p>
              <ArrowLink to="/binder" className="mt-auto self-start">
                Keep it for later
              </ArrowLink>
            </>
          )}
        </Zone>
      </div>
    </div>
  );
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ArrowUpRight, RotateCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { formatUnits } from "viem";
import { CardBackStack } from "../../components/playmat/CardBackStack";
import { PackLoader } from "../../components/playmat/PackLoader";
import { Zone } from "../../components/playmat/Zone";
import { ButtonLink } from "../../components/ui/ButtonLink";
import { Notice } from "../../components/ui/Notice";
import { TextButton } from "../../components/ui/TextButton";
import { useNow } from "../../hooks/use-now";
import { useWallet } from "../../hooks/use-wallet";
import { formatCountdown, formatKickoff, formatWif, shortHash } from "../../lib/format";
import { type BinderGroup, binderGroupOf, binderGroups } from "../../lib/game/binder";
import { errorSentence } from "../../lib/game/errors";
import { txUrl } from "../../lib/game/facts";
import { shownKickoff } from "../../lib/game/fixtures";
import { useOpenedSet } from "../../lib/game/opened";
import { type BinderCard, useBoard, useGame, useMyCards } from "../../lib/game/queries";
import { sleeveCodes } from "../../lib/game/sleeve";
import type { ClaimReceipt } from "../../lib/game/types";
import { WalletGate } from "../connect/WalletGate";
import { BinderSlot } from "./BinderSlot";
import { SellSheet } from "./SellSheet";

const groupNotes: Record<BinderGroup, string> = {
  Claim: "Burn to take your share.",
  Sealed: "Open it, or sell before kickoff.",
  Waiting: "Result pending.",
  Missed: "Kept as your record.",
  Refund: "Match called off.",
  Claimed: "Paid out.",
};

// Legend swatches (Framer Chip vnKovtIz8) come in Pink, cyan and Note only; the shelf name carries the meaning.
const groupChips: Record<BinderGroup, string> = {
  Claim: "bg-pink",
  Sealed: "bg-note",
  Waiting: "bg-cyan",
  Missed: "bg-cyan",
  Refund: "bg-note",
  Claimed: "bg-pink",
};

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

// Matches the squash-burn keyframes in app.css.
const burnMs = 1700;

interface Receipt extends ClaimReceipt {
  kind: "claimed" | "refunded";
  serial: number;
}

/** What the binder holds, beside the connect gate: the six shelves and what each one is for. */
function ShelfKey() {
  return (
    <Zone label="Shelves" className="gap-3.5 px-4.5 pt-7.5 pb-4.5">
      <ul className="flex flex-col gap-3">
        {binderGroups.map((group) => (
          <li key={group} className="flex items-start gap-3">
            <span className={`swatch mt-0.5 ${groupChips[group]}`} aria-hidden />
            <span className="flex flex-col gap-0.5">
              <span className="t-body-strong">{group}</span>
              <span className="t-small">{groupNotes[group]}</span>
            </span>
          </li>
        ))}
      </ul>
    </Zone>
  );
}

/** The binder needs a wallet: until one is on Robinhood Chain the page shows the connect gate. */
export function BinderPage() {
  return (
    <WalletGate
      label="Binder"
      title="Connect to open your binder"
      line="Your cards live in your wallet."
      aside={<ShelfKey />}
    >
      <Binder />
    </WalletGate>
  );
}

function Binder() {
  const client = useGame();
  const queryClient = useQueryClient();
  const { account } = useWallet();
  const cards = useMyCards(account.data);
  const openedSet = useOpenedSet();
  const [sellingId, setSellingId] = useState<bigint | null>(null);
  const selling = cards.data?.find((card) => card.tokenId === sellingId) ?? null;
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  // The burned card plays its animation on the shelf it was claimed from, then moves to Claimed.
  const [burning, setBurning] = useState<{ tokenId: bigint; group: BinderGroup } | null>(null);
  useEffect(() => {
    if (!burning) return;
    const timer = window.setTimeout(() => setBurning(null), burnMs);
    return () => window.clearTimeout(timer);
  }, [burning]);

  const burn = useMutation({
    mutationFn: async (card: BinderCard) => {
      const group = binderGroupOf(card, true);
      const kind = group === "Refund" ? "refunded" : "claimed";
      const result =
        kind === "claimed" ? await client.claim(card.tokenId) : await client.refund(card.tokenId);
      return { ...result, kind, group, serial: card.serial, tokenId: card.tokenId } as const;
    },
    onSuccess: async (result) => {
      setBurning({ tokenId: result.tokenId, group: result.group });
      setReceipt(result);
      await queryClient.invalidateQueries();
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<BinderGroup, BinderCard[]>(binderGroups.map((group) => [group, []]));
    for (const card of cards.data ?? []) {
      const isOpen = card.opened || openedSet.has(String(card.tokenId)) || Boolean(card.burned);
      const group = burning?.tokenId === card.tokenId ? burning.group : binderGroupOf(card, isOpen);
      map.get(group)?.push(card);
    }
    return map;
  }, [cards.data, burning, openedSet]);

  const board = useBoard();
  const now = useNow();
  const upcoming = (board.data ?? []).filter((view) => view.state === "Open").slice(0, 3);
  const current = account.data;
  const total = cards.data?.length ?? 0;

  const shelves = binderGroups.flatMap((group) => {
    const shelf = grouped.get(group) ?? [];
    return shelf.length ? [{ group, shelf }] : [];
  });

  return (
    <div className="playmat">
      <div className="playmat-col col-side">
        <Zone label="Binder" className="gap-3.5 px-4.5 pt-7.5 pb-4.5">
          <h1 className="t-heading">Your binder</h1>
          <p className="t-small">Every card you picked, sorted by what you can do with it.</p>
          <ul className="flex flex-col pt-2">
            {binderGroups.map((group) => (
              <li key={group}>
                <a
                  href={`#shelf-${group}`}
                  className="flex items-center gap-3 rounded-input py-2.5 transition-opacity hover:opacity-70"
                >
                  <span className={`swatch ${groupChips[group]}`} aria-hidden />
                  <span className="flex flex-1 items-center justify-between gap-2">
                    <span className="t-body-strong">{group}</span>
                    <span className="t-small num">{grouped.get(group)?.length ?? 0}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </Zone>
        <Zone
          label="Claimed"
          size="auto"
          className="flex-row! items-center gap-4.5 px-4.5 pt-5 pb-4 max-tab:hidden"
        >
          <CardBackStack />
          <p className="t-small min-w-0 flex-1">Paid-out cards stay here.</p>
        </Zone>
      </div>

      <div className="playmat-col col-fill">
        <div className="zone-scroll page-end flex flex-col gap-6.5 max-tab:pb-0 tab:-mt-2.5 tab:pt-2.5">
          {receipt ? (
            <Notice tone="info">
              <span className="num text-ink">
                {receipt.kind === "claimed" ? "Claimed" : "Refunded"} {formatWif(receipt.amount)} $WIF
              </span>{" "}
              for card #{receipt.serial}.{" "}
              {client.mode === "chain" ? (
                <a href={txUrl(receipt.hash)} target="_blank" rel="noreferrer" className="text-link">
                  View Transaction <ArrowUpRight size={14} strokeWidth={2} aria-hidden />
                </a>
              ) : (
                <span className="num">Demo transaction {shortHash(receipt.hash)}</span>
              )}
            </Notice>
          ) : null}
          {burn.isError ? <Notice tone="danger">{errorSentence(burn.error)}</Notice> : null}

          {account.isPending || (current && cards.isPending) ? (
            <Zone label="Cards" size="auto" className="px-6 pt-7 pb-7">
              <PackLoader label="Opening your binder…" />
            </Zone>
          ) : cards.isError ? (
            <Notice tone="danger">
              Your cards did not load.{" "}
              <TextButton icon={RotateCw} onClick={() => cards.refetch()}>
                Try Again
              </TextButton>
            </Notice>
          ) : total === 0 ? (
            <Zone label="Cards" size="auto" className="items-start gap-4 px-6 pt-7 pb-7">
              <p className="t-small">No cards yet. Pick a player in a match to mint your first one.</p>
              <ButtonLink to="/matches">Go to Matches</ButtonLink>
            </Zone>
          ) : (
            shelves.map(({ group, shelf }) => (
              <Zone
                key={group}
                label={`${group} · ${shelf.length}`}
                size="auto"
                className="gap-4 px-6 pt-7 pb-7 max-tab:px-3"
                labelledBy={`shelf-${group}`}
              >
                <h2 id={`shelf-${group}`} className="t-small">
                  {groupNotes[group]}
                </h2>
                <ul className="grid-binder">
                  {shelf.map((card) => (
                    <li key={String(card.tokenId)}>
                      <BinderSlot
                        card={card}
                        group={group}
                        justClaimed={burning?.tokenId === card.tokenId}
                        busy={burn.isPending && burn.variables?.tokenId === card.tokenId}
                        onBurn={() => burn.mutate(card)}
                        onSell={() => setSellingId(card.tokenId)}
                      />
                    </li>
                  ))}
                </ul>
              </Zone>
            ))
          )}
        </div>
      </div>

      <div className="playmat-col col-side hide-tablet">
        <Zone label="Wallet" size="auto" className="gap-1 px-4.5 pt-7.5 pb-4.5">
          {current ? (
            <>
              <p className="t-stat num">{whole.format(Math.floor(Number(formatUnits(current.wif, 18))))}</p>
              <p className="t-small">$WIF Balance</p>
              <p className="t-small mt-2 flex items-baseline justify-between gap-2">
                <span>{client.mode === "mock" ? "Demo Wallet" : "Wallet"}</span>
                <span className="num text-ink">{shortHash(current.address)}</span>
              </p>
            </>
          ) : (
            <p className="t-small">No wallet connected.</p>
          )}
        </Zone>
        {upcoming.length > 0 ? (
          <Zone label="Next Kickoff" className="gap-1 px-4.5 pt-7.5 pb-4.5">
            <ul className="flex flex-col">
              {upcoming.map((view) => (
                <li key={view.fixture.slug} className="border-b border-line-soft last:border-0">
                  <Link
                    to={`/m/${view.fixture.slug}`}
                    className="flex min-h-14 items-center justify-between gap-3 rounded-input py-2 transition-opacity hover:opacity-70"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="t-body-strong">{sleeveCodes(view.fixture)}</span>
                        <span className="t-small num whitespace-nowrap text-ink">
                          {formatCountdown(view.info.kickoff - now)}
                        </span>
                      </span>
                      <span className="t-small num whitespace-nowrap">
                        {formatKickoff(shownKickoff(view.fixture, view.info.kickoff))}
                      </span>
                    </span>
                    <ArrowRight size={14} strokeWidth={2} className="flex-none" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </Zone>
        ) : null}
      </div>
      <SellSheet card={selling} onClose={() => setSellingId(null)} />
    </div>
  );
}

import { hunt as huntConfig, product } from "@app/config/constants";
import { parseAllowlist } from "@app/core/allowlist";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { Button } from "../../components/ui/Button";
import { Notice } from "../../components/ui/Notice";
import { formatWif, shortHash } from "../../lib/format";
import { uploadAllowlist } from "../../lib/game/allowlist";
import { errorSentence } from "../../lib/game/errors";
import { listedFixtures } from "../../lib/game/fixtures";
import { huntPlayer, useHunt } from "../../lib/game/hunt";
import { MockGameClient } from "../../lib/game/mock-client";
import { useGame } from "../../lib/game/queries";
import type { Hash, HuntFind, HuntRound, HuntTier, HuntTierSpec, TxReceipt } from "../../lib/game/types";

/** Every player in the listed squads (the warm-up sheet is a subset), ascending by id, as startRound wants. */
function fullPool(): number[] {
  const ids = listedFixtures.filter((f) => !f.warmUp).flatMap((f) => f.players.map((p) => p.id));
  return [...new Set(ids)].sort((a, b) => a - b);
}

const isTxHash = (value: string): value is Hash => /^0x[0-9a-fA-F]{64}$/.test(value.trim());
const toWei = (value: string): bigint | null =>
  /^\d+(\.\d+)?$/.test(value.trim()) ? parseUnits(value.trim(), 18) : null;
const toInt = (value: string): number | null => (/^\d+$/.test(value.trim()) ? Number(value.trim()) : null);
const wholeWif = (wei: bigint) => formatUnits(wei, 18).replace(/\.0$/, "");

function useHuntAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (run: () => Promise<TxReceipt>) => run(),
    onSettled: () => queryClient.invalidateQueries(),
  });
}

/** One find in the payout queue: who to pay, how much, and the receipt once it is paid. */
function Payout({ round, find }: { round: HuntRound; find: HuntFind }) {
  const client = useGame();
  const action = useHuntAction();
  const [hash, setHash] = useState("");
  const wanted = huntPlayer(round.target);
  return (
    <li
      className="surface-card flex flex-col gap-3 rounded-card bg-card p-4 shadow-result"
      data-testid="payout"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="t-title">
          Round {round.id}, find {find.index + 1}: {wanted?.player.name ?? `#${round.target}`}
        </p>
        <p className="t-body-strong num">{formatWif(round.prizeEach)} $WIF</p>
      </div>
      <dl className="t-small grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt>Winner</dt>
        <dd className="num break-all text-ink">{find.winner}</dd>
        <dt>Pack</dt>
        <dd className="num text-ink">
          #{find.packId.toString()}, card {find.slot + 1}
        </dd>
        <dt>Status</dt>
        <dd className={find.paid ? "text-cyan" : "text-pink"}>
          {find.paid
            ? `Paid, ${shortHash(find.payment ?? "")}`
            : find.claimed
              ? "Claimed, waiting for your transfer"
              : "Unpaid, not claimed yet"}
        </dd>
      </dl>
      {find.paid ? null : (
        <>
          <p className="t-small">
            Send {formatWif(round.prizeEach)} $WIF to the winner from the {product.name} wallet, then paste
            the transfer's transaction hash.
          </p>
          <label className="t-small flex flex-col gap-1">
            Transfer transaction hash
            <input
              className="field-input"
              value={hash}
              placeholder="0x…"
              onChange={(event) => setHash(event.target.value)}
              autoComplete="off"
            />
          </label>
          <Button
            disabled={!isTxHash(hash) || action.isPending}
            onClick={() =>
              action.mutate(() => client.markHuntPaid(round.id, find.index, hash.trim() as Hash))
            }
          >
            Mark Paid
          </Button>
        </>
      )}
      {action.isError ? <Notice tone="danger">{errorSentence(action.error)}</Notice> : null}
    </li>
  );
}

/**
 * One tier of the live round: price and cards, or an allowlist (one pack per listed wallet; price 0 makes
 * it a free giveaway). The list is stored with the API so every listed wallet can fetch its proof.
 */
function TierEditor({ tier, open }: { tier: HuntTier; open: boolean }) {
  const client = useGame();
  const action = useHuntAction();
  const [price, setPrice] = useState(wholeWif(tier.price));
  const [cards, setCards] = useState(String(tier.cards));
  const [gated, setGated] = useState(Boolean(tier.allowRoot));
  const [list, setList] = useState("");
  const parsed = useMemo(() => parseAllowlist(list), [list]);
  const priceWei = toWei(price);
  const cardCount = toInt(cards);
  const valid =
    priceWei !== null &&
    cardCount !== null &&
    cardCount >= 1 &&
    cardCount <= 20 &&
    (gated ? parsed.wallets.length > 0 : priceWei > 0n);

  async function save(): Promise<TxReceipt> {
    if (priceWei === null || cardCount === null) throw new Error("bad tier");
    let allowRoot: Hash | null = null;
    if (gated) allowRoot = (await uploadAllowlist(parsed.wallets)).root;
    const spec: HuntTierSpec = { price: priceWei, cards: cardCount, allowRoot };
    return client.setHuntTier(tier.id, spec);
  }

  return (
    <li className="flex flex-col gap-2 border-line-soft border-t pt-3" data-testid={`tier-editor-${tier.id}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="t-body-strong">{tier.name}</p>
        <p className="t-small num">
          now {tier.price === 0n ? "free" : `${formatWif(tier.price)} $WIF`}, {tier.cards} cards
          {tier.allowRoot ? `, allowlist ${shortHash(tier.allowRoot)}` : ""}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="t-small flex flex-col gap-1">
          Price in $WIF
          <input
            className="field-input"
            inputMode="decimal"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
        </label>
        <label className="t-small flex flex-col gap-1">
          Cards per pack
          <input
            className="field-input"
            inputMode="numeric"
            value={cards}
            onChange={(event) => setCards(event.target.value)}
          />
        </label>
      </div>
      <label className="t-small flex items-center gap-2">
        <input type="checkbox" checked={gated} onChange={(event) => setGated(event.target.checked)} />
        Allowlist only, one pack per wallet (price 0 = free giveaway)
      </label>
      {gated ? (
        <>
          <label className="t-small flex flex-col gap-1">
            Wallets (paste addresses or a CSV)
            <textarea
              className="field-input min-h-24 font-mono"
              value={list}
              placeholder="0x…"
              onChange={(event) => setList(event.target.value)}
              data-testid={`tier-allowlist-${tier.id}`}
            />
          </label>
          <label className="t-small flex flex-col gap-1">
            Or upload a CSV
            <input
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) setList(await file.text());
              }}
            />
          </label>
          <p className="t-small num">
            {parsed.wallets.length} wallets
            {parsed.invalid.length > 0 ? `, ${parsed.invalid.length} not addresses (skipped)` : ""}
          </p>
        </>
      ) : null}
      <Button
        variant="secondary"
        disabled={!open || !valid || action.isPending}
        onClick={() => action.mutate(save)}
        data-testid={`tier-save-${tier.id}`}
      >
        {action.isPending ? "Saving…" : `Set ${tier.name}`}
      </Button>
      {action.isError ? <Notice tone="danger">{errorSentence(action.error)}</Notice> : null}
      {action.isSuccess ? <Notice>Saved. Transaction {shortHash(action.data.hash)}.</Notice> : null}
    </li>
  );
}

/** Owner tools for the Hunt: the live round and its tiers, the next deck, and the payout queue. */
export function HuntOps() {
  const client = useGame();
  const hunt = useHunt();
  const pool = useMemo(fullPool, []);
  const options = useMemo(
    () =>
      pool
        .map((id) => ({ id, entry: huntPlayer(id) }))
        .filter((option) => option.entry)
        .sort((a, b) =>
          `${a.entry?.team.code} ${a.entry?.player.name}`.localeCompare(
            `${b.entry?.team.code} ${b.entry?.player.name}`,
          ),
        ),
    [pool],
  );
  const [target, setTarget] = useState<number | null>(null);
  const [prize, setPrize] = useState(wholeWif(huntConfig.prizeEach));
  const [winners, setWinners] = useState(String(huntConfig.winners));
  const [supply, setSupply] = useState(String(huntConfig.supply));
  const [prices, setPrices] = useState(huntConfig.tiers.map((tier) => wholeWif(tier.price)));
  const action = useHuntAction();

  const view = hunt.data;
  if (hunt.isPending) return <p className="t-small">Loading the Hunt…</p>;
  if (!view?.available) return <Notice>No Hunt contract on this network.</Notice>;
  const round = view.round;
  const wanted = round ? huntPlayer(round.target) : undefined;
  const finds = view.history.flatMap((r) => r.finds.map((find) => ({ round: r, find })));
  const unpaid = finds.filter(({ find }) => !find.paid).length;
  const prizeWei = toWei(prize);
  const winnerCount = toInt(winners);
  const deck = toInt(supply);
  const tierPrices = prices.map(toWei);
  const deckValid =
    winnerCount !== null && deck !== null && winnerCount >= 1 && deck >= winnerCount && deck <= 4_000_000_000;

  return (
    <div className="flex flex-col gap-6">
      <section className="surface-card flex flex-col gap-3 rounded-card bg-card p-4 shadow-result">
        <h2 className="t-title">Live round</h2>
        {round ? (
          <dl className="t-small grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt>Round</dt>
            <dd className="num text-ink">{round.id}</dd>
            <dt>Wanted</dt>
            <dd className="text-ink">{wanted?.player.name ?? `#${round.target}`}</dd>
            <dt>Prize each</dt>
            <dd className="num text-ink">{formatWif(round.prizeEach)} $WIF</dd>
            <dt>Wanted cards</dt>
            <dd className="num text-ink">
              {round.winners}: {round.found} found, {round.lost} lost,{" "}
              {round.winners - round.found - round.lost} left
            </dd>
            <dt>Deck</dt>
            <dd className="num text-ink">
              {round.sold} sold, {round.drawn} drawn of {round.supply}
            </dd>
            <dt>Status</dt>
            <dd className="text-ink">{round.status}</dd>
            <dt>Packs</dt>
            <dd className="num text-ink">{round.packs}</dd>
            <dt>Treasury</dt>
            <dd className="num break-all text-ink">{view.treasury}</dd>
          </dl>
        ) : (
          <p className="t-small">No round yet.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={round?.status !== "Open" || action.isPending}
            onClick={() => action.mutate(() => client.closeHuntRound())}
          >
            Close Round
          </Button>
          {client instanceof MockGameClient ? (
            <Button
              variant="quiet"
              onClick={() => client.rigNextHuntPack()}
              disabled={round?.status !== "Open"}
            >
              Next Pack Finds Him (Demo)
            </Button>
          ) : null}
        </div>
      </section>

      {round ? (
        <section className="surface-card flex flex-col gap-3 rounded-card bg-card p-4 shadow-result">
          <h2 className="t-title">Packs this round</h2>
          <p className="t-small">Changes apply to packs bought after the transaction.</p>
          <ul className="flex flex-col gap-3">
            {round.tiers.map((tier) => (
              <TierEditor
                key={`${round.id}-${tier.id}-${tier.price}-${tier.cards}-${tier.allowRoot}`}
                tier={tier}
                open={round.status === "Open"}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <section className="surface-card flex flex-col gap-3 rounded-card bg-card p-4 shadow-result">
        <h2 className="t-title">Next deck</h2>
        <p className="t-small">
          Opens once the live round is done or closed. The rest of the deck draws from all {pool.length}{" "}
          players.
        </p>
        <label className="t-small flex flex-col gap-1">
          Wanted player
          <select
            className="field-input"
            value={target ?? ""}
            onChange={(event) => setTarget(event.target.value ? Number(event.target.value) : null)}
          >
            <option value="">Pick a player</option>
            {options.map(({ id, entry }) => (
              <option key={id} value={id}>
                {entry?.team.code} {entry?.player.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="t-small flex flex-col gap-1">
            Cards in deck
            <input
              className="field-input"
              inputMode="numeric"
              value={supply}
              onChange={(event) => setSupply(event.target.value)}
            />
          </label>
          <label className="t-small flex flex-col gap-1">
            Wanted cards
            <input
              className="field-input"
              inputMode="numeric"
              value={winners}
              onChange={(event) => setWinners(event.target.value)}
            />
          </label>
          <label className="t-small flex flex-col gap-1">
            Prize each, $WIF
            <input
              className="field-input"
              inputMode="decimal"
              value={prize}
              onChange={(event) => setPrize(event.target.value)}
            />
          </label>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {huntConfig.tiers.map((tier, index) => (
            <label key={tier.id} className="t-small flex flex-col gap-1">
              {tier.name} ({tier.cards} cards), $WIF
              <input
                className="field-input"
                inputMode="decimal"
                value={prices[index]}
                onChange={(event) =>
                  setPrices((current) =>
                    current.map((value, i) => (i === index ? event.target.value : value)),
                  )
                }
              />
            </label>
          ))}
        </div>
        <p className="t-small">
          You pay every prize by transfer. Set a free Silver allowlist after the round opens.
        </p>
        <Button
          disabled={
            target === null ||
            prizeWei === null ||
            !deckValid ||
            tierPrices.some((price) => price === null || price === 0n) ||
            round?.status === "Open" ||
            action.isPending
          }
          onClick={() =>
            target !== null &&
            prizeWei !== null &&
            winnerCount !== null &&
            deck !== null &&
            action.mutate(() =>
              client.startHuntRound({
                target,
                prizeEach: prizeWei,
                winners: winnerCount,
                supply: deck,
                pool,
                tiers: huntConfig.tiers.map((tier, index) => ({
                  price: tierPrices[index] ?? tier.price,
                  cards: tier.cards,
                  allowRoot: null,
                })),
              }),
            )
          }
        >
          Start Round
        </Button>
      </section>
      {action.isError ? <Notice tone="danger">{errorSentence(action.error)}</Notice> : null}
      {action.isSuccess ? <Notice>Done. Transaction {shortHash(action.data.hash)}.</Notice> : null}

      <section className="flex flex-col gap-3">
        <h2 className="t-title">Payouts{unpaid > 0 ? `, ${unpaid} to pay` : ""}</h2>
        {finds.length === 0 ? (
          <p className="t-small">No finds yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {finds.map(({ round: r, find }) => (
              <Payout key={`${r.id}-${find.index}`} round={r} find={find} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

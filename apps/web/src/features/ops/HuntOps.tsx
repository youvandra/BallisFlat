import { product } from "@app/config/constants";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { parseUnits } from "viem";
import { Button } from "../../components/ui/Button";
import { Notice } from "../../components/ui/Notice";
import { formatWif, shortHash } from "../../lib/format";
import { errorSentence } from "../../lib/game/errors";
import { listedFixtures } from "../../lib/game/fixtures";
import { huntPlayer, useHunt } from "../../lib/game/hunt";
import { MockGameClient } from "../../lib/game/mock-client";
import { useGame } from "../../lib/game/queries";
import type { Hash, HuntRound, TxReceipt } from "../../lib/game/types";

/** Every player in the listed squads (the warm-up sheet is a subset), ascending by id, as startRound wants. */
function fullPool(): number[] {
  const ids = listedFixtures.filter((f) => !f.warmUp).flatMap((f) => f.players.map((p) => p.id));
  return [...new Set(ids)].sort((a, b) => a - b);
}

const isTxHash = (value: string): value is Hash => /^0x[0-9a-fA-F]{64}$/.test(value.trim());

function useHuntAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (run: () => Promise<TxReceipt>) => run(),
    onSettled: () => queryClient.invalidateQueries(),
  });
}

/** One won round in the payout queue: who to pay, how much, and the receipt once it is paid. */
function Payout({ round }: { round: HuntRound }) {
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
          Round {round.id}: {wanted?.player.name ?? `#${round.target}`}
        </p>
        <p className="t-body-strong num">{formatWif(round.prize)} $WIF</p>
      </div>
      <dl className="t-small grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt>Winner</dt>
        <dd className="num break-all text-ink">{round.winner}</dd>
        <dt>Pack</dt>
        <dd className="num text-ink">#{round.winningPack?.toString()}</dd>
        <dt>Status</dt>
        <dd className={round.paid ? "text-cyan" : "text-pink"}>
          {round.paid ? `Paid, ${shortHash(round.payment ?? "")}` : "Unpaid"}
        </dd>
      </dl>
      {round.paid ? null : (
        <>
          <p className="t-small">
            Send {formatWif(round.prize)} $WIF to the winner from the {product.name} wallet, then paste the
            transfer's transaction hash.
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
            onClick={() => action.mutate(() => client.markHuntPaid(round.id, hash.trim() as Hash))}
          >
            Mark Paid
          </Button>
        </>
      )}
      {action.isError ? <Notice tone="danger">{errorSentence(action.error)}</Notice> : null}
    </li>
  );
}

/** Owner tools for the Hunt: the live round, the next poster, and the payout queue. */
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
  const [prize, setPrize] = useState("10000");
  const action = useHuntAction();

  const view = hunt.data;
  if (hunt.isPending) return <p className="t-small">Loading the Hunt…</p>;
  if (!view?.available) return <Notice>No Hunt contract on this network.</Notice>;
  const round = view.round;
  const wanted = round ? huntPlayer(round.target) : undefined;
  const won = view.history.filter((r) => r.status === "Won");
  const unpaid = won.filter((r) => !r.paid).length;
  const prizeWei = /^\d+(\.\d+)?$/.test(prize) ? parseUnits(prize, 18) : null;

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
            <dt>Prize</dt>
            <dd className="num text-ink">{formatWif(round.prize)} $WIF</dd>
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

      <section className="surface-card flex flex-col gap-3 rounded-card bg-card p-4 shadow-result">
        <h2 className="t-title">Next poster</h2>
        <p className="t-small">
          Opens once the live round is won or closed. Packs draw from all {pool.length} players.
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
        <label className="t-small flex flex-col gap-1">
          Prize in $WIF (you pay it by transfer)
          <input
            className="field-input"
            inputMode="decimal"
            value={prize}
            onChange={(event) => setPrize(event.target.value)}
          />
        </label>
        <Button
          disabled={target === null || prizeWei === null || round?.status === "Open" || action.isPending}
          onClick={() =>
            target !== null &&
            prizeWei !== null &&
            action.mutate(() => client.startHuntRound(target, prizeWei, pool))
          }
        >
          Start Round
        </Button>
      </section>
      {action.isError ? <Notice tone="danger">{errorSentence(action.error)}</Notice> : null}
      {action.isSuccess ? <Notice>Done. Transaction {shortHash(action.data.hash)}.</Notice> : null}

      <section className="flex flex-col gap-3">
        <h2 className="t-title">Payouts{unpaid > 0 ? `, ${unpaid} to pay` : ""}</h2>
        {won.length === 0 ? (
          <p className="t-small">No winners yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {won.map((r) => (
              <Payout key={r.id} round={r} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

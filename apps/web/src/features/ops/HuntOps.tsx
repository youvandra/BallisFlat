import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Notice } from "../../components/ui/Notice";
import { formatWif, shortHash } from "../../lib/format";
import { errorSentence } from "../../lib/game/errors";
import { listedFixtures } from "../../lib/game/fixtures";
import { huntPlayer, useHunt } from "../../lib/game/hunt";
import { useGame } from "../../lib/game/queries";
import type { TxReceipt } from "../../lib/game/types";

/** Every player in the listed squads (the warm-up sheet is a subset), ascending by id, as startRound wants. */
function fullPool(): number[] {
  const ids = listedFixtures.filter((f) => !f.warmUp).flatMap((f) => f.players.map((p) => p.id));
  return [...new Set(ids)].sort((a, b) => a - b);
}

/** Owner tools for the Hunt: close the round, name the next wanted player. */
export function HuntOps() {
  const client = useGame();
  const queryClient = useQueryClient();
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
  const action = useMutation({
    mutationFn: (run: () => Promise<TxReceipt>) => run(),
    onSettled: () => queryClient.invalidateQueries(),
  });

  const view = hunt.data;
  if (!view?.available) return <p className="t-small">No Hunt contract on this network.</p>;
  const round = view.round;
  const wanted = round ? huntPlayer(round.target) : undefined;

  return (
    <div className="flex flex-col gap-3">
      <p className="t-small">
        {round
          ? `Round ${round.id}: ${wanted?.player.name ?? `#${round.target}`}, ${round.status}, pot ${formatWif(round.pot)} $WIF, ${round.packs} packs.`
          : "No round yet."}{" "}
        Carry {formatWif(view.carry)} $WIF.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          disabled={round?.status !== "Open" || action.isPending}
          onClick={() => action.mutate(() => client.closeHuntRound())}
        >
          Close Round (Pot Carries Over)
        </Button>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="t-zone">Next wanted player</span>
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
      <Button
        disabled={target === null || round?.status === "Open" || action.isPending}
        onClick={() => target !== null && action.mutate(() => client.startHuntRound(target, pool))}
      >
        Start Round Across {pool.length} Players
      </Button>
      {action.isError ? <Notice tone="danger">{errorSentence(action.error)}</Notice> : null}
      {action.isSuccess ? <Notice>Done. Transaction {shortHash(action.data.hash)}.</Notice> : null}
    </div>
  );
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Zone } from "../../components/playmat/Zone";
import { Button } from "../../components/ui/Button";
import { Notice } from "../../components/ui/Notice";
import { StatePill } from "../../components/ui/StatePill";
import { useWallet } from "../../hooks/use-wallet";
import { apiUrl } from "../../lib/api";
import { formatKickoff, shortHash } from "../../lib/format";
import { errorSentence } from "../../lib/game/errors";
import { matchName, shownKickoff } from "../../lib/game/fixtures";
import { MockGameClient } from "../../lib/game/mock-client";
import { type MatchView, useBoard, useGame } from "../../lib/game/queries";
import { WalletGate } from "../connect/WalletGate";
import { AdminFixtures } from "./AdminFixtures";
import { HuntOps } from "./HuntOps";

function MatchOps({ view }: { view: MatchView }) {
  const client = useGame();
  const queryClient = useQueryClient();
  const [winners, setWinners] = useState<number[]>([]);
  const [source, setSource] = useState("");
  const action = useMutation({
    mutationFn: (run: () => Promise<{ hash: string }>) => run(),
    onSettled: () => queryClient.invalidateQueries(),
  });
  const id = view.fixture.id;
  const canPost = view.state === "Locked" || view.state === "Proposed";

  return (
    <details className="surface-card rounded-card bg-card p-4 shadow-result">
      <summary className="flex cursor-pointer items-center justify-between gap-3">
        <span className="t-title">
          #{id} {matchName(view.fixture)}
        </span>
        <StatePill state={view.state} />
      </summary>
      <div className="t-small mt-3 flex flex-col gap-3">
        <p>Kickoff {formatKickoff(shownKickoff(view.fixture, view.info.kickoff))}</p>
        {canPost ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              action.mutate(() => client.propose(id, winners, source));
            }}
          >
            <fieldset className="grid grid-cols-2 gap-1 sm:grid-cols-4">
              <legend className="mb-1">Top-rated player (several = tie)</legend>
              {view.fixture.players.map((player) => (
                <label key={player.id} className="flex items-center gap-2 text-ink">
                  <input
                    type="checkbox"
                    className="accent-pink"
                    checked={winners.includes(player.id)}
                    onChange={(event) =>
                      setWinners((list) =>
                        event.target.checked
                          ? [...list, player.id]
                          : list.filter((item) => item !== player.id),
                      )
                    }
                  />
                  {player.number} {player.name}
                </label>
              ))}
            </fieldset>
            <label className="flex flex-col gap-1">
              Source URL
              <input
                type="url"
                required
                value={source}
                onChange={(event) => setSource(event.target.value)}
                className="field-input"
              />
            </label>
            <Button type="submit" disabled={winners.length === 0 || action.isPending}>
              {view.state === "Proposed" ? "Correct Result" : "Post Result"}
            </Button>
          </form>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => action.mutate(() => client.finalize(id))}
            disabled={view.state !== "Proposed" || action.isPending}
          >
            Finalize
          </Button>
          <Button
            variant="secondary"
            onClick={() => action.mutate(() => client.voidMatch(id))}
            disabled={!(view.state === "Open" || canPost) || action.isPending}
          >
            Void Match
          </Button>
        </div>
        {action.isError ? <Notice tone="danger">{errorSentence(action.error)}</Notice> : null}
        {action.isSuccess ? <Notice>Done. Transaction {shortHash(action.data.hash)}.</Notice> : null}
      </div>
    </details>
  );
}

/** Every settler tool is a signed call, so the page asks for a wallet first. */
export function OpsPage() {
  return (
    <WalletGate label="Settler" title="Connect the settler wallet" line="Settler wallet only.">
      <Ops />
    </WalletGate>
  );
}

/** Settler tools. Not linked anywhere; the contract rejects every call from a non-settler anyway. */
function Ops() {
  const client = useGame();
  const { account } = useWallet();
  const board = useBoard();

  return (
    <div className="playmat">
      <div className="playmat-col col-fill">
        <Zone label="Settler" className="px-6 pt-7.5 pb-6">
          <div className="zone-scroll flex flex-col gap-4">
            <h1 className="t-heading">Settler tools</h1>
            {account.data && !account.data.isSettler ? (
              <Notice tone="warn">Not the settler wallet.</Notice>
            ) : null}
            {client instanceof MockGameClient ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => client.advance(2 * 3600)}>
                  Skip 2 Hours (Demo)
                </Button>
                <Button variant="secondary" onClick={() => client.advance(7 * 86_400)}>
                  Skip 7 Days (Demo)
                </Button>
                <Button variant="quiet" onClick={() => client.reset()}>
                  Reset Demo
                </Button>
              </div>
            ) : null}
            {(board.data ?? []).map((view) => (
              <MatchOps key={view.fixture.slug} view={view} />
            ))}
            <details className="surface-card rounded-card bg-card p-4 shadow-result">
              <summary className="t-title cursor-pointer">Owner: Hunt</summary>
              <div className="mt-4">
                <HuntOps />
              </div>
            </details>
            {apiUrl ? (
              <details className="surface-card rounded-card bg-card p-4 shadow-result">
                <summary className="t-title cursor-pointer">Owner: Fixtures and Listing</summary>
                <div className="mt-4">
                  <AdminFixtures />
                </div>
              </details>
            ) : null}
          </div>
        </Zone>
      </div>
    </div>
  );
}

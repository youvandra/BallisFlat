import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Notice } from "../../components/ui/Notice";
import { type ApiFixture, adminApi, adminToken, api } from "../../lib/api";
import { formatKickoff, shortHash } from "../../lib/format";
import { errorSentence } from "../../lib/game/errors";
import { facts } from "../../lib/game/facts";
import { useBoard, useGame } from "../../lib/game/queries";

type Position = "GK" | "DF" | "MF" | "FW";
type ListingArgs = { slug: string; kickoff: number; playerIds: number[] };
type Lister = {
  listMatch(listing: {
    kickoff: number;
    price: bigint;
    nextMatch: number;
    maxPerPlayer: number;
    playerIds: number[];
  }): Promise<{ hash: string; matchId: number }>;
};

const canList = (client: unknown): client is Lister =>
  typeof (client as Partial<Lister>).listMatch === "function";

type SquadSetter = { setPlayers(matchId: number, playerIds: number[]): Promise<{ hash: string }> };
const canSetPlayers = (client: unknown): client is SquadSetter =>
  typeof (client as Partial<SquadSetter>).setPlayers === "function";

type ApiSquadPlayer = {
  playerId: number;
  name: string;
  number: number;
  position: Position;
  side: "home" | "away";
};

const squadLines = (squad: ApiSquadPlayer[]) =>
  [...squad]
    .sort((a, b) => (a.side === b.side ? a.number - b.number : a.side === "home" ? -1 : 1))
    .map((p) => `${p.side}, ${p.number}, ${p.name}, ${p.position}`)
    .join("\n");

/** "home, 9, Harry Kane, FW" per line. Lines that do not parse are reported, not dropped. */
function parseSquad(text: string) {
  const players: { side: "home" | "away"; number: number; name: string; position: Position }[] = [];
  const bad: number[] = [];
  text.split("\n").forEach((line, index) => {
    if (!line.trim()) return;
    const [side, number, name, position] = line.split(",").map((part) => part.trim());
    const ok =
      (side === "home" || side === "away") &&
      Number.isInteger(Number(number)) &&
      Boolean(name) &&
      ["GK", "DF", "MF", "FW"].includes(position ?? "");
    if (!ok) bad.push(index + 1);
    else players.push({ side, number: Number(number), name: name as string, position: position as Position });
  });
  return { players, bad };
}

function TokenGate({ onReady }: { onReady: () => void }) {
  const [value, setValue] = useState(adminToken.get());
  const check = useMutation({
    mutationFn: async () => {
      adminToken.set(value.trim());
      await adminApi("/api/admin/check");
    },
    onSuccess: onReady,
    onError: () => adminToken.clear(),
  });
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        check.mutate();
      }}
    >
      <label className="t-small flex flex-col gap-1">
        Admin token
        <input
          type="password"
          autoComplete="off"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="field-input"
        />
      </label>
      <Button type="submit" disabled={!value.trim() || check.isPending}>
        Unlock Admin
      </Button>
      {check.isError ? <Notice tone="danger">{(check.error as Error).message}</Notice> : null}
    </form>
  );
}

function FixtureForm({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState({
    slug: "",
    competition: "",
    matchday: "1",
    kickoff: "",
    homeCode: "",
    homeName: "",
    homeColour: "",
    awayCode: "",
    awayName: "",
    awayColour: "",
    squadSourceUrl: "",
    squad: "",
  });
  const squad = parseSquad(form.squad);
  const colours = [form.homeColour, form.awayColour].every((value) => /^#[0-9a-f]{6}$/i.test(value));
  const save = useMutation({
    mutationFn: () =>
      adminApi<{ slug: string; created: number }>(`/api/admin/fixtures/${form.slug}`, {
        method: "PUT",
        body: {
          slug: form.slug,
          competition: form.competition,
          matchday: Number(form.matchday),
          kickoff: new Date(`${form.kickoff}Z`).toISOString(),
          home: { code: form.homeCode.toUpperCase(), name: form.homeName, colour: form.homeColour },
          away: { code: form.awayCode.toUpperCase(), name: form.awayName, colour: form.awayColour },
          squadSourceUrl: form.squadSourceUrl,
          squadReadOn: new Date().toISOString().slice(0, 10),
          players: squad.players,
        },
      }),
    onSuccess: onSaved,
  });
  const field = (key: keyof typeof form, label: string, type = "text") => (
    <label className="t-small flex flex-col gap-1">
      {label}
      <input
        type={type}
        required
        value={form[key]}
        onChange={(event) => setForm({ ...form, [key]: event.target.value })}
        className="field-input"
      />
    </label>
  );
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {field("slug", "Slug (england-v-croatia)")}
        {field("competition", "Competition")}
        {field("matchday", "Matchday", "number")}
        {field("kickoff", "Kickoff (UTC)", "datetime-local")}
        {field("homeCode", "Home code (ENG)")}
        {field("homeName", "Home name")}
        {field("awayCode", "Away code (CRO)")}
        {field("awayName", "Away name")}
        {field("homeColour", "Home kit colour (hex, e.g. white is FFFFFF with #)")}
        {field("awayColour", "Away kit colour (hex)")}
        {field("squadSourceUrl", "Squad source URL", "url")}
      </div>
      <label className="t-small flex flex-col gap-1">
        Squad, one per line: side, number, name, position
        <textarea
          rows={8}
          value={form.squad}
          onChange={(event) => setForm({ ...form, squad: event.target.value })}
          placeholder={"home, 1, Jordan Pickford, GK\naway, 10, Luka Modrić, MF"}
          className="field-input"
        />
      </label>
      {squad.bad.length ? (
        <Notice tone="warn">Lines that do not parse: {squad.bad.join(", ")}.</Notice>
      ) : null}
      <Button
        type="submit"
        disabled={save.isPending || !colours || squad.players.length < 2 || squad.bad.length > 0}
      >
        Save Fixture ({squad.players.length} players)
      </Button>
      {save.isError ? <Notice tone="danger">{(save.error as Error).message}</Notice> : null}
      {save.isSuccess ? (
        <Notice>
          Saved {save.data.slug}; {save.data.created} new people.
        </Notice>
      ) : null}
    </form>
  );
}

function Unlisted({ fixture }: { fixture: ApiFixture }) {
  const client = useGame();
  const board = useBoard();
  const queryClient = useQueryClient();
  // Roll an uncalled pot into the open match that kicks off next after this one, if there is one.
  const later = (board.data ?? [])
    .filter((view) => view.state === "Open" && view.info.kickoff > Date.parse(fixture.kickoff) / 1000)
    .sort((a, b) => a.info.kickoff - b.info.kickoff);
  const [nextMatch, setNextMatch] = useState(String(later[0]?.fixture.id ?? 0));
  const list = useMutation({
    mutationFn: async () => {
      if (!canList(client)) throw new Error("Listing needs the chain client.");
      const args = await adminApi<ListingArgs>(`/api/admin/fixtures/${fixture.slug}/listing`);
      const listed = await client.listMatch({
        kickoff: args.kickoff,
        price: facts.price,
        nextMatch: Number(nextMatch),
        maxPerPlayer: facts.maxPerPlayer,
        playerIds: args.playerIds,
      });
      // the indexer needs a moment to see the new match before the link can be checked
      for (let attempt = 0; ; attempt++) {
        try {
          await adminApi(`/api/admin/fixtures/${fixture.slug}/link`, {
            method: "POST",
            body: { matchId: String(listed.matchId) },
          });
          return listed;
        } catch (error) {
          if (attempt >= 10) throw error;
          await new Promise((done) => setTimeout(done, 1500));
        }
      }
    },
    onSettled: () => queryClient.invalidateQueries(),
  });
  return (
    <li className="surface-card flex flex-col gap-2 rounded-card bg-card p-4 shadow-result">
      <span className="t-title">{fixture.slug}</span>
      <span className="t-small">Kickoff {formatKickoff(Math.floor(Date.parse(fixture.kickoff) / 1000))}</span>
      <label className="t-small flex flex-col gap-1">
        Uncalled pot rolls into
        <select
          value={nextMatch}
          onChange={(event) => setNextMatch(event.target.value)}
          className="field-input"
        >
          <option value="0">Burn (No Match)</option>
          {later.map((view) => (
            <option key={view.fixture.id} value={view.fixture.id}>
              #{view.fixture.id} {view.fixture.slug}
            </option>
          ))}
        </select>
      </label>
      <Button onClick={() => list.mutate()} disabled={list.isPending}>
        {list.isPending ? "Listing…" : "List on Chain"}
      </Button>
      {list.isError ? <Notice tone="danger">{errorSentence(list.error)}</Notice> : null}
      {list.isSuccess ? (
        <Notice>
          Listed as #{list.data.matchId}, transaction {shortHash(list.data.hash)}. Reload to see it on the
          board.
        </Notice>
      ) : null}
    </li>
  );
}

/**
 * A listed match before kickoff: edit its squad, save it to the API, then send setPlayers from the owner
 * wallet. The API refuses to drop a player who already has cards.
 */
function ListedSquad({ fixture }: { fixture: ApiFixture }) {
  const client = useGame();
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ["admin-fixture", fixture.slug],
    queryFn: () => api<{ squad: ApiSquadPlayer[] }>(`/api/fixtures/${fixture.slug}`),
  });
  const [text, setText] = useState<string | null>(null);
  const value = text ?? (detail.data ? squadLines(detail.data.squad) : "");
  const squad = parseSquad(value);
  const update = useMutation({
    mutationFn: async () => {
      if (!canSetPlayers(client)) throw new Error("Squad updates need the chain client.");
      const saved = await adminApi<{ matchId: string; playerIds: number[]; created: number }>(
        `/api/admin/fixtures/${fixture.slug}/squad`,
        { method: "PUT", body: { players: squad.players } },
      );
      const sent = await client.setPlayers(Number(saved.matchId), saved.playerIds);
      return { ...sent, count: saved.playerIds.length, created: saved.created };
    },
    onSuccess: () => setText(null),
    onSettled: () => queryClient.invalidateQueries(),
  });
  return (
    <li className="surface-card flex flex-col gap-2 rounded-card bg-card p-4 shadow-result">
      <span className="t-title">
        #{fixture.matchId} {fixture.slug}
      </span>
      <span className="t-small">Kickoff {formatKickoff(Math.floor(Date.parse(fixture.kickoff) / 1000))}</span>
      <label className="t-small flex flex-col gap-1">
        Squad, one player per line: side, number, name, position
        <textarea
          className="field-input num min-h-40"
          value={value}
          onChange={(event) => setText(event.target.value)}
          data-testid={`squad-${fixture.slug}`}
        />
      </label>
      {squad.bad.length > 0 ? (
        <Notice tone="warn">Lines {squad.bad.join(", ")} do not read as side, number, name, position.</Notice>
      ) : null}
      <Button
        variant="secondary"
        onClick={() => update.mutate()}
        disabled={update.isPending || squad.bad.length > 0 || squad.players.length < 2 || text === null}
      >
        {update.isPending ? "Updating…" : "Update Squad on Chain"}
      </Button>
      {update.isError ? <Notice tone="danger">{errorSentence(update.error)}</Notice> : null}
      {update.isSuccess ? (
        <Notice>
          Squad is {update.data.count} players ({update.data.created} new people), transaction{" "}
          {shortHash(update.data.hash)}.
        </Notice>
      ) : null}
    </li>
  );
}

/** Owner tools: fixtures and squads live in the API; listing a match is a transaction from the owner wallet. */
export function AdminFixtures() {
  const [ready, setReady] = useState(false);
  const fixtures = useQuery({
    queryKey: ["admin-fixtures"],
    queryFn: () => api<ApiFixture[]>("/api/fixtures"),
    enabled: ready,
  });
  if (!ready) return <TokenGate onReady={() => setReady(true)} />;
  const unlisted = (fixtures.data ?? []).filter((fixture) => fixture.matchId === null);
  const beforeKickoff = (fixtures.data ?? []).filter(
    (fixture) => fixture.matchId !== null && !fixture.warmUp && Date.parse(fixture.kickoff) > Date.now(),
  );
  return (
    <div className="flex flex-col gap-5">
      <h2 className="t-title">Not on chain yet</h2>
      {unlisted.length === 0 ? <p className="t-small">Every saved fixture is listed.</p> : null}
      <ul className="flex flex-col gap-3">
        {unlisted.map((fixture) => (
          <Unlisted key={fixture.slug} fixture={fixture} />
        ))}
      </ul>
      <h2 className="t-title">Listed, before kickoff</h2>
      {beforeKickoff.length === 0 ? <p className="t-small">No listed match is still open.</p> : null}
      <ul className="flex flex-col gap-3">
        {beforeKickoff.map((fixture) => (
          <ListedSquad key={fixture.slug} fixture={fixture} />
        ))}
      </ul>
      <h2 className="t-title">Add or edit a fixture</h2>
      <FixtureForm onSaved={() => fixtures.refetch()} />
    </div>
  );
}

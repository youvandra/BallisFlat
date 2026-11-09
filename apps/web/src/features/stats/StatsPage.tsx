import { ArrowUpRight } from "lucide-react";
import { Zone } from "../../components/playmat/Zone";
import { Notice } from "../../components/ui/Notice";
import { formatWif, shortHash } from "../../lib/format";
import { facts, txUrl } from "../../lib/game/facts";
import { type Stats, useStats } from "../../lib/game/stats";

const count = new Intl.NumberFormat("en-US");
const ago = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** What each traction row means, in the words the app uses for the action. */
const kindLabels: Record<string, string> = {
  mint: "Minted a card",
  open: "Opened a card",
  sale: "Bought on the market",
  claim: "Claimed a share",
  keep: "Claimed and kept",
  refund: "Refunded",
  pack: "Bought a Hunt pack",
  hunt_mint: "Minted a Hunt card",
  find: "Found a wanted card",
  prize_paid: "Hunt prize paid",
};

function since(unixSeconds: number): string {
  const minutes = Math.round((unixSeconds * 1000 - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return ago.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) return ago.format(hours, "hour");
  return ago.format(Math.round(hours / 24), "day");
}

function Tile({
  label,
  value,
  note,
  lead = false,
}: {
  label: string;
  value: string;
  note?: string;
  lead?: boolean;
}) {
  return (
    <li className={`result ${lead ? "stats-lead shadow-result-pink" : ""}`}>
      <p className="t-zone">{label}</p>
      <p className="t-heading num">{value}</p>
      {note ? <p className="t-small">{note}</p> : null}
    </li>
  );
}

function Numbers({ stats }: { stats: Stats }) {
  const kind = (key: string) => stats.kinds[key]?.actions ?? 0;
  return (
    <>
      <ul className="stats-grid" aria-label="Wallets and actions">
        <Tile
          lead
          label="Wallets on Chain"
          value={count.format(stats.wallets.transacting)}
          note="Signed at least one game transaction"
        />
        <Tile
          label="Wallets Connected"
          value={count.format(stats.wallets.connected)}
          note="Connected to the app (reported by the browser)"
        />
        <Tile
          label="Game Transactions"
          value={count.format(stats.actions)}
          note="Mints, packs, claims, trades"
        />
      </ul>
      <ul className="stats-grid" aria-label="$WIF">
        <Tile label="$WIF Burned" value={formatWif(stats.wif.burned)} note="Sent to the dead address" />
        <Tile label="$WIF Paid In" value={formatWif(stats.wif.paidIn)} note="Cards, packs and Hunt mints" />
        <Tile
          label="$WIF Paid Out"
          value={formatWif(stats.wif.paidOut)}
          note="Claims, refunds and Hunt prizes"
        />
        <Tile
          label="Market Volume"
          value={formatWif(stats.wif.marketVolume)}
          note="Cards traded between wallets"
        />
      </ul>
      <ul className="stats-grid" aria-label="Actions">
        <Tile label="Cards Minted" value={count.format(kind("mint"))} />
        <Tile label="Hunt Packs" value={count.format(kind("pack"))} />
        <Tile label="Claims" value={count.format(kind("claim") + kind("keep"))} />
        <Tile label="Wanted Cards Found" value={count.format(kind("find"))} />
      </ul>
    </>
  );
}

function Daily({ stats }: { stats: Stats }) {
  const connected = new Map(stats.connectedDaily.map((row) => [row.day, row.count]));
  const days = [...new Set([...stats.daily.map((row) => row.day), ...connected.keys()])].sort().reverse();
  if (days.length === 0) return <p className="t-small">No activity yet.</p>;
  const byDay = new Map(stats.daily.map((row) => [row.day, row]));
  return (
    <table className="w-full text-left">
      <thead>
        <tr>
          <th className="t-zone py-2">Day (UTC)</th>
          <th className="t-zone py-2 text-right">Wallets</th>
          <th className="t-zone py-2 text-right">Transactions</th>
          <th className="t-zone py-2 text-right">New Connected</th>
        </tr>
      </thead>
      <tbody className="num">
        {days.map((day) => (
          <tr key={day} className="border-line-soft border-t">
            <td className="py-2">{day}</td>
            <td className="py-2 text-right">{count.format(byDay.get(day)?.wallets ?? 0)}</td>
            <td className="py-2 text-right">{count.format(byDay.get(day)?.actions ?? 0)}</td>
            <td className="py-2 text-right">{count.format(connected.get(day) ?? 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Recent({ stats }: { stats: Stats }) {
  if (stats.recent.length === 0) return <p className="t-small">No transactions yet.</p>;
  return (
    <ul className="flex flex-col">
      {stats.recent.map((row) => (
        <li key={row.id} className="border-line-soft border-b last:border-0">
          <a
            href={txUrl(row.tx)}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-12 items-center justify-between gap-3 py-2 transition-opacity hover:opacity-70"
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-ink">{kindLabels[row.kind] ?? row.kind}</span>
              <span className="t-small num">
                {row.wallet ? shortHash(row.wallet) : "Keeper"} · {since(row.at)}
                {row.amount > 0n ? ` · ${formatWif(row.amount)} $WIF` : ""}
              </span>
            </span>
            <ArrowUpRight size={15} strokeWidth={2} aria-hidden className="flex-none" />
          </a>
        </li>
      ))}
    </ul>
  );
}

function ContractLink({ label, address }: { label: string; address: string }) {
  return (
    <a
      href={`${facts.explorerUrl}/address/${address}`}
      target="_blank"
      rel="noreferrer"
      className="flex min-h-12 items-center justify-between gap-3 border-line-soft border-b py-2 transition-opacity last:border-0 hover:opacity-70"
    >
      <span className="flex flex-col gap-0.5">
        <span className="text-ink">{label}</span>
        <span className="t-small num">{shortHash(address)}</span>
      </span>
      <ArrowUpRight size={15} strokeWidth={2} aria-hidden />
    </a>
  );
}

/** Public traction: every number but connected wallets is rebuilt from contract events on Robinhood Chain. */
export function StatsPage() {
  const stats = useStats();
  return (
    <div className="playmat">
      <div className="playmat-col col-fill">
        <Zone label="Stats">
          <div className="zone-scroll page-end flex flex-col gap-8 px-7 pt-7.5 max-tab:px-4 max-tab:pt-6">
            <section className="flex max-w-170 flex-col gap-3">
              <h1 className="t-heading text-balance">Ball is Flat in numbers</h1>
              <p className="t-body">
                Read from Robinhood Chain: every count here is a contract event you can open on Blockscout.
                Connected wallets are the one number the browser reports.
              </p>
            </section>
            {stats.isError ? (
              <Notice tone="danger">The numbers could not be loaded. Try again shortly.</Notice>
            ) : null}
            {stats.data === null ? (
              <Notice>The numbers come from the live API at ballisflat.fun/stats.</Notice>
            ) : null}
            {stats.data ? (
              <>
                <Numbers stats={stats.data} />
                <section aria-labelledby="daily-title" className="flex flex-col gap-3">
                  <h2 id="daily-title" className="t-title">
                    By day
                  </h2>
                  <Daily stats={stats.data} />
                </section>
              </>
            ) : null}
          </div>
        </Zone>
      </div>

      <div className="playmat-col col-side">
        <Zone label="Latest" className="gap-1 px-4.5 pt-7.5 pb-4.5">
          <div className="zone-scroll">
            {stats.data ? <Recent stats={stats.data} /> : <p className="t-small">Nothing to show yet.</p>}
          </div>
        </Zone>
        <Zone label="Contracts" size="auto" className="gap-1 px-4.5 pt-7.5 pb-4.5">
          <ContractLink label="Ball is Flat" address={facts.contractAddress} />
          {facts.huntAddress ? <ContractLink label="Hunt" address={facts.huntAddress} /> : null}
          <ContractLink label="$WIF" address={facts.wifAddress} />
        </Zone>
      </div>
    </div>
  );
}

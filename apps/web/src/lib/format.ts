import { formatUnits } from "viem";

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const precise = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** $WIF amount (18 decimals) for display: whole tokens, two decimals only below 10. */
export function formatWif(amount: bigint): string {
  const value = Number(formatUnits(amount, 18));
  return value !== 0 && Math.abs(value) < 10 ? precise.format(value) : whole.format(Math.floor(value));
}

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** $WIF in a tight spot (a card back): "88K", "1.2M". */
export function formatWifCompact(amount: bigint): string {
  return compact.format(Number(formatUnits(amount, 18)));
}

/** Whole $WIF needed to cover a shortfall, rounded up so the user never lands one wei short. */
export function formatWifCeil(amount: bigint): string {
  const unit = 10n ** 18n;
  return whole.format(Number((amount + unit - 1n) / unit));
}

export function formatMultiple(multiple: number): string {
  return `×${multiple >= 100 ? Math.floor(multiple) : multiple.toFixed(1)}`;
}

export function formatPercent(fraction: number): string {
  if (fraction > 0 && fraction < 0.01) return "<1%";
  return `${Math.round(fraction * 100)}%`;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** "2d 4h", "4:12:09", "0:00:05": the time left until a moment, in unix seconds. */
export function formatCountdown(seconds: number): string {
  const left = Math.max(0, Math.floor(seconds));
  const days = Math.floor(left / 86_400);
  const hours = Math.floor((left % 86_400) / 3600);
  const minutes = Math.floor((left % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}:${pad(minutes)}:${pad(left % 60)}`;
}

const kickoffFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/** The viewer's own zone as a short name ("WIB", "GMT", "CET"), so a local time is never ambiguous. */
function zoneName(date: Date): string {
  const locales = [
    ...(typeof navigator === "undefined" ? [] : navigator.languages),
    "en-US",
    "en-GB",
    "id-ID",
  ];
  let fallback = "";
  for (const locale of locales) {
    try {
      const part = new Intl.DateTimeFormat(locale, { timeZoneName: "short" })
        .formatToParts(date)
        .find((item) => item.type === "timeZoneName")?.value;
      if (!part) continue;
      fallback ||= part;
      // Prefer a real abbreviation over an offset like "GMT+7".
      if (!/^(GMT|UTC)[+\-\u2212]/.test(part)) return part;
    } catch {
      // An unknown locale tag; try the next one.
    }
  }
  return fallback;
}

/** "Fri 13 Nov, 02:45 WIB": the kickoff in the viewer's time, with the zone. */
export function formatKickoff(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  const zone = zoneName(date);
  return zone ? `${kickoffFormat.format(date)} ${zone}` : kickoffFormat.format(date);
}

const shortKickoffFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** "12 Nov, 19:45": a kickoff short enough for a card's kicker line, in the viewer's time. */
export function formatKickoffShort(unixSeconds: number): string {
  return shortKickoffFormat.format(new Date(unixSeconds * 1000));
}

export function formatDay(unixSeconds: number): string {
  return dayFormat.format(new Date(unixSeconds * 1000));
}

export function shortHash(hash: string): string {
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

const particles = new Set([
  "de",
  "da",
  "di",
  "do",
  "dos",
  "das",
  "del",
  "della",
  "van",
  "von",
  "der",
  "den",
  "la",
  "le",
  "du",
  "ter",
  "ten",
  "bin",
  "al",
  "el",
]);

/**
 * Card names for one squad: the surname, or "J. Bellingham" where two players in the list share one, so
 * the grid never shows the same name twice.
 */
export function cardNames(players: readonly { id: number; name: string }[]): Map<number, string> {
  const counts = new Map<string, number>();
  for (const player of players) {
    const last = surname(player.name).toLowerCase();
    counts.set(last, (counts.get(last) ?? 0) + 1);
  }
  return new Map(
    players.map((player) => {
      const last = surname(player.name);
      const shared = (counts.get(last.toLowerCase()) ?? 0) > 1;
      const initial = player.name.trim()[0];
      return [player.id, shared && initial ? `${initial}. ${last}` : last];
    }),
  );
}

/** The name printed big on a card: the last name, keeping particles ("van Dijk", "de Jong"). */
export function surname(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  let start = parts.length - 1;
  while (start > 1 && particles.has(parts[start - 1]?.toLowerCase() ?? "")) start -= 1;
  return parts.slice(start).join(" ");
}

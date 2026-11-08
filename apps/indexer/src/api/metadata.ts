// ERC-721 metadata for a card (tokenURI points here) and its image. The image is drawn as SVG from on-chain
// state plus the off-chain names, so a card shows its real state (sealed, opened, won, claimed) in any wallet
// or marketplace. A sealed card keeps the pick hidden, like the pack in the app.

export type CardView = {
  tokenId: bigint;
  serial: number;
  cardsInMatch: number;
  opened: boolean;
  state: "live" | "claimed" | "refunded";
  matchStatus: string;
  won: boolean | null; // null until the match is final
  playerName: string;
  playerPosition: string;
  playerNumber: number;
  teamCode: string;
  teamColour: string;
  home: string;
  away: string;
  competition: string;
  matchday: number;
  kickoff: Date;
  slug: string;
};

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** "UEFA Nations League · MD5": the season drops off and the line stays clear of the status pill. */
export function footLine(card: Pick<CardView, "competition" | "matchday">): string {
  const competition = card.competition.replace(/\s+\d{4}(-\d{2,4})?$/, "").trim();
  const day = card.matchday > 0 ? ` · MD${card.matchday}` : " · Warm-up";
  const room = 28 - day.length;
  const name = competition.length > room ? `${competition.slice(0, room - 1).trimEnd()}…` : competition;
  return `${name}${day}`;
}

export function cardStatus(card: CardView): string {
  if (card.state === "claimed") return "Claimed";
  if (card.state === "refunded") return "Refunded";
  if (card.matchStatus === "Voided") return "Refund";
  if (card.won === true) return "Winner";
  if (card.won === false) return "Missed";
  if (card.matchStatus === "Proposed") return "Settling";
  return card.opened ? "Opened" : "Sealed";
}

export function metadataJson(card: CardView, baseUrl: string, appUrl: string) {
  const status = cardStatus(card);
  const sealed = !card.opened && card.state === "live";
  const title = `${card.home} v ${card.away}`;
  return {
    name: sealed ? `Sealed pick · ${title} #${card.serial}` : `${card.playerName} · ${title} #${card.serial}`,
    description: sealed
      ? `A sealed man-of-the-match pick for ${title} (${card.competition}). Open it in Ball is Flat to reveal the player.`
      : `Man-of-the-match pick: ${card.playerName} for ${title} (${card.competition}). Burn a winning card in Ball is Flat to take its share of the $WIF pot.`,
    image: `${baseUrl}/cards/${card.tokenId}/image.png`,
    animation_url: `${baseUrl}/cards/${card.tokenId}/image.svg`,
    external_url: `${appUrl}/m/${card.slug}`,
    attributes: [
      { trait_type: "Match", value: title },
      { trait_type: "Competition", value: card.competition },
      { trait_type: "Matchday", value: card.matchday },
      { trait_type: "Kickoff", display_type: "date", value: Math.floor(card.kickoff.getTime() / 1000) },
      { trait_type: "Status", value: status },
      { trait_type: "Serial", value: card.serial, max_value: card.cardsInMatch },
      ...(sealed
        ? []
        : [
            { trait_type: "Player", value: card.playerName },
            { trait_type: "Team", value: card.teamCode },
            { trait_type: "Position", value: card.playerPosition },
          ]),
    ],
  };
}

type Frame = {
  name: string;
  corner: string;
  sealed: boolean;
  kit: string;
  face: string;
  title: string;
  foot: string;
  status: string;
  tone: string;
};

/** The shared 600x840 card in the app's riso look: halftone, pink and cyan glow, name, face, title, status pill. */
function frameSvg(f: Frame): string {
  const kit = /^#[0-9a-f]{6}$/i.test(f.kit) ? f.kit : "#ff4fa3";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 840" width="600" height="840" font-family="Arial Black, Arial, Helvetica, sans-serif">
  <defs>
    <pattern id="dots" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(22)">
      <circle cx="5" cy="5" r="2.2" fill="#f4efe6" opacity=".09"/>
    </pattern>
    <radialGradient id="pink" cx="0" cy="0" r="1"><stop offset="0" stop-color="#ff4fa3" stop-opacity=".45"/><stop offset="1" stop-color="#ff4fa3" stop-opacity="0"/></radialGradient>
    <radialGradient id="cyan" cx="1" cy="1" r="1"><stop offset="0" stop-color="#3fe0ff" stop-opacity=".35"/><stop offset="1" stop-color="#3fe0ff" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="600" height="840" rx="36" fill="#141416"/>
  <rect x="24" y="24" width="552" height="792" rx="26" fill="${f.sealed ? "#1d1d22" : kit}" opacity="${f.sealed ? 1 : 0.18}"/>
  <rect width="600" height="840" rx="36" fill="url(#pink)"/>
  <rect width="600" height="840" rx="36" fill="url(#cyan)"/>
  <rect width="600" height="840" rx="36" fill="url(#dots)"/>
  <text x="48" y="92" font-size="44" font-weight="900" fill="#f4efe6">${esc(f.name)}</text>
  <text x="552" y="92" text-anchor="end" font-size="24" fill="#f4efe6" opacity=".7">${esc(f.corner)}</text>
  ${f.face}
  <rect x="48" y="680" width="504" height="2" fill="#f4efe6" opacity=".25"/>
  <text x="48" y="728" font-size="26" fill="#f4efe6">${esc(f.title)}</text>
  <text x="48" y="768" font-size="20" fill="#f4efe6" opacity=".6">${esc(f.foot)}</text>
  <rect x="${552 - 16 * f.status.length - 36}" y="736" width="${16 * f.status.length + 36}" height="44" rx="22" fill="${f.tone}"/>
  <text x="${552 - (16 * f.status.length + 36) / 2}" y="766" text-anchor="middle" font-size="20" fill="#141416">${esc(f.status.toUpperCase())}</text>
  <text x="300" y="812" text-anchor="middle" font-size="16" fill="#f4efe6" opacity=".5" letter-spacing="4">BALL IS FLAT</text>
</svg>`;
}

/** The player cut-out when there is art, else the shirt number in offset pink and cyan. */
function playerFace(picture: string | null, number: number): string {
  return picture
    ? `<image href="${picture.startsWith("data:image/") ? picture : ""}" x="70" y="170" width="460" height="460" preserveAspectRatio="xMidYMid meet"/>`
    : `<text x="306" y="520" text-anchor="middle" font-size="300" font-weight="900" fill="#3fe0ff" opacity=".85">${number}</text>
         <text x="294" y="510" text-anchor="middle" font-size="300" font-weight="900" fill="#ff4fa3" opacity=".85">${number}</text>
         <text x="300" y="515" text-anchor="middle" font-size="300" font-weight="900" fill="#f4efe6">${number}</text>`;
}

/**
 * A 600x840 card face in the app's riso look: halftone, pink and cyan offset, player cut-out or number.
 * `picture` must be a data URI (see art.ts): an SVG shown as an image cannot load other URLs.
 */
export function cardSvg(card: CardView, picture: string | null = null): string {
  const status = cardStatus(card);
  const sealed = !card.opened && card.state === "live";
  const face = sealed
    ? `<text x="300" y="470" text-anchor="middle" font-size="220" font-weight="900" fill="#ff4fa3" opacity=".9">?</text>
       <text x="300" y="560" text-anchor="middle" font-size="30" font-weight="700" fill="#f4efe6" letter-spacing="6">SEALED PICK</text>`
    : playerFace(picture, card.playerNumber);
  return frameSvg({
    name: sealed ? "???" : card.playerName.toUpperCase(),
    corner: `#${card.serial}/${card.cardsInMatch}`,
    sealed,
    kit: card.teamColour,
    face,
    title: `${card.home} v ${card.away}`.toUpperCase(),
    foot: footLine(card),
    status,
    tone:
      status === "Winner" || status === "Claimed" ? "#3fe0ff" : status === "Missed" ? "#8a8a93" : "#ff4fa3",
  });
}

// ---------- Hunt cards ----------

/** A card minted from a Hunt pack: one drawn player, soulbound, never sealed (the pack was opened to mint it). */
export type HuntCardView = {
  tokenId: bigint;
  round: number;
  packId: bigint;
  tier: string; // Silver, Gold, Diamond
  wanted: boolean; // this card is the round's wanted player
  claimed: boolean; // the round's prize was claimed
  paid: boolean; // and the team recorded the transfer
  playerName: string;
  playerPosition: string;
  playerNumber: number;
  teamCode: string;
  teamColour: string;
};

export function huntCardStatus(card: HuntCardView): string {
  if (!card.wanted) return "Drawn";
  if (card.paid) return "Paid";
  if (card.claimed) return "Claimed";
  return "Wanted";
}

export function huntMetadataJson(card: HuntCardView, baseUrl: string, appUrl: string) {
  const status = huntCardStatus(card);
  return {
    name: `${card.playerName} · Hunt Round ${card.round}${card.wanted ? " · Wanted" : ""}`,
    description: card.wanted
      ? `The wanted card of Ball is Flat Hunt round ${card.round}: ${card.playerName}, pulled from a ${card.tier} pack. Its holder takes the round's $WIF prize.`
      : `${card.playerName}, pulled from a ${card.tier} pack in Ball is Flat Hunt round ${card.round}. Soulbound.`,
    image: `${baseUrl}/hunt/cards/${card.tokenId}/image.png`,
    animation_url: `${baseUrl}/hunt/cards/${card.tokenId}/image.svg`,
    external_url: `${appUrl}/hunt`,
    attributes: [
      { trait_type: "Round", value: card.round },
      { trait_type: "Pack", value: card.tier },
      { trait_type: "Status", value: status },
      { trait_type: "Player", value: card.playerName },
      { trait_type: "Team", value: card.teamCode },
      { trait_type: "Position", value: card.playerPosition },
    ],
  };
}

export function huntCardSvg(card: HuntCardView, picture: string | null = null): string {
  const status = huntCardStatus(card);
  return frameSvg({
    name: card.playerName.toUpperCase(),
    corner: card.tier.toUpperCase(),
    sealed: false,
    kit: card.teamColour,
    face: playerFace(picture, card.playerNumber),
    title: `HUNT ROUND ${card.round}`,
    foot: `${card.teamCode} · ${card.playerPosition} · Pack #${card.packId}`,
    status,
    tone: card.wanted ? "#3fe0ff" : "#8a8a93",
  });
}

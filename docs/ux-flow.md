# Ball is Flat — end-to-end UX flow

Status: agreed 2026-11-06 (option A: per-match pick board, no secondary trading).
This file is the screen spec for `apps/web`. The Framer site is the
marketing page only; every step below lives in the app.

## Principles

- The app is the product. A judge lands on the board and can pick within 30 seconds.
- Every number on screen comes from the contract or the match data; nothing is hard-coded copy.
- One action per screen. The primary button always says what happens next ("Mint for 1,000 $WIF", "Burn to claim 11,250 $WIF").
- Visual language carries over from the landing: dark mat, riso pink `#FF4FA3` and cyan `#3FE0FF`, halftone art,
  hard offset shadows, Unbounded for display, Geist for body. Tokens first (`apps/web/src/styles/tokens.css`).
- Motion explains cause and effect: the pack tears because you paid, the card flattens and burns because you claimed.
  Nothing visible waits on an animation; reduced motion skips straight to the end state.

## Match lifecycle (drives every screen)

| State | When | What the user can do |
|---|---|---|
| `Open` | listed, before kickoff | pick a player, mint a card |
| `Locked` | kickoff passed, no result | watch pot and spread, nothing to sign |
| `Proposed` | result posted, dispute window running | see winner + source link, countdown to final |
| `Final` | dispute window over | winners burn to claim; others see the miss |
| `Void` | match called off | every card refunds its price |
| `RolledOver` | final with zero winning cards | pot (minus burn) shown moving to the next match |

## Screens

Structure (2026-11-06, replaces the 2026-11-07 Connect page): `/` is a landing with no top nav; its bottom bar
is one Launch App button that goes straight to `/matches`. There is no Connect page. Matches, Market, Leaderboard
and Rules browse without a wallet (reads only; match status reads "Not Joined"). The dock is Matches, Binder,
Leaderboard on every app page, connected or not; the masthead carries the wallet control (Connect Wallet, or
balance, short address and Disconnect). A wallet is asked for only where it is needed:
- Binder, Pack (`/m/:slug/open/:tokenId`) and `/ops` show an inline connect gate in place of the page.
- Every write asks in place: the pick sheet and the buy confirm show the wallet card where the Mint / Buy
  button goes, and the button appears once connected; other writes (Finalize Match) open the connect sheet and
  run once the wallet lands.

### 1. Landing `/` (public, bottom Launch App bar)
- The Framer Home board: Matches deck (six fixtures, no filter tabs), Field with the sealed Pack, How it plays,
  House rules, Binder. No actions on it.
- The Field is the Framer Pack: "Ball is Flat", "Matchday 5, Nov 2026", "One MVP in every match", "Your pick",
  "001/100", "Man of the match card", with its own Sound On toggle.
- Masthead: wordmark, role line, London time and "Matchday N picks open <day>"; no sound icon. The bottom bar
  replaces the app's dock with one Launch App button.

### 2. Connect (inline, no route)
- One wallet card, used in three places: the Binder/Pack/Ops gate, the connect sheet (masthead Connect Wallet,
  Finalize Match) and in place of the Mint / Buy button inside the pick and buy sheets.
- Gate: a Zone with a heading ("Connect to open your binder"), one short line of what connecting allows, and the
  wallet card on the Card surface. The Binder gate adds a Shelves key (the six shelves and what each holds).
- Wallet card: network badge (Robinhood Chain, chain id), wallet options (Demo Wallet in mock mode; in chain mode
  "Local Account" when `VITE_DEV_ACCOUNT` is set, else EIP-6963 injected wallets or a "Browser Wallet"
  fallback), and one state at a time: connecting, wrong network (Switch Network, adds the chain), error,
  connected. Nothing moves without a signature.

### 3. Matches `/matches`
- Left: the Board zone exactly as Framer draws it: heading, intro, Discipline Key (matchday rows with counts and
  colour chips), and the Settled archive with card backs and the "How settling works" link. No team search, no
  flipping deck, no filter controls.
- Grid of match covers with kickoff (local time and zone), countdown, pot, cards, state and your card status
  (Not Joined, Sealed, Joined, Locked, Result Posted, Claim, Missed, Refund, Claimed); every card in a row is
  the same height.
- The Board key is read-only: the grid always lists every match.

### 4. Market `/m/:slug`
- Match header, squad grid (surname, centred shirt number, "×N if he wins", picks bar; Your Pick ribbon; Sold
  Out at the per-player cap), confirm sheet with full details and the mint flow.
- While Open, two buttons sit top right of the Team v Team row: Pick a Player and Buy Sealed (For Sale sheet:
  listings cheapest first, ×N at the listed price, buy with approve + buy and max-price protection). No action
  cards or explanatory copy; Random Packs stays on the roadmap only.
- After kickoff the right column is the Result panel.

### 5. Pack `/m/:slug/open/:tokenId`
- Sealed pack until torn (drag, tap or Enter); tearing calls `open` (one-way, cancels any listing). An opened
  card always shows its face.

### 6. Binder `/binder`
- Shelves: Claim, Sealed, Waiting, Missed, Refund, Claimed. Sealed cards show the pack, Open Your Pack and,
  before kickoff, Sell (price in $WIF, You receive and Burned 5%, List For Sale / Update Price / Cancel
  Listing, "Listed · price" badge). Opened cards flip to the result and source; Claim burns for the payout.

### 7. Leaderboard `/leaderboard`
- Wallets ranked by $WIF won (All Time / This Matchday), your standing, and the Fan MVP per match.

### 8. Rules `/rules` (public)
- House rules, this week, how a match plays out, the board, roadmap, external links.

### 9. Ops `/ops` (not linked)
- Settler only: post a result, finalize, void.

## Data the app needs

| Data | Source | Notes |
|---|---|---|
| Matches, kickoff, state, pot, counts | contract reads + events | single source of truth |
| Squads (player id, name, number, position, team) | static JSON per match in `packages/config`, from a squad feed or the published squad lists | player id is what the contract stores |
| Result rating + source URL | settler posts on-chain with the URL | the app only reads it |
| $WIF price for the USD hint | DexScreener pair API | optional, label as approximate |

## Contract surface the UI calls

- `matches(id)` → kickoff, state, pot, cards, winnerPlayerId, sourceUrl, finalAt
- `cardsOn(matchId, playerId)`, `hasCard(matchId, wallet)`
- `mint(matchId, playerId)` (pulls `price` $WIF via allowance) → `tokenId`
- `claim(tokenId)` burns the card, pays the share
- `refund(tokenId)` for void matches
- settler: `propose(matchId, playerIds[], sourceUrl)`, `correct(...)` during the window, `voidMatch(matchId)`
- anyone: `finalize(matchId)` after the window (burns 10%, or rolls the pot to `nextMatch`)
- `open(tokenId)` reveals a card (owner, one-way); `isOpened(tokenId)`
- cap: `matchInfo(id).maxPerPlayer` (0 = unlimited), `remaining(matchId, playerId)`; mint reverts `PlayerSoldOut` at the cap
- market (sealed cards, before kickoff, 5% `saleBurnBps` burned): `listForSale(tokenId, price)`, `cancelListing(tokenId)`,
  `buy(tokenId, maxPrice)` (approve `price` $WIF first); `listingOf(tokenId)` → `(seller, price)`, zero when not buyable.
  Listings of a match: `CardListed` logs filtered by `matchId`, then `listingOf` per token id. A bought card does not
  use the buyer's one-mint slot (`cardOf` stays with the minter).

## Demo path (video and judges)

Board → England v Croatia → sort by underdog → pick a player (×N shown) → confirm, approve + mint →
tear the pack, card #N out → Binder shows it under Waiting → (pre-settled demo match) Binder → Claim →
burn animation → $WIF lands, Blockscout link.

A pre-settled match on mainnet is needed for the claim beat before Matchday 5 ends: list one already-played
match with a short window, settle it honestly from its published rating, and label it "Warm-up match".

## Acceptance (per screen)

1. Board loads match states from the chain in under 2 s on a cold load; no wallet needed to browse.
2. Market ×N matches the contract math for every player within rounding (unit test on the formula).
3. A second mint for the same match from the same wallet is blocked in the UI and reverts on-chain.
4. Opening the pack works by drag, tap and keyboard; with reduced motion a tear opens it instantly, with no animation (the card is never opened without a user action, because opening is an on-chain transaction).
5. Binder groups match the contract state for every card in the wallet (e2e with a forked chain).
6. Claim pays exactly `floor(pot × 0.9 / winningCards)` and the card no longer exists after.

<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/logo-white.svg">
  <img src="docs/media/logo-black.svg" alt="Ball is Flat" width="260">
</picture>

# Ball is Flat

**Predicting the MVP in football is impossible. The ball is flat, everyone knows that.**

Pick the man of the match before kickoff, mint the pick as a card in $WIF,<br>
and burn the card to take your share of the pot when your player comes out on top.

[![Chain](https://img.shields.io/badge/Robinhood_Chain-4663-ff4fa3?style=flat-square)](packages/config/src/chain.ts)
[![Token](https://img.shields.io/badge/token-%24WIF-3fe0ff?style=flat-square)](https://dexscreener.com/robinhood/0x71ef4106340f0a3b9c19ec994eef4fc44a1d2513f38faac39d7636b156548c79)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.28-141416?style=flat-square&logo=solidity)](packages/contracts/src/BallIsFlat.sol)
[![Foundry tests](https://img.shields.io/badge/forge_tests-127_passing-2ea44f?style=flat-square)](packages/contracts/test)
[![E2E](https://img.shields.io/badge/e2e-32_passing-2ea44f?style=flat-square)](e2e)
[![Hackathon](https://img.shields.io/badge/world_is_flat-hackathon_entry-ffe800?style=flat-square)](https://worldisflat.fun/build)

App: [ballisflat.fun](https://ballisflat.fun) · API: [api.ballisflat.fun](https://api.ballisflat.fun/api/board) · Demo video (soon) · [Architecture](docs/architecture.md) · [Security](docs/security.md)

<img src="docs/media/banner.webp" alt="Ball is Flat: mint your take on the game" width="100%">

</div>

---

## Contents

- [What is it](#what-is-it)
- [Sneak peek](#sneak-peek)
- [How it plays](#how-it-plays)
- [The Hunt](#the-hunt)
- [Where $WIF goes](#where-wif-goes)
- [Match lifecycle](#match-lifecycle)
- [Trust model](#trust-model)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Scripts](#scripts)
- [Testing and evidence](#testing-and-evidence)
- [Deployments](#deployments)
- [Repo map](#repo-map)
- [Prior art](#prior-art)
- [FAQ](#faq)
- [Roadmap](#roadmap)
- [Team and AI use](#team-and-ai-use)

## What is it

Ball is Flat is a simple gameFi where you back the football player you think will run the match.

Before kickoff you pick **one player** and mint that pick as an **NFT card for 1,000 $WIF**. Every $WIF from every card goes into the match pot. After full time, the top-rated player (FotMob rating) is posted onchain with the source link, and there's a **2 hour window** to flag mistakes. If your player was the best on the pitch, you **burn your card and take your share** of the pot. The fewer people on your player, the bigger your share.

10% of every pot is burned. A pot nobody called rolls into the next match. Sealed cards can be resold before kickoff, and 5% of every sale is burned too. Winners who want to keep their card can **Claim & Keep**: they take the share minus a small keep fee, which is burned.

Between matches there is **the Hunt**: a deck of packs with a few cards of one wanted player hidden in it, and a $WIF prize from the team for every one pulled.

Most products only care about scores and final results. Fans mostly talk about players: who was on fire, who played the dumbest, who deserves the applause. Ball is Flat turns that take into a card in your wallet, and pays you in $WIF when you're right.

## Sneak peek

<table>
  <tr>
    <td width="32%" align="center"><img src="docs/media/card.webp" alt="An opened pick card" width="100%"><br><sub><b>The card.</b> One pick, one NFT, serial #37 of 37.</sub></td>
    <td width="68%" align="center"><img src="docs/media/landing.webp" alt="Landing" width="100%"><br><sub><b>Landing.</b> The rulebook as a playmat, with a sealed pack to tear open.</sub></td>
  </tr>
</table>

<table>
  <tr>
    <td width="50%"><img src="docs/media/market.webp" alt="Match market"><br><sub><b>The market.</b> Both squads, picks per player and "×N if he wins".</sub></td>
    <td width="50%"><img src="docs/media/binder.webp" alt="Binder"><br><sub><b>The binder.</b> Cards sorted by what you can do with them: claim, keep, sell, wait, refund.</sub></td>
  </tr>
  <tr>
    <td colspan="2"><img src="docs/media/hunt.webp" alt="The Hunt"><br><sub><b>The Hunt.</b> One wanted player, three of his cards in a 10,000-card deck, sharing one prize pool.</sub></td>
  </tr>
</table>

<sub>Screenshots come from the in-browser mock chain (`VITE_DATA_MODE=mock`) and are regenerated with `npx playwright test -c scripts/screenshots/screenshots.config.ts`.</sub>

## How it plays

| Step | What you do | What the contract does |
|---|---|---|
| **1. Pick** | Open a match, browse both squads, see what each player would pay right now | Nothing yet. "×N if he wins" is read from the live pot |
| **2. Mint** | Approve $WIF, mint one card for 1,000 $WIF | Takes the $WIF into the match pot, mints an ERC-721 card. One mint per wallet per match, at most 10 cards per player, closes at kickoff |
| **3. Open** | Tear the sealed pack | Marks the card opened. Opened cards can never be sold |
| **4. Sell (optional)** | List a sealed card, or buy one | Sale goes straight buyer to seller, 5% burned, only before kickoff |
| **5. Settle** | Watch the match | Settler posts the top-rated player plus the FotMob link. 2 hour dispute window, then anyone can finalize |
| **6. Claim** | Burn a winning card | Pays `pot × 90% ÷ winning cards` in $WIF. Losing cards stay in your wallet as a record |
| **6b. Claim & Keep** | Keep the winning card instead | Pays the same share minus the keep fee (50 $WIF), which is burned. The card stays, marked Kept |

Ties split the pot across every tied player's cards. A postponed or abandoned match is voided and every card refunds its full price.

## The Hunt

A side game between matchdays, built on the same cards.

| | |
|---|---|
| **The deck** | Each round is a deck of 10,000 cards. 3 of them are the wanted player (now: Harry Kane); the rest are random players from the November squads |
| **Packs** | Silver 3 cards / 50 $WIF, Gold 7 / 100, Diamond 12 / 150. Prices are set per round. Packs stop selling when the deck runs out |
| **The draw** | A pack is drawn from the block hash of the block after you buy it, then torn open card by card. Each card is wanted with chance (wanted left) ÷ (deck left), so the odds shown on each pack are live |
| **The prize** | The team posts a 100,000 $WIF prize pool, an equal part for each wanted card pulled. The finder claims onchain, the team sends the $WIF and records the transfer hash with `markPaid`, so every payout is public |
| **Free Silver** | The team can open Silver for free to an uploaded wallet list (a merkle root onchain), one pack per wallet |
| **Cards** | Opening records the draw; you mint the cards you want to keep into your binder (gas only). Hunt cards never move |

Contract: [`BallIsFlatHunt.sol`](packages/contracts/src/BallIsFlatHunt.sol). It holds no $WIF: 10% of every pack burns at purchase and the rest goes to the team treasury, which funds the prizes.

## Where $WIF goes

```mermaid
flowchart LR
    U([Fan]) -- "1,000 $WIF per card" --> P[(Match pot)]
    P -- "10% at finalize" --> B{{Burn 0x…dEaD}}
    P -- "90% split" --> W([Winning cards])
    P -- "nobody called it" --> N[(Next match pot)]
    N -. "no next match" .-> B
    S([Seller]) -- "95% of sale" --> S2([Seller wallet])
    BY([Buyer]) -- "sale price" --> S
    BY -- "5% of sale" --> B
    W -. "Claim & Keep fee" .-> B
    H([Hunt pack buyer]) -- "10% of pack" --> B
    H -- "90% of pack" --> T([Team treasury])
    T -- "100,000 $WIF pool, split per wanted card" --> F([Hunt finder])
```

- **$WIF is the only currency.** Card price, pot, payout, resale and burn are all $WIF on Robinhood Chain (`0x5173b8eA6923c2d40267890D45C46a3480954773`).
- **No cut of the match pots, no token of our own.** Pot money leaves only through a winning claim, a refund on a voided match, or the burn. The team's only income is Hunt packs, and it pays the Hunt prizes from it.
- **The flywheel.** Football has a match every few days, so the calendar brings people back. Every match burns $WIF, uncalled pots make the next match bigger, and a correct unpopular pick pays the most.

## Match lifecycle

```mermaid
stateDiagram-v2
    [*] --> Open: owner lists match + squad
    Open --> Locked: kickoff (mints and sales close)
    Locked --> Proposed: settler posts winner + source URL
    Proposed --> Proposed: settler corrects (inside 2h window)
    Proposed --> Final: anyone finalizes after 2h, someone called it
    Proposed --> RolledOver: anyone finalizes after 2h, nobody called it
    Open --> Void: postponed / abandoned
    Locked --> Void
    Proposed --> Void
    Final --> [*]: winners claim
    RolledOver --> [*]: pot moves to next match (or burns)
    Void --> [*]: every card refunds its price
```

`stateOf(matchId)` returns exactly these states, so the app and the API never guess.

## Trust model

| Power | Who | Limit |
|---|---|---|
| Move pot funds | Nobody directly | $WIF leaves only through `claim` (winning card burned), `refund` (voided match), the burn, or a rollover into the next match |
| Receive an uncalled pot | Nobody | It rolls into the next open match, or is burned when there is none |
| Move a card between wallets | Only `buy` | `transferFrom` / `safeTransferFrom` revert with `CardLocked`, so the sale burn always applies |
| List matches, set settler, pause new mints | Owner | Pausing stops mints only. Claims and refunds always work |
| Post and correct the result | Settler (the owner wallet, run by a bot, disclosed on the site) | Only players in the listed squad, only during the dispute window, always with a source URL. The bot ([`scripts/settler.ts`](scripts/settler.ts)) posts FotMob's top rating 30 minutes after full time, follows FotMob if ratings change during the window, then finalizes. It never guesses: a top-rated player off the squad or a postponed match waits for a human |
| Pay Hunt prizes | Owner, by transfer | Each find is onchain (`TargetFound`); the payment hash is recorded with `markPaid` |
| Void a match | Settler or owner | Only before finalize. Every card then refunds its full price |
| Finalize | Anyone | Only after the dispute window ends |
| Upgrade | Nobody | No proxy, no sweep |

The single settler is the open trust assumption for this event. The public source link, the dispute window and the void-with-full-refund path keep it honest. Multi-source and attested settlement are on the [roadmap](#roadmap).

Static analysis and reviewed findings: [`docs/security.md`](docs/security.md).

## Architecture

```mermaid
flowchart TB
    subgraph Chain["Robinhood Chain (4663)"]
        C[BallIsFlat.sol<br>ERC-721 cards · pots · settlement · market]
        HU[BallIsFlatHunt.sol<br>decks · packs · finds]
        WIF[$WIF ERC-20]
        C <--> WIF
        HU <--> WIF
    end
    subgraph Server["API host"]
        I[Ponder indexer] --> PG[(Postgres)]
        H[Hono API<br>board · binder · leaderboard · card metadata + images]
        H --> PG
    end
    subgraph Client["Browser"]
        A[React app<br>wagmi + viem]
    end
    C -- events --> I
    A -- reads --> H
    A -- "approve · mint · open · list · buy · claim · refund" --> C
    FM[(FotMob ratings)] --> ST
    ST([Settler bot]) -- "propose · correct · finalize" --> C
    O([Owner /ops panel]) -- "listMatches · setPlayers · void" --> C
    O -- "startRound · setTier · markPaid" --> HU
```

- **Squads as merkle roots.** Each match stores one root computed onchain from strictly ascending player ids, so listing 20 or 60 players costs the same. The same tree lives in [`packages/core/src/squad.ts`](packages/core/src/squad.ts), pinned by a shared test vector.
- **One payout formula.** `multipleIfWins` and `claimShare` live once in [`packages/core`](packages/core) and are used by the app, the API and the tests, so the "×N if he wins" on screen matches the contract.
- **Cards that update.** `tokenURI` points at the API, which renders each card from onchain state. ERC-4906 events tell wallets and marketplaces to refresh when a match settles.
- **Two data modes.** `mock` is an in-browser chain for demos with no wallet. `chain` reads the deployed contract and the API.

Deeper write-up and code map: [`docs/architecture.md`](docs/architecture.md).

## Tech stack

| Layer | Tools |
|---|---|
| Contract | Solidity 0.8.28, Foundry, OpenZeppelin 5 (`ERC721Enumerable`, `SafeERC20`, `ReentrancyGuard`, `Ownable`, `MerkleProof`), ERC-4906, ERC-7572 |
| Indexer + API | Ponder 0.18, Hono, Postgres, sharp for card PNGs |
| Web app | React 19, Vite, Tailwind 4, wagmi + viem, TanStack Query, framer-motion |
| Shared | TypeScript packages for payout math, squads, chain config, ABI |
| Landing | Framer |
| Quality | Biome, Vitest, Playwright, Slither, jscpd, knip, design-token guards, GitHub Actions |
| Hosting | Caddy + systemd on a single box ([`deploy/`](deploy)) |

## Getting started

**Prerequisites:** Node 24+, npm 10+, [Foundry](https://getfoundry.sh) for the contract and local chain, Postgres 16+ only if you run the indexer.

```bash
git clone --recursive https://github.com/youvandra/BallisFlat.git
cd BallisFlat
npm install
```

### 1. Quick look, no wallet (mock chain)

```bash
VITE_DATA_MODE=mock npm run dev
```

Open the printed URL. Connect gives you a demo wallet with $WIF, and every flow (mint, open, sell, claim) runs in the browser.

### 2. Real contract on a local chain

```bash
npm run chain:local     # anvil on chain id 4663
npm run deploy:local    # mock $WIF + BallIsFlat, lists all fixtures, seeds a settled warm-up
npm run dev:local       # app against the local contract with an unlocked dev account
```

### 3. Full stack with the indexer

```bash
createdb ballisflat
cd apps/indexer
NETWORK=local DATABASE_URL=postgres://localhost:5432/ballisflat DATABASE_SCHEMA=ponder_local \
ADMIN_TOKEN=dev-admin CORS_ORIGINS=http://localhost:5312 npx ponder dev
```

Then point the app at it with `VITE_API_URL=http://localhost:42069`. Every variable is listed in [`apps/indexer/.env.example`](apps/indexer/.env.example) and parsed in [`apps/web/src/lib/env.ts`](apps/web/src/lib/env.ts).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Web app dev server |
| `npm run verify` | Lint, typecheck, unit tests, design guards, duplicate check, build |
| `npm run e2e` | Playwright demo path on desktop and mobile |
| `cd packages/contracts && forge test` | Contract tests, including fuzz |
| `npm run chain:local` / `deploy:local` / `dev:local` | Local anvil chain, deploy, app against it |
| `node scripts/deploy.ts --network mainnet --yes` | Mainnet deploy (owner key, spends gas) |
| `node scripts/settler.ts --network mainnet --once --dry-run` | Settler pass: what it would propose, correct or finalize |
| `node scripts/add-match.ts match.json --check` | Validate a new fixture before upload ([runbook](docs/runbooks/add-match.md)) |
| `node scripts/brand-assets.ts` | Rebuild logo SVGs, favicon, touch icon and link-preview image |
| `deploy/publish.sh [web\|api\|all]` | Ship web and API to the host |

## Testing and evidence

| Suite | Count | Covers |
|---|---|---|
| Foundry | 127 tests | Mint, caps, squads, settle, correct, void, finalize, burn, rollover, claim, claim and keep, refund, market, transfer lock, reentrancy, payout conservation fuzz; Hunt decks, tiers, allowlist, reveal window, "wanted cards == winners" fuzz |
| Vitest | 77 tests | Payout math, squad and allowlist tree vectors (pinned to Solidity), FotMob settlement on a real match, fixtures, mock client, formatting, leaderboard, card metadata |
| Playwright | 16 flows × desktop + mobile (32 runs) | Landing, pick and mint, pack opening, binder, sell and cancel, claim, claim and keep, Hunt packs, finds and payouts, free Silver allowlist |
| Slither 0.11.6 | No defects | Every result reviewed in [`docs/security.md`](docs/security.md), including the Hunt's block-hash draw |

CI ([`.github/workflows/verify.yml`](.github/workflows/verify.yml)) runs lint, typecheck, tests, design guards and build on every push.

## Deployments

| Contract | Network | Address |
|---|---|---|
| BallIsFlat | Robinhood Chain mainnet (4663) | [`0x870026b3f2bd616675282b051c07a51caa4203a8`](https://robinhoodchain.blockscout.com/address/0x870026b3f2bd616675282b051c07a51caa4203a8) |
| BallIsFlatHunt | Robinhood Chain mainnet (4663) | [`0xe181cf4e0a3e3ea8b5e32626b68296e93033420d`](https://robinhoodchain.blockscout.com/address/0xe181cf4e0a3e3ea8b5e32626b68296e93033420d) |
| $WIF | Robinhood Chain mainnet (4663) | [`0x5173b8eA6923c2d40267890D45C46a3480954773`](https://dexscreener.com/robinhood/0x71ef4106340f0a3b9c19ec994eef4fc44a1d2513f38faac39d7636b156548c79) |

Both contracts are verified on Sourcify (exact match); addresses are also in [`deployments.json`](packages/config/src/deployments.json).

**Mainnet transactions from the demo video:**

- Mint a pick card (England v Croatia, Jude Bellingham): [`0x1c563c28…7a24c0`](https://robinhoodchain.blockscout.com/tx/0x1c563c2875db61e6a162d2bd141c83d75f36d042d6947301a009d1e19a7a24c0)
- Open the sealed card: [`0x900538a0…ded325`](https://robinhoodchain.blockscout.com/tx/0x900538a0d0e9191f501c6581b4a3da7897cc5fdc7d672ecae8a63228f4ded325)
- Buy a Hunt Silver pack: [`0x35c30315…a36a04`](https://robinhoodchain.blockscout.com/tx/0x35c3031517db80ff192f7f470afbe4b3e7f4f5e8f3d97b201e2bad4cf4a36a04)

**Launch parameters:** 1,000 $WIF per card · 10% of every pot burned · 5% of every resale burned · 50 $WIF keep fee, burned · 10 cards per player per match · 2 hour dispute window. Hunt: 10,000-card deck, 3 wanted cards, 100,000 $WIF prize pool. First fixtures: UEFA Nations League, 12-17 Nov 2026.

## Repo map

```
apps/
  web/              React app: landing, board, market, pack, binder, leaderboard, /ops
  indexer/          Ponder indexer + Hono API + card metadata and images
packages/
  contracts/        BallIsFlat.sol, IBallIsFlat.sol, BallIsFlatHunt.sol, Foundry tests
  core/             payout math, squad and allowlist merkle trees, FotMob settlement, formatting
  config/           chain, $WIF, fixtures and squads, player ids, ABI, deployments, brand
scripts/            deploy, settler bot, add-match, brand assets, art pipeline, design guards, screenshots
deploy/             Caddyfile, Postgres compose, systemd units (API, settler timer), publish script, runbook
brand/              logo source sheet, tracer, exported PNGs
e2e/                Playwright demo path
docs/               PRD, architecture, decisions, security, UX flow, runbooks, media
```

## Prior art

Other entries in this event are pot-and-burn games on prices and stocks. Ball is Flat is the football one: a pari-mutuel pot on a single outcome per match, where the pick itself is a collectible card. Fantasy football settles weekly on points and sportsbooks price odds; here there are no odds and no house, and an unpopular correct pick pays the most.

## FAQ

<details>
<summary><b>Who decides the MVP?</b></summary>

The top FotMob player rating for the match. The settler posts it onchain with the FotMob match link. If FotMob has no ratings, SofaScore with the same rule. Anyone can check the link during the 2 hour window.
</details>

<details>
<summary><b>What if two players share the top rating?</b></summary>

The pot is split across every card on every tied player.
</details>

<details>
<summary><b>What if my player doesn't play?</b></summary>

The card stays in the pot like any other losing pick. This is shown before you mint.
</details>

<details>
<summary><b>What if the match is postponed?</b></summary>

The match is voided and every card refunds its full 1,000 $WIF price.
</details>

<details>
<summary><b>Can I sell my card after kickoff, or send it to a friend?</b></summary>

No. Sealed cards can be sold only through the in-app market and only before kickoff. Wallet-to-wallet transfers revert, so every sale pays the 5% burn and nobody trades a card once the result is known.
</details>

<details>
<summary><b>Where does the team make money?</b></summary>

It takes no cut of the match pots: 90% of each pot goes to winners and 10% is burned. Hunt packs are the team's income: 10% of each pack burns, the rest goes to the treasury, which pays every Hunt prize.
</details>

<details>
<summary><b>What does Claim &amp; Keep cost?</b></summary>

50 $WIF from your share, burned. You get the rest of the share and the card stays in your wallet, marked Kept. Plain Claim pays the full share and burns the card.
</details>

<details>
<summary><b>Can the Hunt draw be gamed?</b></summary>

A pack is drawn from the hash of the block after you pay, which nobody knows when they buy, and packs open strictly in purchase order. On a rollup the sequencer produces that hash, which is the residual trust; the Hunt holds no funds, and every find and payout is public. Details in <a href="docs/security.md">docs/security.md</a>.
</details>

## Roadmap

- [x] Contract with merkle squads, market, transfer lock and burn-only rollover
- [x] Web app: board, market, pack opening, binder, leaderboard, owner panel
- [x] Indexer + API with live card metadata and images
- [x] BIF brand: logo, favicon, link previews
- [x] Settler bot from FotMob ratings, with corrections and finalize
- [x] The Hunt: wanted-player decks, Silver, Gold and Diamond packs, free allowlist packs
- [x] Claim & Keep
- [x] Mainnet deploy, verified contracts, real mint, open and Hunt pack transactions
- [ ] Nations League matchdays 5 and 6 (12-17 Nov 2026)
- [ ] Club leagues: Premier League, La Liga, Champions League
- [ ] Settlement from several rating sources, then an attested verifier
- [ ] Season leaderboard

## Team and AI use

**youvandra**: product, contracts, app.

Built with Claude Code as a pair. It helped with UI implementation, tests, tooling and the brand assets. The game mechanism, contract design, trust model and every product decision were made and reviewed by the team, and every change passes the same tests and CI.

<div align="center">
<br>
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/media/logo-white.svg"><img src="docs/media/logo-black.svg" alt="" width="90"></picture>
<br>
<sub>Built for the <a href="https://worldisflat.fun/build">world is flat</a> hackathon. The ball is flat, everyone knows that.</sub>
</div>

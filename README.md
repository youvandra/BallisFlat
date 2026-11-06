# Ball is Flat

Pick the man of the match before kickoff, mint the pick as a card in $WIF, and burn the card to take your share of the pot when your player comes out on top. Built for the world is flat hackathon on Robinhood Chain.

## The problem

A fan watching England v Croatia is sure Bellingham will run the match. That take is worth nothing today: fantasy games settle weekly on points, and betting books want odds, KYC and a minimum stake. There is no one-tap way to back "the best player on the pitch tonight" and keep a record of calling it.

## How it works

1. **Pick.** Each listed match shows both squads. Every player shows "×N if he wins", the share of the pot one card on him would take right now. One pick per wallet per match, closing at kickoff.
2. **Mint.** The pick is an ERC-721 card paid in $WIF (1,000 $WIF per card). Every card adds its price to the match pot. The card arrives as a sealed pack you tear open.
3. **Settle.** After full time the settler posts the top-rated player with a link to the published rating. A 2-hour dispute window follows, then anyone can finalize.
4. **Claim.** A winning card is burned to pay out pot × 90% ÷ winning cards. 10% of every pot goes to the dead address. A pot nobody called rolls into the next listed match, so the next game starts bigger.

Sealed cards can be listed and bought before kickoff (at most 10 cards per player per match, 5% of each sale burned). An opened card can never be sold.

### The flywheel

Football runs several matches every few days, so the calendar brings people back. Each matchday burns $WIF, uncalled pots roll forward into the next fixture, and an unpopular correct pick pays the most.

## Trust model

| Power | Who | Limit |
|---|---|---|
| Move pot funds | Nobody directly | $WIF leaves only through `claim` (winning card burned), `refund` (voided match), the burn, or a rollover into the next match |
| Receive an uncalled pot | Owner (treasury) | Only when no later match is still open to roll into; after renouncing ownership it goes to the dead address |
| List matches, set settler, pause new mints | Owner | Pausing stops mints only; claims and refunds always work |
| Post and correct the result | Settler (one key, disclosed on the site) | Only during the dispute window; every result carries its source URL |
| Void a match | Settler or owner | Only before finalize; every card then refunds its full price |
| Finalize | Anyone | Only after the dispute window ends |
| Upgrade | Nobody | The contract has no proxy |

The single settler is the open trust assumption. The dispute window and the published source are what keep it honest during this event.

Full diagram, match lifecycle and code map: [`docs/architecture.md`](docs/architecture.md).

## How it's made

Solidity 0.8.24 contract on Foundry with OpenZeppelin 5 (`ERC721Enumerable`, `SafeERC20`, `ReentrancyGuard`, `Ownable`). Payout math lives once in TypeScript (`packages/core`) and is shared by the app and the tests, so the "×N if he wins" number on screen matches the contract. The web app is Vite 8 + React 19 + wagmi/viem on chain 4663, with TanStack Query and Tailwind 4. Its tokens and components are measured from the Framer landing so the app and the landing read as one product. Player and match art is generated (faceless cut-out figures, no player likeness) and served from CloudFront.

The app runs in two modes behind one client interface: `mock` (an in-browser chain, no wallet needed) and `chain` (the deployed contract). The whole demo path has been run end to end against the real contract on a local anvil fork with chain id 4663: approve, mint, open, settle, finalize and claim.

## Built on Robinhood Chain and $WIF

| Piece | Job here | Code |
|---|---|---|
| $WIF `0x5173b8eA6923c2d40267890D45C46a3480954773` | Card price, match pot, payout, burn | [`BallIsFlat.sol`](packages/contracts/src/BallIsFlat.sol) |
| Robinhood Chain (4663) | Cards, pots and settlement live here | [`chain.ts`](packages/config/src/chain.ts) |
| Dead address burn | 10% of every pot, 5% of every resale | [`constants.ts`](packages/config/src/constants.ts) |

## Deployments

| Contract | Network | Address |
|---|---|---|
| BallIsFlat | Robinhood Chain mainnet | pending, see [`deployments.json`](packages/config/src/deployments.json) |

## Evidence

- Contract: 86 Foundry tests (mint, settle, dispute, correct, void, finalize, burn, rollover, claim, refund, resale)
- TypeScript: 46 unit tests (payout math, formatting, fixtures, mock client, leaderboard)
- End to end: 10 Playwright flows, each on mobile and desktop
- CI runs lint, typecheck, tests, design guards and build on every push
- Mocked until mainnet deploy: the in-browser chain in `mock` mode and the warm-up match result

## Run locally

```bash
git clone --recursive https://github.com/youvandra/BallisFlat.git && cd BallisFlat
cp .env.example .env
npm install
npm run dev
```

Against a local chain (needs Foundry):

```bash
npm run chain:local     # anvil on chain id 4663
npm run deploy:local    # mock $WIF + BallIsFlat, lists fixtures, seeds a settled warm-up
npm run dev:local
```

Checks: `npm run verify`, `npm run e2e`, `cd packages/contracts && forge test`.

## Repo map

```
packages/contracts   BallIsFlat.sol, Foundry tests, deploy script
packages/core        payout math and formatting shared by app and tests
packages/config      chain, $WIF constants, fixtures and squads, ABI, deployments
apps/web             the app: matches, market, pack, binder, leaderboard, ops
scripts              deploy, art generation, design guards
e2e                  Playwright demo path
docs                 PRD, screen flow, decisions, design rules
```

## Prior art

Other entries in this event are pot-and-burn games on prices and stocks. Ball is Flat is the football one: a pari-mutuel pot on a single outcome per match, where the pick itself is a collectible card.

## Team

youvandra: product, contracts and app.

## AI use

Built with Claude Code as a pair. It assisted with UI implementation, test writing and the art pipeline. The game mechanism, contract design, trust model and every product decision were made and reviewed by the team, and every change passes the same tests and CI.

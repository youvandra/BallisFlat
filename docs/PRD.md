# Ball is Flat — one-pager PRD

_Event:_ world is flat hackathon (class C, community vote decides) · _Owner:_ youvandra · _Date:_ 2026-11-05 · _Status:_ draft

## Official criteria (verbatim, worldisflat.fun/build/rules)
- "build a product on Robinhood Chain that people keep coming back to ... as long as it puts $wif to work inside it, and it needs a flywheel, so using it keeps bringing people back."
- Rule 3: "your project has to use $wif onchain on Robinhood Chain."
- Rule 4: "it has to stay live and working until the final closes, because we'll be trying it."
- Rule 5: "show us proof with a repo we can see, a demo video and real transactions."
- Judging: "judges look for a real reason to use $wif, a flywheel that holds up, and something that works and is built well."
- Flow: organizers approve, judges plus community ($WIF burned per vote, one judge seat) vote, top 10 to final, final vote. One winner, 10,000 USDG.
- Dates: submissions close 12 Nov 2026 17:30 UTC; round one 12-14 Nov; final 14-16 Nov 17:30 UTC.
- Rule 11: no Robinhood name or logo in name, logo, handles.

## 0. Pitch (Shape Up)
- **Problem story:** A football fan watches England v Croatia and is sure Bellingham runs the match. Today that opinion is worth nothing: fantasy games settle weekly on points, and betting sites only offer goalscorer odds. There is no small, one-tap way to back "the best player on the pitch tonight" and keep a record of being right.
- **Appetite:** about 3 working days between 6 and 12 Nov (shared with Counterweight and UGREEN).
- **Solution (fat-marker):**
  1. Match board: upcoming fixtures, each with the two squads.
  2. Pick card: one pick per wallet per match, minted as an NFT card, paid in $WIF, closes at kickoff.
  3. Settlement: after full time the highest-rated player is posted with a source link, then a dispute window.
  4. Claim: winning cards are burned to take a pro-rata share of the match pot. Losing cards stay as a record.
  5. Burn and rollover: a fixed share of every pot is burned; a pot nobody called rolls into the next match.
- **Rabbit holes:**
  - Settlement source: ratings feed coverage for Nations League is unverified. Patch: day-1 spike against one provider; fallback is the settler posting the published rating with the URL.
  - Gas for new users: keep the mint one transaction (approve plus mint via permit if $WIF supports it, else two transactions).
  - Dead demo window: Nations League matchday 5 (12-14 Nov) and 6 (15-17 Nov) run during judging; club leagues pause 14-15 Nov.
- **No-gos:** computer vision on match footage, odds or leverage, any fiat on-ramp, more than one sport, a token of our own.

## What we do (two sentences)
Ball is Flat is a match-by-match pick game that lets football fans back the player they think will be man of the match with $WIF. You mint one card before kickoff, and if your player is the top-rated on the pitch you burn the card to take your share of the pot.

## Insight
Pari-mutuel on a single, unambiguous outcome per match is the smallest repeatable unit of a sports pick: no odds to price, no house, and an unpopular correct pick pays more. Football runs several matches every few days, so the reason to come back is the calendar itself.

## Problem
Casual fans have no low-stakes way to stake a single-match opinion on a player. Fantasy needs a weekly squad and a season; betting books need odds, KYC and a minimum stake, and most of them are unavailable in Indonesia and many other markets.
Source for the number: to be filled (Google Trends "man of the match" vs "fantasy", match-day spikes).

## User
- **ICP:** $WIF holders who follow football (the community already voted in "Who is the G.O.A.T.?").
- **Persona:** a crypto-native fan who watches the big international and club matches on stream and posts takes on X.
- **Job:** When a big match is about to start, I want to put a small stake on the player I rate, so I can prove I called it.
- **Forces:** push: takes are free and worthless · pull: one tap, cheap, a collectible proof · anxiety: who decides the winner · habit: fantasy apps.

## Why now, why here, why us
- Now: Nations League matchdays 5 and 6 run 12-17 Nov 2026, inside the judging window.
- Here: $WIF is the stake, the pot and the burn; the card lives on Robinhood Chain next to the $WIF/ETH Uniswap v4 pool. The NEAR variant replaces the settler with a TEE-attested verifier (separate entry).
- Us: shipped prediction and settlement code before (Delphi Arena, Ramalogy).

## Goals
1. Live on Robinhood Chain mainnet with at least one settled match before submissions close.
2. Matchday 5 and 6 fixtures open for picks during judging, settled within 2 hours of full time.
3. Every pot shows its burned $WIF on the match page, with the transaction link.

## Non-goals
- Video analysis, AI player detection, live in-match odds.
- Leagues outside the curated fixture list.
- Mobile app.

## Success metrics
- **North Star:** picks per matchday.
- **Activation:** first card minted.
- **Demo proof:** a real card burned for a real payout, plus total $WIF burned.

## Demo path (the one flow)
Screen spec: `docs/ux-flow.md` (board → market → confirm → pack opening → binder → claim).
1. Board → England v Croatia market, each player shows "×N if he wins" → 2. pick a player, approve + mint for 1,000 $WIF → 3. tear the pack, card #N rises → 4. Binder: a pre-settled warm-up match card → burn to claim → result: payout and burn visible on Blockscout.

Scope decision 2026-11-06: per-match pick board only (pari-mutuel). No secondary trading of cards.

## User stories and acceptance criteria
| # | Story | Acceptance (given / when / then) | e2e test |
|---|---|---|---|
| 1 | As a fan, I can mint one pick card for a match | Given an open match and enough $WIF, when I pick a player, then one card is minted and the pot grows by the price | `e2e/pick.spec.ts` |
| 2 | As a fan, I cannot pick twice or after kickoff | Given I hold a card for this match or kickoff has passed, when I pick, then the contract reverts with a named error | contract test |
| 3 | As the settler, I post the result with a source | Given full time, when I post the player id and source URL, then the match enters a dispute window | contract test |
| 4 | As a winner, I burn my card to claim | Given a finalized match and a winning card, when I claim, then the card is burned and I receive pot × (1 − burn share) ÷ winning cards | `e2e/claim.spec.ts` |
| 5 | As anyone, I see a pot nobody called roll over | Given a finalized match with no winning card, when it finalizes, then its pot (minus burn) moves to the next listed match | contract test |
| 6 | As a fan, I see what each player would pay before I pick | Given an open match, when I open its market, then every player shows cards on him, share of picks and "×N if he wins" matching the contract math | `packages/core` unit test |
| 7 | As a fan, I open my own pack after minting | Given a confirmed mint, when I tear the pack (drag, tap or keyboard), then my card shows player, match and serial "#n of total"; reloading shows it opened | `e2e/open.spec.ts` |
| 8 | As a fan, I see all my cards by state | Given a wallet with cards, when I open the binder, then cards sit under Claim, Waiting, Missed, Refund or Claimed matching contract state | `e2e/binder.spec.ts` |

## Architecture and trust model
Contracts: `BallIsFlat` (ERC-721 cards, match registry, pots, settlement, claim). Web: Next.js, wagmi on chain 4663.
Who can move funds: nobody except a winning card holder via claim and the burn address. Who reports: one settler key, disclosed on the site, with a dispute window during which the settler can correct a result and the owner can void the match. Pause: owner can pause new picks, never claims. Upgrade: none.

## Failure modes
| Failure | Mechanism that handles it |
|---|---|
| Match postponed or abandoned | Settler marks void; every card refunds its price |
| Settler posts a wrong player | Dispute window; correction before finalize; source URL shown |
| Picked player does not play | Card stays in the pot (stated before mint) |
| Nobody picked the winner | Pot rolls to the next match |
| Rating tie | Pot split across all tied players' cards |

## Glossary
| Word | Meaning |
|---|---|
| Card | The NFT minted for one pick |
| Pick | Choosing one player for one match |
| Pot | All $WIF paid for one match |
| Settle | Posting the top-rated player |
| Claim | Burning a winning card for its share |
| Rollover | Moving an uncalled pot to the next match |

## Market (bottom-up)
To be filled after demand scan (KIT/17).

## Risks and assumptions
| Assumption | Risk type | How we test it |
|---|---|---|
| A ratings feed covers Nations League with per-player ratings within 2h | feasibility | Day-1 spike with one provider key |
| $WIF holders want a football game | value | Count football replies on @WIFonRH; ask in Discord after it is live |
| Judges accept a single settler with a dispute window | viability | State it plainly; NEAR TEE variant as the upgrade path |
| Sports pick game is legal in the judges' eyes | viability | Rules allow games with $WIF; terms state no availability where prohibited |

## Open questions
- Card price: fixed 1,000 $WIF (about $1.40 on 5 Nov) or chosen per match?
- Burn share: 10% of each pot?
- Settlement source: rating provider vs a published Player of the Match where one exists.

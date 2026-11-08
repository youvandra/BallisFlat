# Contract security

Scope: `packages/contracts/src/BallIsFlat.sol`, `IBallIsFlat.sol` and `BallIsFlatHunt.sol`, compiled with solc 0.8.28 (pinned), EVM
`cancun`. Robinhood Chain is an Arbitrum Orbit chain, so PUSH0 and the Cancun opcodes are available.

## Tests

127 Foundry tests (9 Nov 2026). Earlier summary, still true for BallIsFlat: 99 Foundry tests (unit, fuzz and reentrancy mocks): mint, squad proofs for squads of 1 to 60 players, batch
listing, squad updates before kickoff, settle, correct, dispute window, void and refund, finalize with burn and
rollover, claim, sealed-card market, metadata URIs and ERC-4906 events. The squad tree is pinned to the same
vector in Solidity and in `packages/core/src/squad.test.ts`.

## Slither re-run 9 Nov 2026 (Hunt v2 decks + claimAndKeep)

**Slither 0.11.6** (`--exclude-informational --exclude-dependencies`): 19 results, none a defect. New since 7 Nov,
all in `BallIsFlatHunt`:

| Detector | Verdict |
|---|---|
| weak-prng (`_open`, `_drawsWanted`) | Known and accepted: a pack draws from the blockhash of the block after its purchase, unknown when the buyer pays. On Robinhood Chain (Arbitrum Orbit) that hash comes from the sequencer, which could in principle bias it. Hunt holds no funds (pack money goes to the treasury and burn at purchase; prizes are paid by hand and recorded with `markPaid`), so the worst case is a biased pack, which the team can see in the open record before paying. Packs are opened strictly in purchase order, so nobody can pick which pack a draw lands on |
| uninitialized-state (`_pools`, `_finds`) | Mappings filled by `startRound` and `_recordFind`; false positive |
| uninitialized-local (`hasTarget`) | `false` is the intended start |

Matches contract: same findings as 7 Nov below (timestamp, incorrect-equality, uninitialized-local,
shadowing-local). `claimAndKeep` adds none: checks, then state (`_kept`), then transfers, under `nonReentrant`.

## Static analysis (Slither re-run 7 Nov 2026 after CardLocked + pot burn; Aderyn last run 6 Nov)

**Slither 0.11.6** (`--exclude-informational`): 0 high, 0 medium. 14 low/other results, all reviewed:

| Detector | Verdict |
|---|---|
| timestamp | By design: kickoff, dispute window and trading close are wall-clock rules measured in hours; a few seconds of sequencer drift change nothing |
| incorrect-equality (`status == None`, `cap == 0`) | Enum and zero checks, not balance equality |
| uninitialized-local (`rolledTo`, `burnPool`, `winningCards`) | Zero is the intended starting value |
| shadowing-local (`setSettler(address settler)` in the interface) | Parameter name only |

**Aderyn** (Cyfrin): 0 high, 8 low, all reviewed:

| Issue | Verdict |
|---|---|
| L-1 Centralization risk | Owner lists matches, sets the settler and metadata, pauses mints. It can never move pot funds or pause claims and refunds. Settler posts results inside a public dispute window. Listed in the trust model (README, docs/architecture.md) |
| L-2 Costly operations in loops | Bounded by squad size (merkle hashing, no storage per player), the winners of one match, and a batch the owner sends |
| L-3 Large numeric literal | `10_000` basis points |
| L-4 PUSH0 | Supported on Robinhood Chain |
| L-5 Revert inside loop | Intended: one bad id rejects the whole squad, listing or winner set |
| L-6 Unchecked return | `_requireOwned` is called for its revert; `_listMatch` id is not needed inside `listMatches` |
| L-7 Unspecific pragma | Fixed: pinned to 0.8.28 |
| L-8 Public function not used internally | `inSquad`, `squadRoot` and `claimable` are public reads for the app and API |

## Trust assumptions

- One settler key posts the top-rated player with a source URL; a wrong result can be corrected inside the
  2-hour dispute window, and the owner or settler can void a match before finalize (full refunds).
- The owner can pause new mints only. No proxy, no upgrade, no sweep.
- Uncalled pots with no open match to roll into are burned; no key ever receives pot funds.
- Cards cannot be transferred wallet to wallet (`CardLocked`); the only way a card changes hands is `buy`, which charges the sale burn and is closed for opened cards and after kickoff.

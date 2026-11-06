# Ball is Flat contracts

`BallIsFlat` is one contract: an ERC-721 of pick cards ("Ball is Flat", `BIF`), the match registry,
the pots, settlement and claims. Paid in $WIF (ERC-20, 18 decimals). The shared interface is
`src/IBallIsFlat.sol`; change it only together with `packages/core` and `apps/web`.

Target: Robinhood Chain mainnet (chain id 4663, Arbitrum Orbit), $WIF at
`0x5173b8eA6923c2d40267890D45C46a3480954773`. Solidity 0.8.28, EVM `cancun`, OpenZeppelin v5.7.

## Commands

```shell
forge build
forge test -vv                # 86 tests
forge fmt
node scripts/export-abi.mjs   # after forge build: writes packages/config/src/abi/BallIsFlat.ts
```

## Lifecycle

`listMatch` (owner) -> `mint` until kickoff -> `propose` (settler, after kickoff) -> `correct`
(settler, inside the dispute window) -> `finalize` (anyone, from `proposedAt + disputeWindow`) ->
`claim` (winning card holder, burns the card).

Alongside, from mint until kickoff: `open` (one-way reveal), and the sealed-card market
`listForSale` -> `buy` / `cancelListing`.

- **Per-player cap:** `listMatch(..., maxPerPlayer)` caps cards per player for that match (0 = unlimited).
  `mint` reverts `PlayerSoldOut(matchId, playerId)` at the cap. `remaining(matchId, playerId)` returns
  `type(uint32).max` when unlimited and 0 for an unknown player. Burned cards keep counting.
- **Open:** `open(tokenId)`, owner only, sets `isOpened(tokenId)`; second call reverts `AlreadyOpened`.
  Opened stays opened across transfers. An opened card can never be listed or bought.
- **Market:** sealed cards only, match `Listed` and `block.timestamp < kickoff`, no escrow (the card stays
  in the seller's wallet). `listForSale(tokenId, price)` (owner, price > 0; re-listing updates the price),
  `cancelListing(tokenId)` (seller), `buy(tokenId, maxPrice)` pulls `price` $WIF from the buyer:
  `price * saleBurnBps / 10000` (floored) to `0x…dEaD`, the rest to the seller, then the card moves to the
  buyer. The pots are never touched. Every transfer, burn (claim/refund) and `open` clears the listing
  and emits `ListingCancelled`; at kickoff or void listings stop being buyable without a keeper.

- **Finalize:** `burned = pot * burnBps / 10000` goes to `0x…dEaD`; `payPool = pot - burned`.
  `winningCards` is the sum of `cardsOn(winner)` over all winners (a tie names several players).
- **Rollover:** with zero winning cards, `payPool` is added to `nextMatch.rolledIn` and `nextMatch.pot`
  when that match is still Listed or Proposed; otherwise (nextMatch 0, Finalized or Voided) it is
  burned to `0x…dEaD`.
- **Void:** settler or owner, while Listed or Proposed. Every card refunds exactly its `price`. The
  match's `rolledIn` moves on to its own `nextMatch` and is burned when it cannot.

## Design decisions

- **Cards are locked to the market.** `transferFrom` / `safeTransferFrom` revert with
  `CardLocked(tokenId)`, approved operators included. A card changes hands only through `buy`, so the
  sale burn always applies and an opened card or a card past kickoff never moves. Mint and burn
  (claim, refund) are unaffected.
- **One card per wallet per match, by original minter.** `cardOf(matchId, wallet)` is set at mint
  and never cleared. Selling a card does not free the wallet to mint again, and `cardOf`
  keeps returning the minted token id after a sale, claim or refund. The UI should use `ownerOf`
  / `tokenOfOwnerByIndex` for "cards I hold" and `cardOf` for "did I already pick".
- **Claim follows the current owner.** A bought winning card is claimed by whoever holds it.
  An approved operator cannot claim or refund; only the owner can.
- **Rounding dust stays in the contract.** Each claim pays `floor(payPool / winningCards)`; at most
  `winningCards - 1` wei per match is left behind. There is deliberately no sweep, so no key can move
  pot funds.
- **`MatchFinalized.rolledTo`** is the match id the uncalled pot rolled into; `0` means either the
  pot was burned (`winningCards == 0`) or nothing rolled (`winningCards > 0`).
- **Market buyers do not get a mint slot.** `cardOf` stays with the minter; a buyer can still mint one
  card of their own, and can hold any number of bought cards of the same match. Claims and refunds pay
  whoever holds the card (a refund pays the mint `price`, not what the buyer paid).
- **No on-chain listing index (gas).** Listings are one mapping, so list/cancel/buy/transfer stay O(1). The
  app finds a match's listings from `CardListed` logs (topic `matchId`), dedupes token ids, and keeps the
  ones where `listingOf(tokenId)` returns a non-zero seller. `listingOf` is the only source of truth.
- **Errors beyond the interface:** `ZeroAddress` (constructor/setSettler), `InvalidBurnBps` (constructor, > 10000),
  `InvalidListing` (kickoff not in the future, price 0, empty or duplicate players, unknown
  nextMatch), `InvalidWinners` (empty or duplicate winner list). Unlisted winner ids revert with the
  interface's `UnknownPlayer`. Status mismatches revert `WrongStatus`; mint on a non-Listed match
  reverts `NotListed`.
- **Extra reads/events:** `mintPaused()`, `DEAD()`, `BPS()`, `SettlerSet`, `MintPausedSet`.
  `InvalidBurnBps` also covers `saleBurnBps > 10000`.
- Cards are minted with `_safeMint`: a contract wallet must implement `onERC721Received`.
- $WIF is assumed to be a plain ERC-20 (no fee on transfer, no rebasing). `mint` records `price`
  as received.

## Trust model

- **Owner** (deployer key): lists matches, pauses new mints (never claims or refunds), replaces the
  settler, and can void a match before finalize. It never receives pot funds.
  If the owner key leaks, the attacker can void open matches (cards get refunded in full) and list
  fake matches; it cannot take pot funds of a finalized match or change a result.
- **Settler** (one key, disclosed on the site): proposes the winner with a rating source URL and
  can correct it during the dispute window (2 h at launch). If it leaks, it can post a wrong
  result; the owner can void during the window, which refunds every card.
- **Anyone** can finalize once the window has passed. Funds leave only via claim (winning holder),
  refund (voided match) and the burn address.
- **Market:** no key can touch a sale. `saleBurnBps` is immutable (set at deploy), so the fee a seller
  agreed to cannot change under a live listing. Buyers are protected from a price raise by `maxPrice`.
- No upgrades, no proxy.

### Market risks

- **Front-running a buy:** the seller can re-list at a higher price before a buy lands; `buy` reverts
  `PriceAboveMax` instead of charging more. A lower listed price is charged as listed.
- **Stale listings:** cleared on transfer/burn/open; kickoff and void are checked at buy time. A card
  transferred away and back does not revive its old listing.
- **Reentrancy via hook tokens or receiver contracts:** `open`, `listForSale`, `cancelListing`, `buy`
  are `nonReentrant`; the listing is deleted before any external call. A seller cannot open the card
  while being paid.
- **Wash trading / burn:** any sale burns `saleBurnBps`; there is no reward for volume, so wash trading only
  burns the trader's own $WIF.
- **Information edge:** the pick is public and trading stops at kickoff, so nobody trades on a known or
  live result. Lineup news before kickoff is fair game.

## Security checks (tests in `test/BallIsFlat.t.sol` and `test/Market.t.sol`)

| Risk | Test(s) |
|---|---|
| Access control | `test_ListMatch_AccessControl_StrangerReverts`, `test_Propose_AccessControl_NonSettlerReverts`, `test_Correct_AccessControlAndStatus`, `test_Void_AccessControlAndStatus`, `test_Claim_AccessControl_StrangerReverts`, `test_SetSettler_OwnerOnlyAndNonZero`, `test_Mint_PausedReverts_AndPauseIsOwnerOnly` |
| Business logic / invariants | `testFuzz_PayoutConservation` (claims + burned + dust == pot, dust < winningCards), `testFuzz_VoidRefundsExact`, rollover and void tests |
| Input validation | `test_Constructor_InputValidation`, `test_ListMatch_InputValidation`, `test_Propose_InvalidWinners`, `test_Mint_UnknownPlayerReverts` |
| Timing boundaries | `test_Mint_TimingBoundary_AtKickoffReverts`, `test_Propose_BeforeKickoffReverts_AtKickoffOk`, `test_Correct_InsideWindow`, `test_Correct_OutsideWindowReverts`, `test_Finalize_TooEarlyReverts_BoundaryOk` |
| External calls / reentrancy | `test_Reentrancy_ClaimViaTokenHook`, `test_Reentrancy_RefundViaTokenHook`, `test_Reentrancy_MintViaERC721Receiver`, `test_Reentrancy_FinalizeDuringClaim` |
| Rounding | `test_Claim_PaysFloorAndBurnsCard`, fuzz with price from 1 wei to 1e30 and burnBps 0..10000 |
| Market (open, cap, list/cancel/buy) | `test/Market.t.sol`: `test_Open_*`, `test_Cap_*`, `test_Buy_HappyPath_ExactBalances`, `test_Buy_*Reverts`, `test_Buy_StaleListingAfterTransferReverts`, `test_Claim_BurnClearsListing`, `test_Buyer_ClaimsWinningCard`, `test_Reentrancy_*`, `testFuzz_SaleConservation` |
| Double claim / transfer | `test_Claim_DoubleClaimReverts`, `test_Claim_TransferThenNewOwnerClaims`, `test_Mint_TransferAwayStillBlocksSecondMint` |
| Oracle | single settler with a dispute window; no price feed |
| Upgradeability | none |

## Deploy (do not broadcast without the owner's go-ahead)

```shell
export WIF_ADDRESS=0x5173b8eA6923c2d40267890D45C46a3480954773
export SETTLER_ADDRESS=0x...
# optional: BURN_BPS (default 1000), DISPUTE_WINDOW (default 7200), SALE_BURN_BPS (default 500)
forge script script/Deploy.s.sol:Deploy --rpc-url $RPC_URL --account <keystore> --broadcast
```

The broadcasting account becomes the owner.

## Listing a match

```shell
# England v Croatia, kickoff 2026-11-13 19:45 UTC, 1,000 $WIF per card, no next match,
# players 9, 10, 7 (ids from packages/config fixtures), at most 10 cards per player
cast send $BALL_IS_FLAT "listMatch(uint64,uint256,uint256,uint32[],uint32)" \
  1794599100 1000000000000000000000 0 "[9,10,7]" 10 \
  --rpc-url $RPC_URL --account <keystore>
```

To chain an uncalled pot into a later match, list the later match first and pass its id as
`nextMatch` of the earlier one (`nextMatch` must already exist).

Settle:

```shell
cast send $BALL_IS_FLAT "propose(uint256,uint32[],string)" 1 "[9]" "https://www.fotmob.com/..." --account <settler>
# after disputeWindow
cast send $BALL_IS_FLAT "finalize(uint256)" 1 --account <any>
```

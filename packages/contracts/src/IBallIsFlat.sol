// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Ball is Flat — man of the match pick cards paid in $WIF.
/// @notice One card per wallet per match. Cards are ERC-721. The pot is split pari-mutuel between the
///         cards that named the winning player; a share of every finalized pot is burned.
///         Sealed cards can be sold before kickoff on a built-in market (no escrow); a share of every
///         sale is burned. Opening a card is one-way and takes it off the market for good.
/// @dev This interface is the contract between packages/contracts, packages/core and apps/web.
///      Change it only together with all three.
interface IBallIsFlat {
    /// Stored lifecycle. `Locked` and `RolledOver` are derived in `stateOf`.
    enum Status {
        None, // not listed
        Listed, // open until kickoff, then locked
        Proposed, // result posted, dispute window running
        Finalized, // payouts open (or pot rolled over)
        Voided // called off, cards refundable
    }

    /// What the UI shows. Derived from Status + time + winningCards.
    enum State {
        None,
        Open,
        Locked,
        Proposed,
        Final,
        RolledOver,
        Void
    }

    struct MatchInfo {
        uint64 kickoff; // unix seconds; minting closes at kickoff
        uint64 proposedAt; // 0 until a result is proposed
        uint32 cards; // cards minted (burned cards still count)
        uint32 winningCards; // set at finalize
        uint32 maxPerPlayer; // cards per player cap, 0 = unlimited
        Status status;
        uint256 price; // $WIF per card (18 decimals)
        uint256 pot; // price * cards + rolledIn
        uint256 rolledIn; // added from earlier uncalled pots
        uint256 burned; // set at finalize
        uint256 payPool; // pot - burned, set at finalize
        uint256 nextMatch; // where an uncalled pot rolls (0 = treasury)
        string sourceUrl; // rating source for the proposed result
    }

    struct CardInfo {
        uint256 matchId;
        uint32 playerId;
        uint32 serial; // 1-based order within the match ("Card #serial of cards")
    }

    // ---------- events ----------
    event MatchListed(uint256 indexed matchId, uint64 kickoff, uint256 price, uint256 nextMatch, uint32[] playerIds);
    event CardMinted(uint256 indexed matchId, uint32 indexed playerId, uint256 indexed tokenId, address owner, uint32 serial);
    event ResultProposed(uint256 indexed matchId, uint32[] winners, string sourceUrl);
    event ResultCorrected(uint256 indexed matchId, uint32[] winners, string sourceUrl);
    event MatchFinalized(
        uint256 indexed matchId, uint32 winningCards, uint256 burned, uint256 payPool, uint256 rolledTo
    );
    event CardClaimed(uint256 indexed tokenId, uint256 indexed matchId, address owner, uint256 amount);
    event MatchVoided(uint256 indexed matchId);
    event CardRefunded(uint256 indexed tokenId, uint256 indexed matchId, address owner, uint256 amount);
    event CardOpened(uint256 indexed tokenId, uint256 indexed matchId, address owner);
    event CardListed(uint256 indexed tokenId, uint256 indexed matchId, address indexed seller, uint256 price);
    /// Also emitted when a listing is cleared by a transfer, an open or a burn.
    event ListingCancelled(uint256 indexed tokenId);
    event CardSold(
        uint256 indexed tokenId,
        uint256 indexed matchId,
        address seller,
        address indexed buyer,
        uint256 price,
        uint256 burned
    );

    // ---------- errors (named, the UI maps each to a message) ----------
    error NotListed(uint256 matchId);
    error MintClosed(uint256 matchId);
    error AlreadyHasCard(uint256 matchId, uint256 tokenId);
    error UnknownPlayer(uint256 matchId, uint32 playerId);
    error NotSettler();
    error TooEarly();
    error WrongStatus(uint256 matchId, Status status);
    error WindowClosed(uint256 matchId);
    error NotCardOwner(uint256 tokenId);
    error NotAWinner(uint256 tokenId);
    error MintPaused();
    error AlreadyOpened(uint256 tokenId);
    error PlayerSoldOut(uint256 matchId, uint32 playerId);
    error NotForSale(uint256 tokenId);
    error TradingClosed(uint256 matchId); // match not Listed, or kickoff reached
    error PriceAboveMax(uint256 price, uint256 maxPrice);
    error CannotBuyOwnCard(uint256 tokenId);
    error ZeroPrice();

    // ---------- reads ----------
    function wif() external view returns (address);
    function burnBps() external view returns (uint16); // 1000 = 10%
    function saleBurnBps() external view returns (uint16); // 500 = 5% of every market sale
    function disputeWindow() external view returns (uint64); // seconds, 2h at launch
    function settler() external view returns (address);
    function matchCount() external view returns (uint256); // ids are 1..matchCount
    function matchInfo(uint256 matchId) external view returns (MatchInfo memory);
    function stateOf(uint256 matchId) external view returns (State);
    function playersOf(uint256 matchId) external view returns (uint32[] memory);
    function winnersOf(uint256 matchId) external view returns (uint32[] memory);
    function cardsOn(uint256 matchId, uint32 playerId) external view returns (uint32);
    /// tokenId of the wallet's card for this match, 0 if none (token ids start at 1).
    function cardOf(uint256 matchId, address wallet) external view returns (uint256);
    function cardInfo(uint256 tokenId) external view returns (CardInfo memory);
    /// Amount a card would receive on claim right now (0 if not claimable).
    function claimable(uint256 tokenId) external view returns (uint256);
    /// Cards still mintable on this player: type(uint32).max when the match is unlimited, 0 for an
    /// unknown player. Burned cards keep counting against the cap.
    function remaining(uint256 matchId, uint32 playerId) external view returns (uint32);
    function isOpened(uint256 tokenId) external view returns (bool);
    /// The live listing, or (0, 0) when there is none or it can no longer be bought (opened, seller
    /// no longer owns it, match not Listed, kickoff reached).
    function listingOf(uint256 tokenId) external view returns (address seller, uint256 price);

    // ---------- fan ----------
    /// Pulls `price` $WIF via allowance, mints one card. Reverts after kickoff or on a second card.
    function mint(uint256 matchId, uint32 playerId) external returns (uint256 tokenId);
    /// Burns a winning card of a finalized match and pays payPool / winningCards.
    function claim(uint256 tokenId) external returns (uint256 amount);
    /// Burns a card of a voided match and returns its price.
    function refund(uint256 tokenId) external returns (uint256 amount);
    /// Owner only, one-way. An opened card can never be listed or bought.
    function open(uint256 tokenId) external;

    // ---------- market (sealed cards, before kickoff, no escrow) ----------
    /// Owner only. Card sealed, match Listed, before kickoff. Re-listing updates the price.
    function listForSale(uint256 tokenId, uint256 price) external;
    /// Seller only.
    function cancelListing(uint256 tokenId) external;
    /// Pulls `price` $WIF from the buyer via allowance: saleBurnBps to the burn address, the rest to the
    /// seller; the card moves to the buyer. Reverts when the price is above maxPrice.
    function buy(uint256 tokenId, uint256 maxPrice) external;

    // ---------- anyone ----------
    /// After proposedAt + disputeWindow: burns burnBps of the pot; with zero winning cards the rest
    /// rolls into nextMatch.rolledIn (or treasury when nextMatch is 0 or already finalized/voided).
    function finalize(uint256 matchId) external;

    // ---------- settler ----------
    /// After kickoff. Several ids = tie, the pot splits across all their cards.
    function propose(uint256 matchId, uint32[] calldata winners, string calldata sourceUrl) external;
    /// During the dispute window only; restarts nothing.
    function correct(uint256 matchId, uint32[] calldata winners, string calldata sourceUrl) external;
    /// Before finalize. rolledIn moves on to nextMatch; cards become refundable for their price.
    function voidMatch(uint256 matchId) external;

    // ---------- owner ----------
    function listMatch(
        uint64 kickoff,
        uint256 price,
        uint256 nextMatch,
        uint32[] calldata playerIds,
        uint32 maxPerPlayer
    ) external returns (uint256 matchId);
    function setSettler(address settler) external;
    function setMintPaused(bool paused) external;
}

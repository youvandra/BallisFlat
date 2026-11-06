// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IBallIsFlat} from "./IBallIsFlat.sol";

/// @title Ball is Flat
/// @notice Man of the match pick cards paid in $WIF. See IBallIsFlat for the lifecycle.
/// @dev Design notes:
///      - One card per wallet per match is tracked by the ORIGINAL MINTER. Transferring a card away
///        does not let the same wallet mint a second card, and `cardOf` keeps returning the minted
///        token id even after a transfer, claim or refund.
///      - Claim pays floor(payPool / winningCards). The remainder (at most winningCards - 1 wei) stays
///        in this contract forever. There is deliberately no sweep: nobody but a winning card holder
///        (and the burn address) can move pot funds.
///      - Treasury = owner(). If ownership was renounced, treasury-bound $WIF goes to the dead address.
///      - No upgrades. The owner can list matches, pause new mints, swap the settler, and void a match
///        before it is finalized. Claims and refunds can never be paused.
///      - Market: listings hold no escrow. A listing is cleared on every transfer, burn and open, so a
///        stored listing always belongs to the current owner. Kickoff and match status are checked at
///        buy time, so listings expire on their own. Active listings are found from events
///        (CardListed by matchId) and checked with `listingOf`; there is no on-chain index.
///      - Buying a card does not touch `cardOf`: the one-mint-per-wallet slot stays with the minter.
contract BallIsFlat is IBallIsFlat, ERC721Enumerable, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint16 public constant BPS = 10_000;

    // ---------- contract-level errors (not part of the shared interface) ----------
    error ZeroAddress();
    error InvalidBurnBps();
    error InvalidListing();
    error InvalidWinners();

    address public immutable override wif;
    uint16 public immutable override burnBps;
    uint16 public immutable override saleBurnBps;
    uint64 public immutable override disputeWindow;

    address public override settler;
    bool public mintPaused;
    uint256 public override matchCount;
    uint256 private _nextTokenId = 1;

    mapping(uint256 => MatchInfo) private _matches;
    mapping(uint256 => uint32[]) private _players;
    mapping(uint256 => uint32[]) private _winners;
    mapping(uint256 => mapping(uint32 => bool)) private _isPlayer;
    /// matchId => playerId => winner round in which the player was named (see _winnerRound).
    mapping(uint256 => mapping(uint32 => uint256)) private _winnerMark;
    /// Bumped on every propose/correct so stale winner marks are ignored without clearing them.
    mapping(uint256 => uint256) private _winnerRound;
    mapping(uint256 => mapping(uint32 => uint32)) private _cardsOn;
    mapping(uint256 => mapping(address => uint256)) private _cardOf;
    mapping(uint256 => CardInfo) private _cardInfo;
    mapping(uint256 => bool) private _opened;

    struct Listing {
        address seller;
        uint256 price;
    }

    mapping(uint256 => Listing) private _listings;

    event SettlerSet(address indexed settler);
    event MintPausedSet(bool paused);

    modifier onlySettler() {
        if (msg.sender != settler) revert NotSettler();
        _;
    }

    constructor(address wif_, address settler_, uint16 burnBps_, uint64 disputeWindow_, uint16 saleBurnBps_)
        ERC721("Ball is Flat", "BIF")
        Ownable(msg.sender)
    {
        if (wif_ == address(0) || settler_ == address(0)) revert ZeroAddress();
        if (burnBps_ > BPS || saleBurnBps_ > BPS) revert InvalidBurnBps();
        wif = wif_;
        settler = settler_;
        burnBps = burnBps_;
        saleBurnBps = saleBurnBps_;
        disputeWindow = disputeWindow_;
        emit SettlerSet(settler_);
    }

    // =====================================================================
    // reads
    // =====================================================================

    function matchInfo(uint256 matchId) external view returns (MatchInfo memory) {
        return _matches[matchId];
    }

    function stateOf(uint256 matchId) public view returns (State) {
        MatchInfo storage m = _matches[matchId];
        Status s = m.status;
        if (s == Status.Listed) return block.timestamp < m.kickoff ? State.Open : State.Locked;
        if (s == Status.Proposed) return State.Proposed;
        if (s == Status.Finalized) return m.winningCards > 0 ? State.Final : State.RolledOver;
        if (s == Status.Voided) return State.Void;
        return State.None;
    }

    function playersOf(uint256 matchId) external view returns (uint32[] memory) {
        return _players[matchId];
    }

    function winnersOf(uint256 matchId) external view returns (uint32[] memory) {
        return _winners[matchId];
    }

    function cardsOn(uint256 matchId, uint32 playerId) external view returns (uint32) {
        return _cardsOn[matchId][playerId];
    }

    function cardOf(uint256 matchId, address wallet) external view returns (uint256) {
        return _cardOf[matchId][wallet];
    }

    function cardInfo(uint256 tokenId) external view returns (CardInfo memory) {
        return _cardInfo[tokenId];
    }

    function claimable(uint256 tokenId) public view returns (uint256) {
        if (_ownerOf(tokenId) == address(0)) return 0;
        CardInfo storage c = _cardInfo[tokenId];
        MatchInfo storage m = _matches[c.matchId];
        if (m.status != Status.Finalized || m.winningCards == 0) return 0;
        if (!_isWinner(c.matchId, c.playerId)) return 0;
        return m.payPool / m.winningCards;
    }

    function remaining(uint256 matchId, uint32 playerId) external view returns (uint32) {
        if (!_isPlayer[matchId][playerId]) return 0;
        uint32 cap = _matches[matchId].maxPerPlayer;
        if (cap == 0) return type(uint32).max;
        return cap - _cardsOn[matchId][playerId];
    }

    function isOpened(uint256 tokenId) external view returns (bool) {
        return _opened[tokenId];
    }

    function listingOf(uint256 tokenId) external view returns (address seller, uint256 price) {
        Listing storage l = _listings[tokenId];
        if (l.seller == address(0) || _ownerOf(tokenId) != l.seller || _opened[tokenId]) return (address(0), 0);
        if (!_tradingOpen(_cardInfo[tokenId].matchId)) return (address(0), 0);
        return (l.seller, l.price);
    }

    // =====================================================================
    // fan
    // =====================================================================

    function mint(uint256 matchId, uint32 playerId) external nonReentrant returns (uint256 tokenId) {
        if (mintPaused) revert MintPaused();
        MatchInfo storage m = _matches[matchId];
        if (m.status != Status.Listed) revert NotListed(matchId);
        if (block.timestamp >= m.kickoff) revert MintClosed(matchId);
        if (!_isPlayer[matchId][playerId]) revert UnknownPlayer(matchId, playerId);
        uint256 existing = _cardOf[matchId][msg.sender];
        if (existing != 0) revert AlreadyHasCard(matchId, existing);
        if (m.maxPerPlayer != 0 && _cardsOn[matchId][playerId] >= m.maxPerPlayer) {
            revert PlayerSoldOut(matchId, playerId);
        }

        // effects
        tokenId = _nextTokenId++;
        uint32 serial = ++m.cards;
        m.pot += m.price;
        _cardsOn[matchId][playerId] += 1;
        _cardOf[matchId][msg.sender] = tokenId;
        _cardInfo[tokenId] = CardInfo({matchId: matchId, playerId: playerId, serial: serial});

        // interactions
        IERC20(wif).safeTransferFrom(msg.sender, address(this), m.price);
        _safeMint(msg.sender, tokenId);
        emit CardMinted(matchId, playerId, tokenId, msg.sender, serial);
    }

    function claim(uint256 tokenId) external nonReentrant returns (uint256 amount) {
        if (_ownerOf(tokenId) != msg.sender) revert NotCardOwner(tokenId);
        CardInfo storage c = _cardInfo[tokenId];
        uint256 matchId = c.matchId;
        MatchInfo storage m = _matches[matchId];
        if (m.status != Status.Finalized) revert WrongStatus(matchId, m.status);
        if (m.winningCards == 0 || !_isWinner(matchId, c.playerId)) revert NotAWinner(tokenId);

        amount = m.payPool / m.winningCards;
        _burn(tokenId);
        IERC20(wif).safeTransfer(msg.sender, amount);
        emit CardClaimed(tokenId, matchId, msg.sender, amount);
    }

    function refund(uint256 tokenId) external nonReentrant returns (uint256 amount) {
        if (_ownerOf(tokenId) != msg.sender) revert NotCardOwner(tokenId);
        uint256 matchId = _cardInfo[tokenId].matchId;
        MatchInfo storage m = _matches[matchId];
        if (m.status != Status.Voided) revert WrongStatus(matchId, m.status);

        amount = m.price;
        _burn(tokenId);
        IERC20(wif).safeTransfer(msg.sender, amount);
        emit CardRefunded(tokenId, matchId, msg.sender, amount);
    }

    function open(uint256 tokenId) external nonReentrant {
        if (_ownerOf(tokenId) != msg.sender) revert NotCardOwner(tokenId);
        if (_opened[tokenId]) revert AlreadyOpened(tokenId);
        _opened[tokenId] = true;
        _clearListing(tokenId);
        emit CardOpened(tokenId, _cardInfo[tokenId].matchId, msg.sender);
    }

    // =====================================================================
    // market
    // =====================================================================

    function listForSale(uint256 tokenId, uint256 price) external nonReentrant {
        if (_ownerOf(tokenId) != msg.sender) revert NotCardOwner(tokenId);
        if (price == 0) revert ZeroPrice();
        if (_opened[tokenId]) revert AlreadyOpened(tokenId);
        uint256 matchId = _cardInfo[tokenId].matchId;
        if (!_tradingOpen(matchId)) revert TradingClosed(matchId);
        _listings[tokenId] = Listing({seller: msg.sender, price: price});
        emit CardListed(tokenId, matchId, msg.sender, price);
    }

    function cancelListing(uint256 tokenId) external nonReentrant {
        address seller = _listings[tokenId].seller;
        if (seller == address(0)) revert NotForSale(tokenId);
        if (seller != msg.sender) revert NotCardOwner(tokenId);
        delete _listings[tokenId];
        emit ListingCancelled(tokenId);
    }

    function buy(uint256 tokenId, uint256 maxPrice) external nonReentrant {
        Listing memory l = _listings[tokenId];
        // Transfers, burns and opens clear the listing; the owner check is a second line of defence.
        if (l.seller == address(0) || _ownerOf(tokenId) != l.seller) revert NotForSale(tokenId);
        if (_opened[tokenId]) revert AlreadyOpened(tokenId);
        uint256 matchId = _cardInfo[tokenId].matchId;
        if (!_tradingOpen(matchId)) revert TradingClosed(matchId);
        if (l.price > maxPrice) revert PriceAboveMax(l.price, maxPrice);
        if (msg.sender == l.seller) revert CannotBuyOwnCard(tokenId);

        // effects
        delete _listings[tokenId];
        uint256 burned = (l.price * saleBurnBps) / BPS;
        uint256 toSeller = l.price - burned;
        emit CardSold(tokenId, matchId, l.seller, msg.sender, l.price, burned);

        // interactions: payment straight from buyer (the pots are never touched), then the card
        IERC20 token = IERC20(wif);
        if (burned > 0) token.safeTransferFrom(msg.sender, DEAD, burned);
        if (toSeller > 0) token.safeTransferFrom(msg.sender, l.seller, toSeller);
        _safeTransfer(l.seller, msg.sender, tokenId);
    }

    // =====================================================================
    // anyone
    // =====================================================================

    function finalize(uint256 matchId) external nonReentrant {
        MatchInfo storage m = _matches[matchId];
        if (m.status != Status.Proposed) revert WrongStatus(matchId, m.status);
        if (block.timestamp < uint256(m.proposedAt) + disputeWindow) revert TooEarly();

        uint32[] storage winners = _winners[matchId];
        uint32 winningCards;
        for (uint256 i; i < winners.length; ++i) {
            winningCards += _cardsOn[matchId][winners[i]];
        }

        uint256 burned = (m.pot * burnBps) / BPS;
        uint256 payPool = m.pot - burned;
        m.status = Status.Finalized;
        m.winningCards = winningCards;
        m.burned = burned;
        m.payPool = payPool;

        uint256 rolledTo;
        address treasuryTo;
        if (winningCards == 0 && payPool > 0) {
            (rolledTo, treasuryTo) = _rollForward(m.nextMatch, payPool);
        }

        emit MatchFinalized(matchId, winningCards, burned, payPool, rolledTo);

        if (burned > 0) IERC20(wif).safeTransfer(DEAD, burned);
        if (treasuryTo != address(0)) IERC20(wif).safeTransfer(treasuryTo, payPool);
    }

    // =====================================================================
    // settler
    // =====================================================================

    function propose(uint256 matchId, uint32[] calldata winners, string calldata sourceUrl) external onlySettler {
        MatchInfo storage m = _matches[matchId];
        if (m.status != Status.Listed) revert WrongStatus(matchId, m.status);
        if (block.timestamp < m.kickoff) revert TooEarly();
        _setWinners(matchId, winners);
        m.status = Status.Proposed;
        // forge-lint: disable-next-line(unsafe-typecast)
        m.proposedAt = uint64(block.timestamp);
        m.sourceUrl = sourceUrl;
        emit ResultProposed(matchId, winners, sourceUrl);
    }

    function correct(uint256 matchId, uint32[] calldata winners, string calldata sourceUrl) external onlySettler {
        MatchInfo storage m = _matches[matchId];
        if (m.status != Status.Proposed) revert WrongStatus(matchId, m.status);
        if (block.timestamp >= uint256(m.proposedAt) + disputeWindow) revert WindowClosed(matchId);
        _setWinners(matchId, winners);
        m.sourceUrl = sourceUrl;
        emit ResultCorrected(matchId, winners, sourceUrl);
    }

    /// @notice Settler or owner. Cards become refundable for their price; rolledIn moves on.
    function voidMatch(uint256 matchId) external nonReentrant {
        if (msg.sender != settler && msg.sender != owner()) revert NotSettler();
        MatchInfo storage m = _matches[matchId];
        if (m.status != Status.Listed && m.status != Status.Proposed) revert WrongStatus(matchId, m.status);
        m.status = Status.Voided;
        emit MatchVoided(matchId);

        uint256 carried = m.rolledIn;
        if (carried > 0) {
            (, address treasuryTo) = _rollForward(m.nextMatch, carried);
            if (treasuryTo != address(0)) IERC20(wif).safeTransfer(treasuryTo, carried);
        }
    }

    // =====================================================================
    // owner
    // =====================================================================

    function listMatch(
        uint64 kickoff,
        uint256 price,
        uint256 nextMatch,
        uint32[] calldata playerIds,
        uint32 maxPerPlayer
    ) external onlyOwner returns (uint256 matchId) {
        if (kickoff <= block.timestamp || price == 0 || playerIds.length == 0) {
            revert InvalidListing();
        }
        if (nextMatch > matchCount) revert InvalidListing();

        matchId = ++matchCount;
        for (uint256 i; i < playerIds.length; ++i) {
            uint32 p = playerIds[i];
            if (_isPlayer[matchId][p]) revert InvalidListing();
            _isPlayer[matchId][p] = true;
        }
        _players[matchId] = playerIds;

        MatchInfo storage m = _matches[matchId];
        m.kickoff = kickoff;
        m.price = price;
        m.nextMatch = nextMatch;
        m.maxPerPlayer = maxPerPlayer;
        m.status = Status.Listed;
        emit MatchListed(matchId, kickoff, price, nextMatch, playerIds);
    }

    function setSettler(address settler_) external onlyOwner {
        if (settler_ == address(0)) revert ZeroAddress();
        settler = settler_;
        emit SettlerSet(settler_);
    }

    function setMintPaused(bool paused) external onlyOwner {
        mintPaused = paused;
        emit MintPausedSet(paused);
    }

    // =====================================================================
    // internal
    // =====================================================================

    /// Trading is open while the match is Listed and kickoff has not been reached.
    function _tradingOpen(uint256 matchId) internal view returns (bool) {
        MatchInfo storage m = _matches[matchId];
        return m.status == Status.Listed && block.timestamp < m.kickoff;
    }

    function _clearListing(uint256 tokenId) internal {
        if (_listings[tokenId].seller != address(0)) {
            delete _listings[tokenId];
            emit ListingCancelled(tokenId);
        }
    }

    function _isWinner(uint256 matchId, uint32 playerId) internal view returns (bool) {
        uint256 round = _winnerRound[matchId];
        return round != 0 && _winnerMark[matchId][playerId] == round;
    }

    /// Validates (non-empty, listed, no duplicates) and stores the winner set.
    function _setWinners(uint256 matchId, uint32[] calldata winners) internal {
        if (winners.length == 0) revert InvalidWinners();
        uint256 round = ++_winnerRound[matchId];
        for (uint256 i; i < winners.length; ++i) {
            uint32 p = winners[i];
            if (!_isPlayer[matchId][p]) revert UnknownPlayer(matchId, p);
            if (_winnerMark[matchId][p] == round) revert InvalidWinners();
            _winnerMark[matchId][p] = round;
        }
        _winners[matchId] = winners;
    }

    /// Adds `amount` to nextMatch's pot when it can still pay out, otherwise returns the treasury
    /// address the caller must transfer to. Returns the match id rolled into (0 = treasury).
    function _rollForward(uint256 nextMatch, uint256 amount) internal returns (uint256 rolledTo, address treasuryTo) {
        if (nextMatch != 0) {
            MatchInfo storage n = _matches[nextMatch];
            if (n.status == Status.Listed || n.status == Status.Proposed) {
                n.rolledIn += amount;
                n.pot += amount;
                return (nextMatch, address(0));
            }
        }
        address o = owner();
        treasuryTo = o == address(0) ? DEAD : o;
    }

    // ---------- ERC721Enumerable plumbing ----------

    /// Every transfer and burn clears the token's listing, so a listing never outlives its seller.
    function _update(address to, uint256 tokenId, address auth) internal override(ERC721Enumerable) returns (address) {
        address from = super._update(to, tokenId, auth);
        if (from != address(0)) _clearListing(tokenId);
        return from;
    }

    function _increaseBalance(address account, uint128 amount) internal override(ERC721Enumerable) {
        super._increaseBalance(account, amount);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721Enumerable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}

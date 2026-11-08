// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title Ball is Flat: Hunt
/// @notice A wanted poster with a growing $WIF pot. Buy a Silver, Gold or Diamond pack, open it, and if one of
///         its player cards is the wanted player, the pot is yours to claim.
/// @dev    - Each pack price is split: `burnBps` goes to the dead address, the rest grows the open round's pot.
///         - A pack is drawn from the blockhash of the block after the one it was bought in, so the outcome does
///           not exist when the buyer pays and cannot be checked and reverted. On Robinhood Chain (Arbitrum
///           Orbit) `block.number` is the parent-chain block, so the hash stays readable for 256 of those blocks
///           (about 51 minutes). A pack opened after that draws from a fixed seed with the wanted player taken
///           out, so waiting never improves a pack.
///         - The first opened pack holding the wanted card wins `winnerBps` of the pot as a claimable balance;
///           the rest carries into the next round. The owner sets the wanted player and the player pool per
///           round and can close a round early (its whole pot carries over). The owner cannot take any pot.
///         - Cards are plain ERC-721 collectibles, separate from Ball is Flat match picks.
contract BallIsFlatHunt is ERC721, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant TIERS = 3;
    uint256 public constant REVEAL_WINDOW = 256;

    enum Status {
        None,
        Open,
        Won,
        Closed
    }

    struct Tier {
        uint128 price;
        uint8 cards;
    }

    struct Round {
        uint32 target;
        Status status;
        address winner;
        uint128 pot;
        uint64 packs;
    }

    struct Pack {
        address buyer;
        uint8 tier;
        uint32 round;
        uint64 revealBlock;
        bool opened;
    }

    IERC20 public immutable wif;
    uint16 public immutable burnBps;
    uint16 public immutable winnerBps;

    Tier[TIERS] internal _tiers;
    mapping(uint256 => Round) internal _rounds;
    mapping(uint256 => uint32[]) internal _pools;
    mapping(uint256 => Pack) internal _packs;
    mapping(uint256 => uint32) public cardPlayer;
    mapping(uint256 => uint32) public cardRound;
    mapping(address => uint256) public claimable;

    uint256 public currentRound;
    uint256 public carry;
    uint256 public packCount;
    uint256 public cardCount;
    bool public paused;
    string internal _base;

    event RoundStarted(uint256 indexed round, uint32 target, uint256 poolSize, uint256 seedPot);
    event RoundClosed(uint256 indexed round, uint256 carried);
    event PackBought(
        uint256 indexed packId,
        address indexed buyer,
        uint256 indexed round,
        uint8 tier,
        uint256 price,
        uint256 burned,
        uint64 revealBlock
    );
    event PackOpened(
        uint256 indexed packId, uint256 indexed round, uint256 firstCardId, uint32[] players, bool expired
    );
    event TargetFound(
        uint256 indexed round, uint256 indexed packId, address indexed winner, uint256 cardId, uint256 prize
    );
    event Claimed(address indexed account, uint256 amount);
    event Paused(bool paused);
    event BaseURISet(string baseURI);

    error ZeroAddress();
    error BadBps();
    error BadTier();
    error BadPool();
    error RoundStillOpen();
    error NoOpenRound();
    error IsPaused();
    error UnknownPack();
    error AlreadyOpened();
    error TooEarly();
    error NothingToClaim();

    constructor(address wif_, uint16 burnBps_, uint16 winnerBps_, Tier[TIERS] memory tiers_)
        ERC721("Ball is Flat Hunt", "BIFH")
        Ownable(msg.sender)
    {
        if (wif_ == address(0)) revert ZeroAddress();
        if (burnBps_ > 5000 || winnerBps_ == 0 || winnerBps_ > 10_000) revert BadBps();
        for (uint256 i; i < TIERS; ++i) {
            if (tiers_[i].price == 0 || tiers_[i].cards == 0 || tiers_[i].cards > 20) revert BadTier();
            _tiers[i] = tiers_[i];
        }
        wif = IERC20(wif_);
        burnBps = burnBps_;
        winnerBps = winnerBps_;
    }

    // ------------------------------------------------------------------ owner

    /// @notice Opens the next round. `pool` must be strictly ascending, hold at least two players and include
    ///         `target`. The previous round must be won or closed; its carry seeds this pot.
    function startRound(uint32 target, uint32[] calldata players) external onlyOwner {
        if (_rounds[currentRound].status == Status.Open) revert RoundStillOpen();
        if (players.length < 2) revert BadPool();
        bool hasTarget;
        for (uint256 i; i < players.length; ++i) {
            if (i > 0 && players[i] <= players[i - 1]) revert BadPool();
            if (players[i] == target) hasTarget = true;
        }
        if (!hasTarget) revert BadPool();
        uint256 id = ++currentRound;
        uint256 seed = carry;
        carry = 0;
        _rounds[id] = Round({target: target, status: Status.Open, winner: address(0), pot: uint128(seed), packs: 0});
        _pools[id] = players;
        emit RoundStarted(id, target, players.length, seed);
    }

    /// @notice Ends the open round with no winner; its whole pot carries into the next round.
    function closeRound() external onlyOwner {
        Round storage r = _rounds[currentRound];
        if (r.status != Status.Open) revert NoOpenRound();
        r.status = Status.Closed;
        carry += r.pot;
        emit RoundClosed(currentRound, r.pot);
    }

    function setPaused(bool on) external onlyOwner {
        paused = on;
        emit Paused(on);
    }

    function setBaseURI(string calldata base) external onlyOwner {
        _base = base;
        emit BaseURISet(base);
    }

    // ------------------------------------------------------------------ players

    /// @notice Buys one pack of `tier` (0 Silver, 1 Gold, 2 Diamond) in the open round. Open it from the next
    ///         block on with `open`.
    function buy(uint8 t) external nonReentrant returns (uint256 packId) {
        if (t >= TIERS) revert BadTier();
        if (paused) revert IsPaused();
        Round storage r = _rounds[currentRound];
        if (r.status != Status.Open) revert NoOpenRound();

        uint256 price = _tiers[t].price;
        uint256 burned = (price * burnBps) / 10_000;
        wif.safeTransferFrom(msg.sender, address(this), price);
        if (burned > 0) wif.safeTransfer(DEAD, burned);

        r.pot += uint128(price - burned);
        r.packs += 1;
        packId = ++packCount;
        uint64 reveal = uint64(block.number + 1);
        _packs[packId] =
            Pack({buyer: msg.sender, tier: t, round: uint32(currentRound), revealBlock: reveal, opened: false});
        emit PackBought(packId, msg.sender, currentRound, t, price, burned, reveal);
    }

    /// @notice Opens a pack and mints its cards to the buyer. Anyone may call it; the outcome depends only on
    ///         the pack and its reveal block.
    function open(uint256 packId) external nonReentrant returns (uint32[] memory players) {
        Pack storage p = _packs[packId];
        if (p.buyer == address(0)) revert UnknownPack();
        if (p.opened) revert AlreadyOpened();
        if (block.number <= p.revealBlock) revert TooEarly();
        p.opened = true;

        bytes32 hash = blockhash(p.revealBlock);
        bool expired = hash == bytes32(0);
        bytes32 seed = expired ? keccak256(abi.encode("expired", packId)) : keccak256(abi.encode(hash, packId));

        uint32[] storage drawFrom = _pools[p.round];
        Round storage r = _rounds[p.round];
        uint256 n = _tiers[p.tier].cards;
        uint256 len = drawFrom.length;
        players = new uint32[](n);
        uint256 first = cardCount + 1;
        uint256 foundCard;

        for (uint256 i; i < n; ++i) {
            uint256 idx = uint256(keccak256(abi.encode(seed, i))) % len;
            uint32 player = drawFrom[idx];
            if (expired && player == r.target) player = drawFrom[(idx + 1) % len];
            players[i] = player;
            uint256 cardId = first + i;
            cardPlayer[cardId] = player;
            cardRound[cardId] = p.round;
            _mint(p.buyer, cardId);
            if (foundCard == 0 && player == r.target) foundCard = cardId;
        }
        cardCount = first + n - 1;
        emit PackOpened(packId, p.round, first, players, expired);

        if (foundCard != 0 && r.status == Status.Open) {
            uint256 prize = (uint256(r.pot) * winnerBps) / 10_000;
            uint256 rest = r.pot - prize;
            r.status = Status.Won;
            r.winner = p.buyer;
            claimable[p.buyer] += prize;
            carry += rest;
            emit TargetFound(p.round, packId, p.buyer, foundCard, prize);
        }
    }

    /// @notice Pays out every prize won by the caller.
    function claim() external nonReentrant returns (uint256 amount) {
        amount = claimable[msg.sender];
        if (amount == 0) revert NothingToClaim();
        claimable[msg.sender] = 0;
        wif.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    // ------------------------------------------------------------------ views

    function tier(uint8 t) external view returns (Tier memory) {
        if (t >= TIERS) revert BadTier();
        return _tiers[t];
    }

    function round(uint256 id) external view returns (Round memory) {
        return _rounds[id];
    }

    function pool(uint256 id) external view returns (uint32[] memory) {
        return _pools[id];
    }

    function pack(uint256 id) external view returns (Pack memory) {
        return _packs[id];
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return bytes(_base).length == 0 ? "" : string.concat(_base, Strings.toString(tokenId));
    }
}

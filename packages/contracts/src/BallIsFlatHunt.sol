// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title Ball is Flat: Hunt
/// @notice A wanted poster with a prize put up by the Ball is Flat team. Buy a Silver, Gold or Diamond pack,
///         open it, and if one of its player cards is the wanted player, you are the round's winner.
/// @dev    - The prize is not funded by packs. The owner posts it with the round (`prize`, in $WIF), pays the
///           winner by a transfer outside this contract, then records that payment with `markPaid`, so the
///           poster, the winner and the payment reference all stay on chain.
///         - Each pack price is split: `burnBps` goes to the dead address, the rest goes to `treasury`.
///           The contract holds no $WIF.
///         - A pack is drawn from the blockhash of the block after the one it was bought in, so the outcome does
///           not exist when the buyer pays and cannot be checked and reverted. On Robinhood Chain (Arbitrum
///           Orbit) `block.number` is the parent-chain block, so the hash stays readable for 256 of those blocks
///           (about 51 minutes). A pack opened after that draws from a fixed seed with the wanted player taken
///           out, so waiting never improves a pack.
///         - The first opened pack holding the wanted card wins its round. The owner sets the wanted player,
///           prize and player pool per round and can close a round early.
///         - Cards are ERC-721 collectibles bound to the wallet that opened them (no transfers), separate from
///           Ball is Flat match picks.
contract BallIsFlatHunt is ERC721, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant TIERS = 3;

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
        uint128 prize;
        uint64 packs;
        uint64 winningPack;
        uint64 winningCard;
        bool claimed;
        bool paid;
        bytes32 payment;
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

    address public treasury;
    Tier[TIERS] internal _tiers;
    mapping(uint256 => Round) internal _rounds;
    mapping(uint256 => uint32[]) internal _pools;
    mapping(uint256 => Pack) internal _packs;
    mapping(uint256 => uint32) public cardPlayer;
    mapping(uint256 => uint32) public cardRound;

    uint256 public currentRound;
    uint256 public packCount;
    uint256 public cardCount;
    bool public paused;
    string internal _base;

    event RoundStarted(uint256 indexed round, uint32 target, uint256 prize, uint256 poolSize);
    event RoundClosed(uint256 indexed round);
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
    event PrizeClaimed(uint256 indexed round, address indexed winner, uint256 prize);
    event PrizePaid(uint256 indexed round, address indexed winner, uint256 prize, bytes32 payment);
    event TreasurySet(address treasury);
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
    error NotWon();
    error AlreadyPaid();
    error NotWinner();
    error AlreadyClaimed();
    error CardBound();

    constructor(address wif_, address treasury_, uint16 burnBps_, Tier[TIERS] memory tiers_)
        ERC721("Ball is Flat Hunt", "BIFH")
        Ownable(msg.sender)
    {
        if (wif_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        if (burnBps_ > 10_000) revert BadBps();
        for (uint256 i; i < TIERS; ++i) {
            if (tiers_[i].price == 0 || tiers_[i].cards == 0 || tiers_[i].cards > 20) revert BadTier();
            _tiers[i] = tiers_[i];
        }
        wif = IERC20(wif_);
        treasury = treasury_;
        burnBps = burnBps_;
        emit TreasurySet(treasury_);
    }

    // ------------------------------------------------------------------ owner

    /// @notice Opens the next round with `prize` $WIF (paid by the team, outside this contract) on `target`.
    ///         `players` must be strictly ascending, hold at least two players and include `target`.
    function startRound(uint32 target, uint128 prize, uint32[] calldata players) external onlyOwner {
        if (_rounds[currentRound].status == Status.Open) revert RoundStillOpen();
        if (players.length < 2) revert BadPool();
        bool hasTarget;
        for (uint256 i; i < players.length; ++i) {
            if (i > 0 && players[i] <= players[i - 1]) revert BadPool();
            if (players[i] == target) hasTarget = true;
        }
        if (!hasTarget) revert BadPool();
        uint256 id = ++currentRound;
        Round storage r = _rounds[id];
        r.target = target;
        r.status = Status.Open;
        r.prize = prize;
        _pools[id] = players;
        emit RoundStarted(id, target, prize, players.length);
    }

    /// @notice Ends the open round with no winner.
    function closeRound() external onlyOwner {
        Round storage r = _rounds[currentRound];
        if (r.status != Status.Open) revert NoOpenRound();
        r.status = Status.Closed;
        emit RoundClosed(currentRound);
    }

    /// @notice Records that the winner of `roundId` was paid, with the payment's transaction hash.
    function markPaid(uint256 roundId, bytes32 payment) external onlyOwner {
        Round storage r = _rounds[roundId];
        if (r.status != Status.Won) revert NotWon();
        if (r.paid) revert AlreadyPaid();
        r.paid = true;
        r.payment = payment;
        emit PrizePaid(roundId, r.winner, r.prize, payment);
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasurySet(treasury_);
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
        if (burned > 0) wif.safeTransferFrom(msg.sender, DEAD, burned);
        if (price > burned) wif.safeTransferFrom(msg.sender, treasury, price - burned);

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
            r.status = Status.Won;
            r.winner = p.buyer;
            r.winningPack = uint64(packId);
            r.winningCard = uint64(foundCard);
            emit TargetFound(p.round, packId, p.buyer, foundCard, r.prize);
        }
    }

    /// @notice The winner asks the team for the prize of `roundId`. It moves no funds: it puts the round in the
    ///         team's payout queue, and `markPaid` records the transfer once it is sent.
    function claim(uint256 roundId) external {
        Round storage r = _rounds[roundId];
        if (r.status != Status.Won) revert NotWon();
        if (msg.sender != r.winner) revert NotWinner();
        if (r.claimed) revert AlreadyClaimed();
        r.claimed = true;
        emit PrizeClaimed(roundId, msg.sender, r.prize);
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

    /// @dev Cards are minted once and never move.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0)) revert CardBound();
        return super._update(to, tokenId, auth);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return bytes(_base).length == 0 ? "" : string.concat(_base, Strings.toString(tokenId));
    }
}

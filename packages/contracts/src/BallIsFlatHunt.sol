// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @title Ball is Flat: Hunt
/// @notice A wanted poster with prizes put up by the Ball is Flat team. Each round is a deck of `supply` cards
///         of which `winners` are the wanted player; the rest are random players from the round's pool
///         (duplicates allowed, the wanted player never). Buy a Silver, Gold or Diamond pack, open it, and every
///         wanted card in it is a win. Once the deck is sold out, no more packs; every wanted card is in some
///         pack, so a sold-out round always has `winners` finds (minus any lost to a pack opened too late).
///         When a purchase would leave fewer cards than the smallest open pack, that pack takes the rest of the
///         deck as bonus cards, so a deck can always sell out.
/// @dev    - Prizes are not funded by packs. The owner posts `prizeEach` with the round, pays each winner by a
///           transfer outside this contract, then records the payment with `markPaid`.
///         - Pack money: `burnBps` goes to the dead address, the rest to `treasury`. The contract holds no $WIF.
///         - Tiers (price, cards, allowlist) are set per round and can change while it runs. A tier with an
///           allowlist root takes one pack per listed wallet; a price of 0 needs an allowlist (giveaways).
///         - Draw: a pack's seed is the blockhash of the block after the one it was bought in, so the outcome
///           does not exist when the buyer pays. Each card is drawn from what is left of the deck: it is wanted
///           with probability (wanted left) / (cards left). Because that depends on the order packs are opened,
///           packs open strictly in purchase order (anyone may open; opening a pack opens every earlier one), so
///           nobody can pick a better moment. On Robinhood Chain (Arbitrum Orbit) `block.number` is the
///           parent-chain block and the hash stays readable for 256 of them (about 51 minutes). A pack opened
///           later uses a fixed seed and cannot win: a wanted card it would have drawn is lost (`TargetLost`),
///           so waiting never helps. The app and the settler bot open packs right away.
///         - Opening records the draw; no card is minted. The buyer mints the cards they want with `mintCard`
///           (at `mintPrice`, split like a pack), one ERC-721 per drawn slot, bound to their wallet.
contract BallIsFlatHunt is ERC721, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant TIERS = 3;
    uint256 public constant MAX_CARDS = 20;
    /// @notice Most packs one `open` call works through; a longer queue is drained with `openNext`.
    uint256 public constant MAX_OPEN_BATCH = 40;

    enum Status {
        None,
        Open,
        Done, // every wanted card is found or lost
        Closed // ended early by the owner
    }

    struct Tier {
        uint128 price;
        uint8 cards;
        bytes32 allowRoot; // 0 = anyone; else one pack per listed wallet
    }

    struct Round {
        uint32 target;
        Status status;
        uint16 winners; // wanted cards in the deck
        uint16 found;
        uint16 lost;
        uint32 supply; // cards in the deck
        uint32 sold; // cards in bought packs
        uint32 drawn; // cards in opened packs
        uint64 packs;
        uint128 prizeEach;
    }

    struct Find {
        address winner;
        uint64 packId;
        uint8 slot;
        bool claimed;
        bool paid;
        bytes32 payment;
    }

    struct Pack {
        address buyer;
        uint8 tier;
        uint8 cards;
        uint32 round;
        uint64 revealBlock;
        bool opened;
    }

    IERC20 public immutable wif;
    uint16 public immutable burnBps;

    address public treasury;
    mapping(uint256 => Tier[TIERS]) internal _tiers;
    mapping(uint256 => Round) internal _rounds;
    mapping(uint256 => uint32[]) internal _pools; // round pool without the wanted player
    mapping(uint256 => Find[]) internal _finds;
    mapping(uint256 => mapping(uint8 => mapping(address => bool))) public allowUsed;
    mapping(uint256 => Pack) internal _packs;
    mapping(uint256 => uint32[]) internal _drawn;
    mapping(uint256 => uint32) public cardPlayer;
    mapping(uint256 => uint32) public cardRound;
    mapping(uint256 => uint256) public cardPack;
    /// @dev Bit i set = slot i of the pack is minted.
    mapping(uint256 => uint64) public mintedSlots;
    uint128 public mintPrice;

    uint256 public currentRound;
    uint256 public packCount;
    uint256 public nextToOpen = 1;
    uint256 public cardCount;
    bool public paused;
    string internal _base;

    event RoundStarted(
        uint256 indexed round, uint32 target, uint16 winners, uint32 supply, uint256 prizeEach, uint256 poolSize
    );
    event TierSet(uint256 indexed round, uint8 tier, uint256 price, uint8 cards, bytes32 allowRoot);
    event RoundDone(uint256 indexed round);
    event RoundClosed(uint256 indexed round);
    event PackBought(
        uint256 indexed packId,
        address indexed buyer,
        uint256 indexed round,
        uint8 tier,
        uint8 cards,
        uint256 price,
        uint256 burned,
        uint64 revealBlock
    );
    event PackOpened(uint256 indexed packId, uint256 indexed round, uint32[] players, bool expired);
    event TargetFound(
        uint256 indexed round,
        uint256 indexed packId,
        address indexed winner,
        uint256 findIndex,
        uint8 slot,
        uint256 prize
    );
    event TargetLost(uint256 indexed round, uint256 indexed packId, uint8 slot);
    event CardMinted(
        uint256 indexed cardId,
        uint256 indexed packId,
        address indexed owner,
        uint8 slot,
        uint32 playerId,
        uint256 price
    );
    event MintPriceSet(uint256 price);
    event PrizeClaimed(uint256 indexed round, uint256 indexed findIndex, address indexed winner, uint256 prize);
    event PrizePaid(
        uint256 indexed round, uint256 indexed findIndex, address indexed winner, uint256 prize, bytes32 payment
    );
    event TreasurySet(address treasury);
    event Paused(bool paused);
    event BaseURISet(string baseURI);

    error ZeroAddress();
    error BadBps();
    error BadTier();
    error BadPool();
    error BadDeck();
    error RoundStillOpen();
    error NoOpenRound();
    error IsPaused();
    error SoldOut();
    error NotListed();
    error AllowUsed();
    error UnknownPack();
    error AlreadyOpened();
    error TooEarly();
    error QueueTooLong(uint256 nextToOpen);
    error UnknownFind();
    error AlreadyPaid();
    error NotWinner();
    error AlreadyClaimed();
    error CardBound();
    error NotBuyer();
    error NotOpened();
    error BadSlot();
    error AlreadyMinted();

    constructor(address wif_, address treasury_, uint16 burnBps_)
        ERC721("Ball is Flat Hunt", "BIFH")
        Ownable(msg.sender)
    {
        if (wif_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        if (burnBps_ > 10_000) revert BadBps();
        wif = IERC20(wif_);
        treasury = treasury_;
        burnBps = burnBps_;
        emit TreasurySet(treasury_);
    }

    // ------------------------------------------------------------------ owner

    /// @notice Opens the next round: a deck of `supply` cards holding `winners` wanted cards of `target`, each
    ///         worth `prizeEach` $WIF (paid by the team, outside this contract). `players` must be strictly
    ///         ascending and include `target` plus at least one other player.
    function startRound(
        uint32 target,
        uint128 prizeEach,
        uint16 winners,
        uint32 supply,
        uint32[] calldata players,
        Tier[TIERS] calldata tiers_
    ) external onlyOwner {
        if (_rounds[currentRound].status == Status.Open) revert RoundStillOpen();
        if (winners == 0 || supply < winners) revert BadDeck();
        bool hasTarget;
        uint256 id = currentRound + 1;
        uint32[] storage pool_ = _pools[id];
        for (uint256 i; i < players.length; ++i) {
            if (i > 0 && players[i] <= players[i - 1]) revert BadPool();
            if (players[i] == target) hasTarget = true;
            else pool_.push(players[i]);
        }
        if (!hasTarget || pool_.length == 0) revert BadPool();
        currentRound = id;
        Round storage r = _rounds[id];
        r.target = target;
        r.status = Status.Open;
        r.winners = winners;
        r.supply = supply;
        r.prizeEach = prizeEach;
        emit RoundStarted(id, target, winners, supply, prizeEach, players.length);
        for (uint8 t; t < TIERS; ++t) {
            _setTier(id, t, tiers_[t]);
        }
    }

    /// @notice Changes one tier of the open round: price, cards per pack, allowlist (e.g. a free Silver giveaway).
    function setTier(uint8 t, Tier calldata tier_) external onlyOwner {
        if (t >= TIERS) revert BadTier();
        if (_rounds[currentRound].status != Status.Open) revert NoOpenRound();
        _setTier(currentRound, t, tier_);
    }

    /// @notice Ends the open round early. Packs already bought still open and can still find wanted cards.
    function closeRound() external onlyOwner {
        Round storage r = _rounds[currentRound];
        if (r.status != Status.Open) revert NoOpenRound();
        r.status = Status.Closed;
        emit RoundClosed(currentRound);
    }

    /// @notice Records that the prize of find `findIndex` in `roundId` was sent (`payment` = transfer tx hash).
    function markPaid(uint256 roundId, uint256 findIndex, bytes32 payment) external onlyOwner {
        Find storage f = _find(roundId, findIndex);
        if (f.paid) revert AlreadyPaid();
        f.paid = true;
        f.payment = payment;
        emit PrizePaid(roundId, findIndex, f.winner, _rounds[roundId].prizeEach, payment);
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasurySet(treasury_);
    }

    function setMintPrice(uint128 price) external onlyOwner {
        mintPrice = price;
        emit MintPriceSet(price);
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

    /// @notice Buys one pack of tier `t` in the open round. `proof` is the allowlist proof when the tier has one.
    function buy(uint8 t, bytes32[] calldata proof) external nonReentrant returns (uint256 packId) {
        if (t >= TIERS) revert BadTier();
        if (paused) revert IsPaused();
        uint256 roundId = currentRound;
        Round storage r = _rounds[roundId];
        if (r.status != Status.Open) revert NoOpenRound();
        Tier memory tier_ = _tiers[roundId][t];
        uint32 left = r.supply - r.sold;
        if (tier_.cards > left) revert SoldOut();
        uint8 cards = tier_.cards;
        // A remainder no pack could ever buy goes into this pack, so every wanted card stays reachable.
        uint32 rest = left - cards;
        if (rest > 0 && rest < _smallestPack(roundId)) cards += uint8(rest);

        if (tier_.allowRoot != bytes32(0)) {
            if (allowUsed[roundId][t][msg.sender]) revert AllowUsed();
            bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(msg.sender))));
            if (!MerkleProof.verifyCalldata(proof, tier_.allowRoot, leaf)) revert NotListed();
            allowUsed[roundId][t][msg.sender] = true;
        }

        r.sold += cards;
        r.packs += 1;
        packId = ++packCount;
        uint64 reveal = uint64(block.number + 1);
        _packs[packId] = Pack({
            buyer: msg.sender, tier: t, cards: cards, round: uint32(roundId), revealBlock: reveal, opened: false
        });

        uint256 burned = (uint256(tier_.price) * burnBps) / 10_000;
        if (burned > 0) wif.safeTransferFrom(msg.sender, DEAD, burned);
        if (tier_.price > burned) wif.safeTransferFrom(msg.sender, treasury, tier_.price - burned);
        emit PackBought(packId, msg.sender, roundId, t, cards, tier_.price, burned, reveal);
    }

    /// @notice Opens `packId` and every unopened pack bought before it, in order. Anyone may call it; outcomes
    ///         depend only on each pack's reveal block and the packs opened before it.
    function open(uint256 packId) external nonReentrant returns (uint32[] memory players) {
        Pack storage p = _packs[packId];
        if (p.buyer == address(0)) revert UnknownPack();
        if (p.opened) revert AlreadyOpened();
        if (block.number <= p.revealBlock) revert TooEarly();
        uint256 next = nextToOpen;
        if (packId - next >= MAX_OPEN_BATCH) revert QueueTooLong(next);
        for (uint256 id = next; id <= packId; ++id) {
            players = _open(id);
        }
        nextToOpen = packId + 1;
    }

    /// @notice Opens up to `max` packs from the front of the queue whose reveal block has passed (a keeper call).
    function openNext(uint256 max) external nonReentrant returns (uint256 opened) {
        uint256 id = nextToOpen;
        uint256 last = packCount;
        while (opened < max && id <= last && block.number > _packs[id].revealBlock) {
            _open(id);
            ++id;
            ++opened;
        }
        nextToOpen = id;
    }

    /// @notice Mints slot `slot` of an opened pack as a card in the buyer's wallet, at `mintPrice`.
    function mintCard(uint256 packId, uint8 slot) external nonReentrant returns (uint256 cardId) {
        Pack storage p = _packs[packId];
        if (p.buyer == address(0)) revert UnknownPack();
        if (msg.sender != p.buyer) revert NotBuyer();
        if (!p.opened) revert NotOpened();
        uint32[] storage slots = _drawn[packId];
        if (slot >= slots.length) revert BadSlot();
        uint64 bit = uint64(1) << slot;
        if (mintedSlots[packId] & bit != 0) revert AlreadyMinted();
        mintedSlots[packId] |= bit;

        cardId = ++cardCount;
        uint32 player = slots[slot];
        cardPlayer[cardId] = player;
        cardRound[cardId] = p.round;
        cardPack[cardId] = packId;

        uint256 price = mintPrice;
        if (price > 0) {
            uint256 burned = (price * burnBps) / 10_000;
            if (burned > 0) wif.safeTransferFrom(msg.sender, DEAD, burned);
            if (price > burned) wif.safeTransferFrom(msg.sender, treasury, price - burned);
        }
        _mint(msg.sender, cardId);
        emit CardMinted(cardId, packId, msg.sender, slot, player, price);
    }

    /// @notice A winner asks the team for the prize of find `findIndex` in `roundId`. It moves no funds: it puts
    ///         the find in the team's payout queue, and `markPaid` records the transfer once it is sent.
    function claim(uint256 roundId, uint256 findIndex) external {
        Find storage f = _find(roundId, findIndex);
        if (msg.sender != f.winner) revert NotWinner();
        if (f.claimed) revert AlreadyClaimed();
        f.claimed = true;
        emit PrizeClaimed(roundId, findIndex, msg.sender, _rounds[roundId].prizeEach);
    }

    // ------------------------------------------------------------------ views

    function tier(uint256 roundId, uint8 t) external view returns (Tier memory) {
        if (t >= TIERS) revert BadTier();
        return _tiers[roundId][t];
    }

    function round(uint256 id) external view returns (Round memory) {
        return _rounds[id];
    }

    /// @notice The round's pool without its wanted player.
    function pool(uint256 id) external view returns (uint32[] memory) {
        return _pools[id];
    }

    function finds(uint256 id) external view returns (Find[] memory) {
        return _finds[id];
    }

    function drawn(uint256 packId) external view returns (uint32[] memory) {
        return _drawn[packId];
    }

    function pack(uint256 id) external view returns (Pack memory) {
        return _packs[id];
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return bytes(_base).length == 0 ? "" : string.concat(_base, Strings.toString(tokenId));
    }

    // ------------------------------------------------------------------ internal

    function _setTier(uint256 roundId, uint8 t, Tier calldata tier_) internal {
        if (tier_.cards == 0 || tier_.cards > MAX_CARDS) revert BadTier();
        if (tier_.price == 0 && tier_.allowRoot == bytes32(0)) revert BadTier();
        _tiers[roundId][t] = tier_;
        emit TierSet(roundId, t, tier_.price, tier_.cards, tier_.allowRoot);
    }

    /// Cards in the smallest pack anyone can buy (tiers without an allowlist; all tiers if every one has one).
    function _smallestPack(uint256 roundId) internal view returns (uint32 smallest) {
        uint32 any = type(uint32).max;
        smallest = type(uint32).max;
        for (uint256 t; t < TIERS; ++t) {
            Tier storage tier_ = _tiers[roundId][t];
            if (tier_.cards < any) any = tier_.cards;
            if (tier_.allowRoot == bytes32(0) && tier_.cards < smallest) smallest = tier_.cards;
        }
        if (smallest == type(uint32).max) smallest = any;
    }

    function _find(uint256 roundId, uint256 findIndex) internal view returns (Find storage) {
        Find[] storage list = _finds[roundId];
        if (findIndex >= list.length) revert UnknownFind();
        return list[findIndex];
    }

    /// @dev Draws pack `packId` from what is left of its round's deck. Callers keep the purchase order.
    function _open(uint256 packId) internal returns (uint32[] memory players) {
        Pack storage p = _packs[packId];
        p.opened = true;
        uint256 roundId = p.round;
        Round storage r = _rounds[roundId];
        uint32[] storage pool_ = _pools[roundId];

        bytes32 hash = blockhash(p.revealBlock);
        bool expired = hash == bytes32(0);
        bytes32 seed = expired ? keccak256(abi.encode("expired", packId)) : keccak256(abi.encode(hash, packId));

        uint256 n = p.cards;
        players = new uint32[](n);
        for (uint256 i; i < n; ++i) {
            uint256 rnd = uint256(keccak256(abi.encode(seed, i)));
            if (_drawsWanted(r, rnd)) {
                if (expired) {
                    r.lost += 1;
                    emit TargetLost(roundId, packId, uint8(i));
                } else {
                    _recordFind(roundId, packId, p.buyer, uint8(i));
                    players[i] = r.target;
                    continue;
                }
            }
            players[i] = pool_[uint256(keccak256(abi.encode(rnd))) % pool_.length];
        }
        _drawn[packId] = players;
        emit PackOpened(packId, roundId, players, expired);

        if (r.found + r.lost == r.winners && r.status == Status.Open) {
            r.status = Status.Done;
            emit RoundDone(roundId);
        }
    }

    /// @dev Takes one card off the deck; true when it is a wanted card: (wanted left) / (cards left).
    function _drawsWanted(Round storage r, uint256 rnd) internal returns (bool) {
        uint256 wantedLeft = uint256(r.winners) - r.found - r.lost;
        uint256 deckLeft = uint256(r.supply) - r.drawn;
        r.drawn += 1;
        return wantedLeft > 0 && rnd % deckLeft < wantedLeft;
    }

    function _recordFind(uint256 roundId, uint256 packId, address buyer, uint8 slot) internal {
        Round storage r = _rounds[roundId];
        r.found += 1;
        Find[] storage list = _finds[roundId];
        list.push(Find({winner: buyer, packId: uint64(packId), slot: slot, claimed: false, paid: false, payment: 0}));
        emit TargetFound(roundId, packId, buyer, list.length - 1, slot, r.prizeEach);
    }

    /// @dev Cards are minted once and never move.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0)) revert CardBound();
        return super._update(to, tokenId, auth);
    }
}

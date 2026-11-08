// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Hashes} from "@openzeppelin/contracts/utils/cryptography/Hashes.sol";
import {BallIsFlatHunt} from "../src/BallIsFlatHunt.sol";
import {MockWIF} from "./mocks/Mocks.sol";

contract HuntTest is Test {
    BallIsFlatHunt hunt;
    MockWIF wif;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address stranger = makeAddr("stranger");
    address treasury = makeAddr("treasury");
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;

    uint16 constant BURN = 1000;
    uint128 constant PRIZE = 5_000e18;
    uint32 constant KANE = 9;

    uint8 constant SILVER = 0;
    uint8 constant GOLD = 1;
    uint8 constant DIAMOND = 2;

    bytes32[] none;

    function _tiers() internal pure returns (BallIsFlatHunt.Tier[3] memory t) {
        t[0] = BallIsFlatHunt.Tier({price: 50e18, cards: 3, allowRoot: bytes32(0)});
        t[1] = BallIsFlatHunt.Tier({price: 100e18, cards: 7, allowRoot: bytes32(0)});
        t[2] = BallIsFlatHunt.Tier({price: 150e18, cards: 12, allowRoot: bytes32(0)});
    }

    function _pool(uint32 size) internal pure returns (uint32[] memory p) {
        p = new uint32[](size);
        for (uint32 i; i < size; ++i) {
            p[i] = i + 1; // 1..size, so KANE (9) is in any pool of 9 or more
        }
    }

    function _start(uint16 winners, uint32 supply) internal {
        hunt.startRound(KANE, PRIZE, winners, supply, _pool(20), _tiers());
    }

    function setUp() public {
        vm.roll(1000);
        wif = new MockWIF();
        hunt = new BallIsFlatHunt(address(wif), treasury, BURN);
        address[3] memory users = [alice, bob, stranger];
        for (uint256 i; i < users.length; ++i) {
            wif.mint(users[i], 1_000_000e18);
            vm.prank(users[i]);
            wif.approve(address(hunt), type(uint256).max);
        }
    }

    // ------------------------------------------------------------------ helpers

    function _buy(address who, uint8 t) internal returns (uint256 packId) {
        vm.prank(who);
        packId = hunt.buy(t, none);
    }

    /// Moves past `packId`'s reveal block and sets its hash.
    function _reveal(uint256 packId, bytes32 h) internal {
        uint64 reveal = hunt.pack(packId).revealBlock;
        if (block.number <= reveal) vm.roll(reveal + 1);
        vm.setBlockhash(reveal, h);
    }

    /// Mirrors the contract's draw for the next pack to open, from the round's state right now.
    function _expected(uint256 packId, bytes32 h) internal view returns (uint32[] memory out, uint256 hits) {
        BallIsFlatHunt.Pack memory pk = hunt.pack(packId);
        BallIsFlatHunt.Round memory r = hunt.round(pk.round);
        uint32[] memory p = hunt.pool(pk.round);
        bytes32 seed = keccak256(abi.encode(h, packId));
        out = new uint32[](pk.cards);
        uint256 found = r.found;
        uint256 drawn = r.drawn;
        for (uint256 i; i < pk.cards; ++i) {
            uint256 rnd = uint256(keccak256(abi.encode(seed, i)));
            uint256 wantedLeft = uint256(r.winners) - found - r.lost;
            uint256 deckLeft = uint256(r.supply) - drawn;
            drawn += 1;
            if (wantedLeft > 0 && rnd % deckLeft < wantedLeft) {
                found += 1;
                hits += 1;
                out[i] = r.target;
            } else {
                out[i] = p[uint256(keccak256(abi.encode(rnd))) % p.length];
            }
        }
    }

    /// A reveal hash for the next pack whose draw has (or has not) at least one wanted card.
    function _hashFor(uint256 packId, bool hit) internal view returns (bytes32 h) {
        for (uint256 salt = 1; salt < 20_000; ++salt) {
            h = keccak256(abi.encode("hash", salt));
            (, uint256 hits) = _expected(packId, h);
            if ((hits > 0) == hit) return h;
        }
        revert("no hash");
    }

    function _leaf(address who) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(who))));
    }

    // ------------------------------------------------------------------ constructor + rounds

    function test_constructor_rejects_bad_params() public {
        vm.expectRevert(BallIsFlatHunt.ZeroAddress.selector);
        new BallIsFlatHunt(address(0), treasury, BURN);
        vm.expectRevert(BallIsFlatHunt.ZeroAddress.selector);
        new BallIsFlatHunt(address(wif), address(0), BURN);
        vm.expectRevert(BallIsFlatHunt.BadBps.selector);
        new BallIsFlatHunt(address(wif), treasury, 10_001);
    }

    function test_startRound_validates_deck_pool_and_tiers() public {
        BallIsFlatHunt.Tier[3] memory t = _tiers();
        vm.expectRevert(BallIsFlatHunt.BadDeck.selector);
        hunt.startRound(KANE, PRIZE, 0, 100, _pool(20), t);
        vm.expectRevert(BallIsFlatHunt.BadDeck.selector);
        hunt.startRound(KANE, PRIZE, 5, 4, _pool(20), t);

        uint32[] memory unsorted = _pool(20);
        (unsorted[0], unsorted[1]) = (unsorted[1], unsorted[0]);
        vm.expectRevert(BallIsFlatHunt.BadPool.selector);
        hunt.startRound(KANE, PRIZE, 1, 100, unsorted, t);
        vm.expectRevert(BallIsFlatHunt.BadPool.selector);
        hunt.startRound(KANE, PRIZE, 1, 100, _pool(5), t); // no Kane
        uint32[] memory onlyKane = new uint32[](1);
        onlyKane[0] = KANE;
        vm.expectRevert(BallIsFlatHunt.BadPool.selector);
        hunt.startRound(KANE, PRIZE, 1, 100, onlyKane, t);

        t[0].price = 0; // free needs an allowlist
        vm.expectRevert(BallIsFlatHunt.BadTier.selector);
        hunt.startRound(KANE, PRIZE, 1, 100, _pool(20), t);
        t = _tiers();
        t[2].cards = 21;
        vm.expectRevert(BallIsFlatHunt.BadTier.selector);
        hunt.startRound(KANE, PRIZE, 1, 100, _pool(20), t);

        _start(3, 1000);
        BallIsFlatHunt.Round memory r = hunt.round(1);
        assertEq(r.target, KANE);
        assertEq(r.winners, 3);
        assertEq(r.supply, 1000);
        assertEq(hunt.pool(1).length, 19); // Kane is not in the filler pool
        assertEq(hunt.tier(1, GOLD).cards, 7);
        vm.expectRevert(BallIsFlatHunt.RoundStillOpen.selector);
        _start(3, 1000);
    }

    function test_only_owner_runs_rounds() public {
        vm.startPrank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        hunt.startRound(KANE, PRIZE, 1, 100, _pool(20), _tiers());
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        hunt.setTier(0, _tiers()[0]);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        hunt.closeRound();
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        hunt.markPaid(1, 0, bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        hunt.setTreasury(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        hunt.setMintPrice(1);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        hunt.setPaused(true);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        hunt.setBaseURI("x");
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ buying

    function test_buy_needs_open_round_valid_tier_and_no_pause() public {
        vm.prank(alice);
        vm.expectRevert(BallIsFlatHunt.NoOpenRound.selector);
        hunt.buy(SILVER, none);
        _start(1, 100);
        vm.prank(alice);
        vm.expectRevert(BallIsFlatHunt.BadTier.selector);
        hunt.buy(3, none);
        hunt.setPaused(true);
        vm.prank(alice);
        vm.expectRevert(BallIsFlatHunt.IsPaused.selector);
        hunt.buy(SILVER, none);
        hunt.setPaused(false);
        _buy(alice, SILVER);
    }

    function test_buy_burns_share_and_pays_treasury() public {
        _start(1, 100);
        _buy(alice, GOLD);
        assertEq(wif.balanceOf(DEAD), 10e18);
        assertEq(wif.balanceOf(treasury), 90e18);
        assertEq(wif.balanceOf(address(hunt)), 0);
        BallIsFlatHunt.Round memory r = hunt.round(1);
        assertEq(r.sold, 7);
        assertEq(r.packs, 1);
        hunt.setTreasury(bob);
        uint256 before = wif.balanceOf(bob);
        _buy(alice, SILVER);
        assertEq(wif.balanceOf(bob) - before, 45e18);
    }

    function test_deck_sells_out() public {
        _start(1, 10);
        _buy(alice, SILVER);
        _buy(alice, SILVER);
        _buy(bob, SILVER); // 9 of 10 sold
        vm.prank(alice);
        vm.expectRevert(BallIsFlatHunt.SoldOut.selector);
        hunt.buy(SILVER, none);
        vm.prank(alice);
        vm.expectRevert(BallIsFlatHunt.SoldOut.selector);
        hunt.buy(DIAMOND, none);
    }

    function test_setTier_changes_price_mid_round() public {
        _start(1, 100);
        hunt.setTier(SILVER, BallIsFlatHunt.Tier({price: 20e18, cards: 4, allowRoot: bytes32(0)}));
        uint256 id = _buy(alice, SILVER);
        assertEq(hunt.pack(id).cards, 4);
        assertEq(wif.balanceOf(DEAD) + wif.balanceOf(treasury), 20e18);
        vm.expectRevert(BallIsFlatHunt.BadTier.selector);
        hunt.setTier(SILVER, BallIsFlatHunt.Tier({price: 0, cards: 3, allowRoot: bytes32(0)}));
        hunt.closeRound();
        vm.expectRevert(BallIsFlatHunt.NoOpenRound.selector);
        hunt.setTier(SILVER, _tiers()[0]);
    }

    function test_free_silver_for_an_allowlist_one_pack_each() public {
        _start(1, 100);
        bytes32 a = _leaf(alice);
        bytes32 b = _leaf(bob);
        bytes32 root = Hashes.commutativeKeccak256(a, b);
        hunt.setTier(SILVER, BallIsFlatHunt.Tier({price: 0, cards: 3, allowRoot: root}));

        bytes32[] memory proofA = new bytes32[](1);
        proofA[0] = b;
        uint256 before = wif.balanceOf(alice);
        vm.prank(alice);
        hunt.buy(SILVER, proofA);
        assertEq(wif.balanceOf(alice), before);
        assertTrue(hunt.allowUsed(1, SILVER, alice));

        vm.prank(alice);
        vm.expectRevert(BallIsFlatHunt.AllowUsed.selector);
        hunt.buy(SILVER, proofA);

        vm.prank(stranger);
        vm.expectRevert(BallIsFlatHunt.NotListed.selector);
        hunt.buy(SILVER, proofA);

        _buy(stranger, GOLD); // other tiers stay open to anyone
    }

    /// Cross-checks the TypeScript tree in packages/core/src/allowlist.ts (same vector in allowlist.test.ts).
    function test_free_silver_with_the_core_allowlist_vector() public {
        _start(1, 100);
        bytes32 root = 0x03e77b9c5c125fe5291407762aeb940d2671c1f85bb63af2a6fbcda457c08889;
        hunt.setTier(SILVER, BallIsFlatHunt.Tier({price: 0, cards: 3, allowRoot: root}));
        bytes32[] memory proof = new bytes32[](2);
        proof[0] = 0x7740b371745000923b2b7cb0f43a638c71ba9d6a6f760f879e55fb1f075a434c;
        proof[1] = 0xc7f1a6a03dd2a5a7b659fd4236187d678cb912ad644a3bc283783bd5d6f227a9;
        address listed = address(0xA11cE);
        vm.prank(listed);
        hunt.buy(SILVER, proof);
        assertTrue(hunt.allowUsed(1, SILVER, listed));
    }

    // ------------------------------------------------------------------ opening

    function test_open_waits_for_the_reveal_block() public {
        _start(1, 100);
        uint256 id = _buy(alice, SILVER);
        vm.expectRevert(BallIsFlatHunt.TooEarly.selector);
        hunt.open(id);
        vm.roll(block.number + 1);
        vm.expectRevert(BallIsFlatHunt.TooEarly.selector);
        hunt.open(id);
        vm.expectRevert(BallIsFlatHunt.UnknownPack.selector);
        hunt.open(99);
    }

    function test_open_matches_the_mirror_and_mints_nothing() public {
        _start(2, 40);
        uint256 id = _buy(alice, DIAMOND);
        bytes32 h = keccak256("h");
        _reveal(id, h);
        (uint32[] memory want, uint256 hits) = _expected(id, h);
        uint32[] memory got = hunt.open(id);
        assertEq(got.length, 12);
        for (uint256 i; i < got.length; ++i) {
            assertEq(got[i], want[i]);
        }
        assertEq(keccak256(abi.encode(hunt.drawn(id))), keccak256(abi.encode(got)));
        assertEq(hunt.round(1).found, hits);
        assertEq(hunt.round(1).drawn, 12);
        assertEq(hunt.cardCount(), 0);
        vm.expectRevert(BallIsFlatHunt.AlreadyOpened.selector);
        hunt.open(id);
    }

    function test_packs_open_in_purchase_order() public {
        _start(1, 100);
        uint256 first = _buy(alice, SILVER);
        uint256 second = _buy(bob, SILVER);
        _reveal(first, keccak256("a"));
        _reveal(second, keccak256("b"));
        hunt.open(second); // opens the first one too
        assertTrue(hunt.pack(first).opened);
        assertTrue(hunt.pack(second).opened);
        assertEq(hunt.nextToOpen(), 3);
        vm.expectRevert(BallIsFlatHunt.AlreadyOpened.selector);
        hunt.open(first);
    }

    function test_open_caps_the_queue_and_openNext_drains_it() public {
        _start(1, 1000);
        uint256 last;
        for (uint256 i; i < 45; ++i) {
            last = _buy(i % 2 == 0 ? alice : bob, SILVER);
        }
        vm.roll(block.number + 2);
        vm.expectRevert(abi.encodeWithSelector(BallIsFlatHunt.QueueTooLong.selector, 1));
        hunt.open(last);
        assertEq(hunt.openNext(30), 30);
        assertEq(hunt.nextToOpen(), 31);
        hunt.open(last);
        assertEq(hunt.openNext(10), 0);
    }

    function test_openNext_stops_at_an_unrevealed_pack() public {
        _start(1, 100);
        _buy(alice, SILVER);
        vm.roll(block.number + 2);
        _buy(bob, SILVER); // reveal block not reached yet
        assertEq(hunt.openNext(10), 1);
        assertEq(hunt.nextToOpen(), 2);
    }

    // ------------------------------------------------------------------ winners

    function test_sold_out_deck_always_has_every_winner() public {
        _start(3, 30); // ten Silver packs
        for (uint256 i; i < 10; ++i) {
            _buy(i % 2 == 0 ? alice : bob, SILVER);
        }
        vm.prank(alice);
        vm.expectRevert(BallIsFlatHunt.SoldOut.selector);
        hunt.buy(SILVER, none);
        vm.roll(block.number + 2);
        hunt.openNext(10);
        BallIsFlatHunt.Round memory r = hunt.round(1);
        assertEq(r.found, 3);
        assertEq(r.drawn, 30);
        assertEq(uint8(r.status), uint8(BallIsFlatHunt.Status.Done));
        assertEq(hunt.finds(1).length, 3);
    }

    function testFuzz_wanted_cards_are_exactly_the_winners(uint256 seed, uint8 winners) public {
        uint16 w = uint16(bound(winners, 1, 12));
        hunt.startRound(KANE, PRIZE, w, 36, _pool(20), _tiers());
        for (uint256 i; i < 12; ++i) {
            _buy(i % 3 == 0 ? alice : bob, SILVER);
        }
        vm.roll(block.number + 2);
        for (uint256 i; i < 12; ++i) {
            vm.setBlockhash(hunt.pack(i + 1).revealBlock, keccak256(abi.encode(seed, i)));
        }
        uint256 kanes;
        for (uint256 i; i < 12; ++i) {
            hunt.open(i + 1);
            uint32[] memory d = hunt.drawn(i + 1);
            for (uint256 s; s < d.length; ++s) {
                if (d[s] == KANE) ++kanes;
            }
        }
        assertEq(kanes, w);
        assertEq(hunt.finds(1).length, w);
        assertEq(uint8(hunt.round(1).status), uint8(BallIsFlatHunt.Status.Done));
    }

    function test_round_done_stops_sales() public {
        _start(1, 100);
        uint256 id = _buy(alice, DIAMOND);
        _reveal(id, _hashFor(id, true));
        hunt.open(id);
        assertEq(uint8(hunt.round(1).status), uint8(BallIsFlatHunt.Status.Done));
        vm.prank(bob);
        vm.expectRevert(BallIsFlatHunt.NoOpenRound.selector);
        hunt.buy(SILVER, none);
    }

    function test_claim_and_markPaid_per_find() public {
        _start(2, 100);
        uint256 id = _buy(alice, DIAMOND);
        _reveal(id, _hashFor(id, true));
        hunt.open(id);
        BallIsFlatHunt.Find[] memory f = hunt.finds(1);
        assertEq(f[0].winner, alice);
        assertEq(f[0].packId, id);
        assertEq(hunt.drawn(id)[f[0].slot], KANE);

        vm.prank(bob);
        vm.expectRevert(BallIsFlatHunt.NotWinner.selector);
        hunt.claim(1, 0);
        vm.expectRevert(BallIsFlatHunt.UnknownFind.selector);
        hunt.claim(1, 5);
        vm.prank(alice);
        hunt.claim(1, 0);
        vm.prank(alice);
        vm.expectRevert(BallIsFlatHunt.AlreadyClaimed.selector);
        hunt.claim(1, 0);

        bytes32 tx_ = keccak256("transfer");
        hunt.markPaid(1, 0, tx_);
        f = hunt.finds(1);
        assertTrue(f[0].claimed);
        assertTrue(f[0].paid);
        assertEq(f[0].payment, tx_);
        vm.expectRevert(BallIsFlatHunt.AlreadyPaid.selector);
        hunt.markPaid(1, 0, tx_);
        vm.expectRevert(BallIsFlatHunt.UnknownFind.selector);
        hunt.markPaid(1, 9, tx_);
    }

    function test_expired_pack_loses_its_wanted_cards() public {
        uint32[] memory p = new uint32[](2);
        p[0] = 1;
        p[1] = KANE;
        hunt.startRound(KANE, PRIZE, 12, 12, p, _tiers()); // every card is Kane
        uint256 id = _buy(alice, DIAMOND);
        vm.roll(block.number + 300); // past the 256-block window, blockhash is zero
        uint32[] memory got = hunt.open(id);
        for (uint256 i; i < got.length; ++i) {
            assertEq(got[i], 1);
        }
        BallIsFlatHunt.Round memory r = hunt.round(1);
        assertEq(r.lost, 12);
        assertEq(r.found, 0);
        assertEq(hunt.finds(1).length, 0);
        assertEq(uint8(r.status), uint8(BallIsFlatHunt.Status.Done));
    }

    function test_closeRound_stops_sales_but_bought_packs_still_open() public {
        _start(1, 100);
        uint256 id = _buy(alice, DIAMOND);
        hunt.closeRound();
        assertEq(uint8(hunt.round(1).status), uint8(BallIsFlatHunt.Status.Closed));
        vm.prank(bob);
        vm.expectRevert(BallIsFlatHunt.NoOpenRound.selector);
        hunt.buy(SILVER, none);
        vm.expectRevert(BallIsFlatHunt.NoOpenRound.selector);
        hunt.closeRound();
        _reveal(id, _hashFor(id, true));
        hunt.open(id);
        assertEq(hunt.finds(1).length, 1);
        _start(1, 100);
        assertEq(hunt.currentRound(), 2);
    }

    // ------------------------------------------------------------------ cards

    function test_mintCard_mints_one_drawn_slot_to_the_buyer() public {
        _start(1, 100);
        uint256 id = _buy(alice, SILVER);
        vm.prank(alice);
        vm.expectRevert(BallIsFlatHunt.NotOpened.selector);
        hunt.mintCard(id, 0);
        _reveal(id, keccak256("x"));
        uint32[] memory got = hunt.open(id);
        vm.prank(bob);
        vm.expectRevert(BallIsFlatHunt.NotBuyer.selector);
        hunt.mintCard(id, 0);
        vm.prank(alice);
        vm.expectRevert(BallIsFlatHunt.BadSlot.selector);
        hunt.mintCard(id, 3);
        vm.prank(alice);
        uint256 card = hunt.mintCard(id, 1);
        assertEq(hunt.ownerOf(card), alice);
        assertEq(hunt.cardPlayer(card), got[1]);
        assertEq(hunt.cardRound(card), 1);
        assertEq(hunt.cardPack(card), id);
        vm.prank(alice);
        vm.expectRevert(BallIsFlatHunt.AlreadyMinted.selector);
        hunt.mintCard(id, 1);
        vm.expectRevert(BallIsFlatHunt.UnknownPack.selector);
        hunt.mintCard(99, 0);
    }

    function test_mintPrice_is_split_like_a_pack() public {
        _start(1, 100);
        uint256 id = _buy(alice, SILVER);
        _reveal(id, keccak256("x"));
        hunt.open(id);
        hunt.setMintPrice(20e18);
        uint256 dead = wif.balanceOf(DEAD);
        uint256 tre = wif.balanceOf(treasury);
        vm.prank(alice);
        hunt.mintCard(id, 0);
        assertEq(wif.balanceOf(DEAD) - dead, 2e18);
        assertEq(wif.balanceOf(treasury) - tre, 18e18);
    }

    function test_cards_are_bound_to_the_opener() public {
        _start(1, 100);
        uint256 id = _buy(alice, SILVER);
        _reveal(id, keccak256("x"));
        hunt.open(id);
        vm.prank(alice);
        hunt.mintCard(id, 0);
        vm.prank(alice);
        vm.expectRevert(BallIsFlatHunt.CardBound.selector);
        hunt.transferFrom(alice, bob, 1);
        vm.prank(alice);
        hunt.approve(bob, 1);
        vm.prank(bob);
        vm.expectRevert(BallIsFlatHunt.CardBound.selector);
        hunt.transferFrom(alice, bob, 1);
    }

    function test_tokenURI() public {
        _start(1, 100);
        uint256 id = _buy(alice, SILVER);
        _reveal(id, keccak256("x"));
        hunt.open(id);
        vm.startPrank(alice);
        hunt.mintCard(id, 0);
        hunt.mintCard(id, 1);
        vm.stopPrank();
        assertEq(hunt.tokenURI(1), "");
        hunt.setBaseURI("https://wif-api.ballisflat.fun/hunt/cards/");
        assertEq(hunt.tokenURI(2), "https://wif-api.ballisflat.fun/hunt/cards/2");
    }

    // ------------------------------------------------------------------ accounting

    function testFuzz_pack_money_never_stays_in_the_contract(uint256 seed) public {
        _start(2, 60);
        uint256 spent;
        for (uint256 step; step < 12; ++step) {
            uint256 r = uint256(keccak256(abi.encode(seed, step)));
            BallIsFlatHunt.Round memory rd = hunt.round(hunt.currentRound());
            if (rd.status != BallIsFlatHunt.Status.Open || rd.sold + 12 > rd.supply) {
                if (rd.status == BallIsFlatHunt.Status.Open) hunt.closeRound();
                _start(2, 60);
            }
            uint8 t = uint8(r % 3);
            uint256 id = _buy(r % 2 == 0 ? alice : bob, t);
            spent += hunt.tier(hunt.currentRound(), t).price;
            uint64 reveal = hunt.pack(id).revealBlock;
            vm.roll(reveal + 1 + (r % 3 == 0 ? 300 : 0));
            vm.setBlockhash(reveal, keccak256(abi.encode(r)));
            hunt.open(id);
            assertEq(wif.balanceOf(address(hunt)), 0);
            assertEq(wif.balanceOf(DEAD) + wif.balanceOf(treasury), spent);
        }
    }
}

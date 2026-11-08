// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {BallIsFlatHunt} from "../src/BallIsFlatHunt.sol";
import {MockWIF} from "./mocks/Mocks.sol";

contract HuntTest is Test {
    BallIsFlatHunt hunt;
    MockWIF wif;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address stranger = makeAddr("stranger");
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;

    uint16 constant BURN = 1000;
    uint16 constant WIN = 8000;
    uint32 constant KANE = 9;

    uint8 constant SILVER = 0;
    uint8 constant GOLD = 1;
    uint8 constant DIAMOND = 2;

    function _tiers() internal pure returns (BallIsFlatHunt.Tier[3] memory t) {
        t[0] = BallIsFlatHunt.Tier({price: 50e18, cards: 3});
        t[1] = BallIsFlatHunt.Tier({price: 100e18, cards: 7});
        t[2] = BallIsFlatHunt.Tier({price: 150e18, cards: 12});
    }

    function _pool(uint32 size) internal pure returns (uint32[] memory p) {
        p = new uint32[](size);
        for (uint32 i; i < size; ++i) {
            p[i] = i + 1; // 1..size, so KANE (9) is in any pool of 9 or more
        }
    }

    function setUp() public {
        vm.roll(1000);
        wif = new MockWIF();
        hunt = new BallIsFlatHunt(address(wif), BURN, WIN, _tiers());
        address[3] memory users = [alice, bob, stranger];
        for (uint256 i; i < users.length; ++i) {
            wif.mint(users[i], 1_000_000e18);
            vm.prank(users[i]);
            wif.approve(address(hunt), type(uint256).max);
        }
    }

    // ------------------------------------------------------------------ helpers

    /// Mirrors the contract's draw for a pack opened inside the reveal window.
    function _expected(bytes32 hash, uint256 packId, uint256 cards, uint32[] memory p)
        internal
        pure
        returns (uint32[] memory out)
    {
        bytes32 seed = keccak256(abi.encode(hash, packId));
        out = new uint32[](cards);
        for (uint256 i; i < cards; ++i) {
            out[i] = p[uint256(keccak256(abi.encode(seed, i))) % p.length];
        }
    }

    function _has(uint32[] memory list, uint32 who) internal pure returns (bool) {
        for (uint256 i; i < list.length; ++i) {
            if (list[i] == who) return true;
        }
        return false;
    }

    /// Picks a reveal hash for `packId` whose draw does (or does not) contain `target`.
    function _hashFor(uint256 packId, uint256 cards, uint32[] memory p, uint32 target, bool hit)
        internal
        pure
        returns (bytes32 h)
    {
        for (uint256 salt = 1; salt < 10_000; ++salt) {
            h = keccak256(abi.encode("hash", salt));
            if (_has(_expected(h, packId, cards, p), target) == hit) return h;
        }
        revert("no hash");
    }

    function _buyAndReveal(address who, uint8 t, bytes32 h) internal returns (uint256 packId) {
        vm.prank(who);
        packId = hunt.buy(t);
        BallIsFlatHunt.Pack memory pk = hunt.pack(packId);
        vm.roll(pk.revealBlock + 1);
        vm.setBlockhash(pk.revealBlock, h);
    }

    function _owed() internal view returns (uint256 total) {
        BallIsFlatHunt.Round memory r = hunt.round(hunt.currentRound());
        if (r.status == BallIsFlatHunt.Status.Open) total += r.pot;
        total += hunt.carry() + hunt.claimable(alice) + hunt.claimable(bob) + hunt.claimable(stranger);
    }

    // ------------------------------------------------------------------ constructor + rounds

    function test_constructor_rejects_bad_params() public {
        vm.expectRevert(BallIsFlatHunt.ZeroAddress.selector);
        new BallIsFlatHunt(address(0), BURN, WIN, _tiers());
        vm.expectRevert(BallIsFlatHunt.BadBps.selector);
        new BallIsFlatHunt(address(wif), 5001, WIN, _tiers());
        vm.expectRevert(BallIsFlatHunt.BadBps.selector);
        new BallIsFlatHunt(address(wif), BURN, 0, _tiers());
        BallIsFlatHunt.Tier[3] memory t = _tiers();
        t[1].cards = 0;
        vm.expectRevert(BallIsFlatHunt.BadTier.selector);
        new BallIsFlatHunt(address(wif), BURN, WIN, t);
        t = _tiers();
        t[2].price = 0;
        vm.expectRevert(BallIsFlatHunt.BadTier.selector);
        new BallIsFlatHunt(address(wif), BURN, WIN, t);
    }

    function test_startRound_validates_pool() public {
        uint32[] memory unsorted = new uint32[](3);
        unsorted[0] = 9;
        unsorted[1] = 3;
        unsorted[2] = 12;
        vm.expectRevert(BallIsFlatHunt.BadPool.selector);
        hunt.startRound(KANE, unsorted);

        uint32[] memory dup = new uint32[](3);
        dup[0] = 3;
        dup[1] = 9;
        dup[2] = 9;
        vm.expectRevert(BallIsFlatHunt.BadPool.selector);
        hunt.startRound(KANE, dup);

        vm.expectRevert(BallIsFlatHunt.BadPool.selector);
        hunt.startRound(KANE, _pool(8)); // 1..8, no Kane

        uint32[] memory one = new uint32[](1);
        one[0] = KANE;
        vm.expectRevert(BallIsFlatHunt.BadPool.selector);
        hunt.startRound(KANE, one);

        hunt.startRound(KANE, _pool(20));
        assertEq(hunt.currentRound(), 1);
        assertEq(hunt.round(1).target, KANE);
        assertEq(hunt.pool(1).length, 20);
        vm.expectRevert(BallIsFlatHunt.RoundStillOpen.selector);
        hunt.startRound(KANE, _pool(20));
    }

    function test_only_owner_runs_rounds() public {
        vm.startPrank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        hunt.startRound(KANE, _pool(20));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        hunt.closeRound();
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        hunt.setPaused(true);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        hunt.setBaseURI("x");
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ buying

    function test_buy_needs_open_round_and_valid_tier() public {
        vm.prank(alice);
        vm.expectRevert(BallIsFlatHunt.NoOpenRound.selector);
        hunt.buy(SILVER);
        hunt.startRound(KANE, _pool(20));
        vm.prank(alice);
        vm.expectRevert(BallIsFlatHunt.BadTier.selector);
        hunt.buy(3);
        hunt.setPaused(true);
        vm.prank(alice);
        vm.expectRevert(BallIsFlatHunt.IsPaused.selector);
        hunt.buy(SILVER);
    }

    function test_buy_burns_share_and_grows_pot() public {
        hunt.startRound(KANE, _pool(20));
        uint256 before = wif.balanceOf(alice);
        vm.prank(alice);
        uint256 id = hunt.buy(DIAMOND);
        assertEq(id, 1);
        assertEq(before - wif.balanceOf(alice), 150e18);
        assertEq(wif.balanceOf(DEAD), 15e18);
        assertEq(hunt.round(1).pot, 135e18);
        assertEq(hunt.round(1).packs, 1);
        assertEq(wif.balanceOf(address(hunt)), 135e18);
        BallIsFlatHunt.Pack memory p = hunt.pack(1);
        assertEq(p.buyer, alice);
        assertEq(p.tier, DIAMOND);
        assertEq(p.revealBlock, block.number + 1);
    }

    // ------------------------------------------------------------------ opening

    function test_open_waits_for_the_reveal_block() public {
        hunt.startRound(KANE, _pool(20));
        vm.prank(alice);
        uint256 id = hunt.buy(SILVER);
        vm.expectRevert(BallIsFlatHunt.TooEarly.selector);
        hunt.open(id);
        vm.roll(block.number + 1); // the reveal block itself: its hash is not known yet
        vm.expectRevert(BallIsFlatHunt.TooEarly.selector);
        hunt.open(id);
    }

    function test_open_mints_the_drawn_cards_to_the_buyer() public {
        uint32[] memory p = _pool(20);
        hunt.startRound(KANE, p);
        bytes32 h = _hashFor(1, 7, p, KANE, false);
        uint256 id = _buyAndReveal(alice, GOLD, h);

        vm.prank(stranger); // anyone may open; cards still go to the buyer
        uint32[] memory got = hunt.open(id);
        uint32[] memory want = _expected(h, id, 7, p);
        assertEq(got.length, 7);
        for (uint256 i; i < 7; ++i) {
            assertEq(got[i], want[i]);
            assertEq(hunt.ownerOf(i + 1), alice);
            assertEq(hunt.cardPlayer(i + 1), want[i]);
            assertEq(hunt.cardRound(i + 1), 1);
        }
        assertEq(hunt.cardCount(), 7);
        assertEq(hunt.balanceOf(alice), 7);
        assertEq(uint8(hunt.round(1).status), uint8(BallIsFlatHunt.Status.Open));

        vm.expectRevert(BallIsFlatHunt.AlreadyOpened.selector);
        hunt.open(id);
        vm.expectRevert(BallIsFlatHunt.UnknownPack.selector);
        hunt.open(99);
    }

    function test_finding_the_target_pays_winner_share_and_carries_the_rest() public {
        uint32[] memory p = _pool(20);
        hunt.startRound(KANE, p);
        vm.prank(bob);
        hunt.buy(GOLD); // 90 into the pot
        bytes32 h = _hashFor(2, 12, p, KANE, true);
        uint256 id = _buyAndReveal(alice, DIAMOND, h); // +135 = 225

        hunt.open(id);
        BallIsFlatHunt.Round memory r = hunt.round(1);
        assertEq(uint8(r.status), uint8(BallIsFlatHunt.Status.Won));
        assertEq(r.winner, alice);
        assertEq(hunt.claimable(alice), 180e18); // 80% of 225
        assertEq(hunt.carry(), 45e18);

        // buying stops until the owner names the next wanted player
        vm.prank(bob);
        vm.expectRevert(BallIsFlatHunt.NoOpenRound.selector);
        hunt.buy(SILVER);

        uint256 before = wif.balanceOf(alice);
        vm.prank(alice);
        assertEq(hunt.claim(), 180e18);
        assertEq(wif.balanceOf(alice) - before, 180e18);
        vm.prank(alice);
        vm.expectRevert(BallIsFlatHunt.NothingToClaim.selector);
        hunt.claim();

        hunt.startRound(3, p);
        assertEq(hunt.round(2).pot, 45e18);
        assertEq(hunt.carry(), 0);
        assertEq(wif.balanceOf(address(hunt)), 45e18);
    }

    function test_second_finder_in_a_won_round_gets_nothing() public {
        uint32[] memory p = _pool(20);
        hunt.startRound(KANE, p);
        vm.prank(alice);
        uint256 a = hunt.buy(DIAMOND);
        vm.prank(bob);
        uint256 b = hunt.buy(DIAMOND);
        uint64 reveal = hunt.pack(a).revealBlock;
        // same reveal block for both packs; find a hash where both draws hold Kane
        bytes32 h;
        for (uint256 salt = 1; salt < 50_000; ++salt) {
            h = keccak256(abi.encode("both", salt));
            if (_has(_expected(h, a, 12, p), KANE) && _has(_expected(h, b, 12, p), KANE)) break;
        }
        vm.roll(reveal + 1);
        vm.setBlockhash(reveal, h);
        hunt.open(b); // bob opens first and wins
        hunt.open(a);
        assertEq(hunt.round(1).winner, bob);
        assertEq(hunt.claimable(bob), (270e18 * uint256(WIN)) / 10_000);
        assertEq(hunt.claimable(alice), 0);
    }

    function test_expired_pack_never_holds_the_target() public {
        uint32[] memory p = new uint32[](2);
        p[0] = 1;
        p[1] = KANE; // half the pool is Kane, so a live draw of 12 almost surely finds him
        hunt.startRound(KANE, p);
        vm.prank(alice);
        uint256 id = hunt.buy(DIAMOND);
        vm.roll(block.number + 300); // past the 256-block window, blockhash is zero
        uint32[] memory got = hunt.open(id);
        for (uint256 i; i < got.length; ++i) {
            assertEq(got[i], 1);
        }
        assertEq(uint8(hunt.round(1).status), uint8(BallIsFlatHunt.Status.Open));
        assertEq(hunt.claimable(alice), 0);
    }

    function test_closeRound_rolls_the_whole_pot_over() public {
        hunt.startRound(KANE, _pool(20));
        vm.prank(alice);
        hunt.buy(GOLD);
        hunt.closeRound();
        assertEq(uint8(hunt.round(1).status), uint8(BallIsFlatHunt.Status.Closed));
        assertEq(hunt.carry(), 90e18);
        vm.expectRevert(BallIsFlatHunt.NoOpenRound.selector);
        hunt.closeRound();
        hunt.startRound(KANE, _pool(20));
        assertEq(hunt.round(2).pot, 90e18);
    }

    function test_pack_from_a_closed_round_opens_without_prize() public {
        uint32[] memory p = _pool(20);
        hunt.startRound(KANE, p);
        bytes32 h = _hashFor(1, 12, p, KANE, true);
        uint256 id = _buyAndReveal(alice, DIAMOND, h);
        hunt.closeRound();
        hunt.startRound(5, p);
        uint32[] memory got = hunt.open(id);
        assertTrue(_has(got, KANE)); // drawn from its own round's pool
        assertEq(hunt.claimable(alice), 0);
        assertEq(uint8(hunt.round(2).status), uint8(BallIsFlatHunt.Status.Open));
    }

    function test_tokenURI() public {
        uint32[] memory p = _pool(20);
        hunt.startRound(KANE, p);
        uint256 id = _buyAndReveal(alice, SILVER, _hashFor(1, 3, p, KANE, false));
        hunt.open(id);
        assertEq(hunt.tokenURI(1), "");
        hunt.setBaseURI("https://wif-api.ballisflat.fun/hunt/cards/");
        assertEq(hunt.tokenURI(2), "https://wif-api.ballisflat.fun/hunt/cards/2");
    }

    // ------------------------------------------------------------------ accounting

    function testFuzz_balance_covers_pot_carry_and_prizes(uint256 seed) public {
        uint32[] memory p = _pool(12);
        hunt.startRound(KANE, p);
        for (uint256 step; step < 12; ++step) {
            uint256 r = uint256(keccak256(abi.encode(seed, step)));
            address who = r % 2 == 0 ? alice : bob;
            if (hunt.round(hunt.currentRound()).status != BallIsFlatHunt.Status.Open) {
                hunt.startRound(uint32(1 + (r % 12)), p);
            }
            vm.prank(who);
            uint256 id = hunt.buy(uint8(r % 3));
            uint64 reveal = hunt.pack(id).revealBlock;
            vm.roll(reveal + 1 + (r % 3 == 0 ? 300 : 0));
            vm.setBlockhash(reveal, keccak256(abi.encode(r)));
            hunt.open(id);
            if (r % 5 == 0 && hunt.claimable(who) > 0) {
                vm.prank(who);
                hunt.claim();
            }
            assertEq(wif.balanceOf(address(hunt)), _owed());
        }
    }
}

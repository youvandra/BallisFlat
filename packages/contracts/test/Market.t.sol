// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {BallIsFlat} from "../src/BallIsFlat.sol";
import {IBallIsFlat} from "../src/IBallIsFlat.sol";
import {Squad} from "./Squad.sol";
import {MockWIF, HookToken, Reenterer} from "./mocks/Mocks.sol";

/// Opening cards, the per-player cap and the sealed-card market.
contract MarketTest is Test {
    BallIsFlat bif;
    MockWIF wif;

    address settler = makeAddr("settler");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");
    address stranger = makeAddr("stranger");
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;

    uint16 constant BURN = 1000;
    uint16 constant SALE_BURN = 500;
    uint64 constant WINDOW = 7200;
    uint256 constant PRICE = 1000e18;
    uint256 constant ASK = 1500e18;
    uint64 constant KICK = 1 days;

    uint32 constant KANE = 9;
    uint32 constant MODRIC = 10;
    uint32 constant SAKA = 7;

    function setUp() public {
        vm.warp(1_800_000_000);
        wif = new MockWIF();
        bif = new BallIsFlat(address(wif), settler, BURN, WINDOW, SALE_BURN);
        address[4] memory users = [alice, bob, carol, stranger];
        for (uint256 i; i < users.length; ++i) {
            wif.mint(users[i], 1_000_000e18);
            vm.prank(users[i]);
            wif.approve(address(bif), type(uint256).max);
        }
    }

    // ------------------------------------------------------------------ helpers

    function _players() internal pure returns (uint32[] memory p) {
        // strictly ascending, as listMatch requires
        p = new uint32[](3);
        p[0] = SAKA;
        p[1] = KANE;
        p[2] = MODRIC;
    }

    function _proof(uint32 player) internal pure returns (bytes32[] memory) {
        return Squad.proof(_players(), player);
    }

    function _proofs(uint32[] memory winners) internal pure returns (bytes32[][] memory out) {
        out = new bytes32[][](winners.length);
        for (uint256 i; i < winners.length; ++i) {
            out[i] = _proof(winners[i]);
        }
    }

    function _one(uint32 a) internal pure returns (uint32[] memory w) {
        w = new uint32[](1);
        w[0] = a;
    }

    function _list(uint32 cap) internal returns (uint256) {
        return bif.listMatch(uint64(block.timestamp) + KICK, PRICE, 0, _players(), cap);
    }

    function _mint(address who, uint256 matchId, uint32 player) internal returns (uint256) {
        vm.prank(who);
        return bif.mint(matchId, player, _proof(player));
    }

    /// alice mints a KANE card on a fresh match and lists it at ASK.
    function _listed() internal returns (uint256 id, uint256 t) {
        id = _list(0);
        t = _mint(alice, id, KANE);
        vm.prank(alice);
        bif.listForSale(t, ASK);
    }

    function _settle(uint256 matchId, uint32 winner) internal {
        vm.warp(bif.matchInfo(matchId).kickoff);
        vm.prank(settler);
        bif.propose(matchId, _one(winner), _proofs(_one(winner)), "https://www.fotmob.com/match/1");
        vm.warp(block.timestamp + WINDOW);
        bif.finalize(matchId);
    }

    function _assertNoListing(uint256 t) internal view {
        (address s, uint256 p) = bif.listingOf(t);
        assertEq(s, address(0));
        assertEq(p, 0);
    }

    // ------------------------------------------------------------------ constructor

    function test_Constructor_SaleBurnBps() public {
        assertEq(bif.saleBurnBps(), SALE_BURN);
        vm.expectRevert(BallIsFlat.InvalidBurnBps.selector);
        new BallIsFlat(address(wif), settler, BURN, WINDOW, 10_001);
        assertEq(new BallIsFlat(address(wif), settler, BURN, WINDOW, 10_000).saleBurnBps(), 10_000);
    }

    // ------------------------------------------------------------------ open

    function test_Open_HappyPath() public {
        uint256 id = _list(0);
        uint256 t = _mint(alice, id, KANE);
        assertFalse(bif.isOpened(t));
        vm.expectEmit(true, true, false, true);
        emit IBallIsFlat.CardOpened(t, id, alice);
        vm.prank(alice);
        bif.open(t);
        assertTrue(bif.isOpened(t));
    }

    function test_Open_AlreadyOpenedReverts() public {
        uint256 t = _mint(alice, _list(0), KANE);
        vm.startPrank(alice);
        bif.open(t);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.AlreadyOpened.selector, t));
        bif.open(t);
        vm.stopPrank();
    }

    function test_Open_NonOwnerReverts() public {
        uint256 t = _mint(alice, _list(0), KANE);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.NotCardOwner.selector, t));
        bif.open(t);
        // an approved operator is not the owner either
        vm.prank(alice);
        bif.setApprovalForAll(bob, true);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.NotCardOwner.selector, t));
        bif.open(t);
        // nonexistent token
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.NotCardOwner.selector, 99));
        bif.open(99);
    }

    function test_Transfer_OpenedCardIsLocked() public {
        uint256 id = _list(0);
        uint256 t = _mint(alice, id, KANE);
        vm.startPrank(alice);
        bif.open(t);
        vm.expectRevert(abi.encodeWithSelector(BallIsFlat.CardLocked.selector, t));
        bif.transferFrom(alice, bob, t);
        vm.stopPrank();
        assertEq(bif.ownerOf(t), alice);
        assertTrue(bif.isOpened(t));
    }

    function test_Cap_RevertsAtCapPlusOne() public {
        uint256 id = _list(2);
        assertEq(bif.matchInfo(id).maxPerPlayer, 2);
        assertEq(bif.remaining(id, KANE), 2);
        _mint(alice, id, KANE);
        assertEq(bif.remaining(id, KANE), 1);
        _mint(bob, id, KANE);
        assertEq(bif.remaining(id, KANE), 0);
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.PlayerSoldOut.selector, id, KANE));
        bif.mint(id, KANE, _proof(KANE));
        // the cap is per player: carol can still pick someone else
        _mint(carol, id, MODRIC);
        assertEq(bif.remaining(id, MODRIC), 1);
        assertEq(bif.remaining(id, SAKA), 2);
        assertEq(bif.cardsOn(id, KANE), 2);
    }

    function test_Cap_ZeroIsUnlimited() public {
        uint256 id = _list(0);
        assertEq(bif.matchInfo(id).maxPerPlayer, 0);
        assertEq(bif.remaining(id, KANE), type(uint32).max);
        for (uint256 i; i < 12; ++i) {
            address u = address(uint160(0x30000 + i));
            wif.mint(u, PRICE);
            vm.startPrank(u);
            wif.approve(address(bif), PRICE);
            bif.mint(id, KANE, _proof(KANE));
            vm.stopPrank();
        }
        assertEq(bif.cardsOn(id, KANE), 12);
        assertEq(bif.remaining(id, KANE), type(uint32).max);
    }

    function test_Remaining_UnlistedMatchIsZero_SquadNotChecked() public {
        uint256 id = _list(5);
        assertEq(bif.remaining(42, KANE), 0);
        // remaining does not take a proof, so an id outside the squad reads as the cap; mint still refuses it.
        assertEq(bif.remaining(id, 99), 5);
    }

    // ------------------------------------------------------------------ list / cancel

    function test_List_HappyPath() public {
        uint256 id = _list(0);
        uint256 t = _mint(alice, id, KANE);
        vm.expectEmit(true, true, true, true);
        emit IBallIsFlat.CardListed(t, id, alice, ASK);
        vm.prank(alice);
        bif.listForSale(t, ASK);
        (address s, uint256 p) = bif.listingOf(t);
        assertEq(s, alice);
        assertEq(p, ASK);
        assertEq(bif.ownerOf(t), alice, "no escrow");
    }

    function test_List_RelistUpdatesPrice() public {
        (uint256 id, uint256 t) = _listed();
        vm.expectEmit(true, true, true, true);
        emit IBallIsFlat.CardListed(t, id, alice, 2 * ASK);
        vm.prank(alice);
        bif.listForSale(t, 2 * ASK);
        (, uint256 p) = bif.listingOf(t);
        assertEq(p, 2 * ASK);
    }

    function test_List_Reverts() public {
        uint256 id = _list(0);
        uint256 t = _mint(alice, id, KANE);
        uint256 t2 = _mint(bob, id, KANE);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.NotCardOwner.selector, t));
        bif.listForSale(t, ASK);

        vm.prank(alice);
        vm.expectRevert(IBallIsFlat.ZeroPrice.selector);
        bif.listForSale(t, 0);

        vm.startPrank(bob);
        bif.open(t2);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.AlreadyOpened.selector, t2));
        bif.listForSale(t2, ASK);
        vm.stopPrank();

        vm.warp(bif.matchInfo(id).kickoff);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.TradingClosed.selector, id));
        bif.listForSale(t, ASK);
    }

    function test_List_VoidedMatchReverts() public {
        uint256 id = _list(0);
        uint256 t = _mint(alice, id, KANE);
        vm.prank(settler);
        bif.voidMatch(id);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.TradingClosed.selector, id));
        bif.listForSale(t, ASK);
    }

    function test_Cancel_HappyPathAndReverts() public {
        (, uint256 t) = _listed();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.NotCardOwner.selector, t));
        bif.cancelListing(t);

        vm.expectEmit(true, false, false, false);
        emit IBallIsFlat.ListingCancelled(t);
        vm.prank(alice);
        bif.cancelListing(t);
        _assertNoListing(t);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.NotForSale.selector, t));
        bif.cancelListing(t);
    }

    // ------------------------------------------------------------------ buy

    function test_Buy_HappyPath_ExactBalances() public {
        (uint256 id, uint256 t) = _listed();
        uint256 sellerBefore = wif.balanceOf(alice);
        uint256 buyerBefore = wif.balanceOf(bob);
        uint256 deadBefore = wif.balanceOf(DEAD);
        uint256 contractBefore = wif.balanceOf(address(bif));
        uint256 burned = ASK * SALE_BURN / 10_000; // 75 WIF

        vm.expectEmit(true, true, true, true);
        emit IBallIsFlat.CardSold(t, id, alice, bob, ASK, burned);
        vm.prank(bob);
        bif.buy(t, ASK);

        assertEq(burned, 75e18);
        assertEq(wif.balanceOf(alice) - sellerBefore, ASK - burned, "seller gets price - burn");
        assertEq(wif.balanceOf(DEAD) - deadBefore, burned, "dead gets burn");
        assertEq(buyerBefore - wif.balanceOf(bob), ASK, "buyer pays price");
        assertEq(wif.balanceOf(address(bif)), contractBefore, "pot untouched");
        assertEq(bif.matchInfo(id).pot, PRICE, "pot untouched");
        assertEq(bif.ownerOf(t), bob);
        assertFalse(bif.isOpened(t));
        _assertNoListing(t);

        // the mint slot stays with the minter
        assertEq(bif.cardOf(id, alice), t);
        assertEq(bif.cardOf(id, bob), 0);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.AlreadyHasCard.selector, id, t));
        bif.mint(id, MODRIC, _proof(MODRIC));
        // the buyer may still mint his own card and hold two of this match
        uint256 own = _mint(bob, id, MODRIC);
        assertEq(bif.cardOf(id, bob), own);
        assertEq(bif.balanceOf(bob), 2);
    }

    function test_Buy_NoListingReverts() public {
        uint256 t = _mint(alice, _list(0), KANE);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.NotForSale.selector, t));
        bif.buy(t, ASK);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.NotForSale.selector, 99));
        bif.buy(99, ASK);
    }

    function test_Buy_OpenedCardReverts_OpenClearsListing() public {
        (, uint256 t) = _listed();
        vm.expectEmit(true, false, false, false);
        emit IBallIsFlat.ListingCancelled(t);
        vm.prank(alice);
        bif.open(t);
        _assertNoListing(t);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.NotForSale.selector, t));
        bif.buy(t, ASK);
    }

    function test_Buy_AtKickoffReverts_ListingExpires() public {
        (uint256 id, uint256 t) = _listed();
        vm.warp(bif.matchInfo(id).kickoff - 1);
        (address s,) = bif.listingOf(t);
        assertEq(s, alice, "still live one second before kickoff");
        vm.warp(bif.matchInfo(id).kickoff);
        _assertNoListing(t);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.TradingClosed.selector, id));
        bif.buy(t, ASK);
    }

    function test_Buy_VoidedMatchReverts() public {
        (uint256 id, uint256 t) = _listed();
        vm.prank(settler);
        bif.voidMatch(id);
        _assertNoListing(t);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.TradingClosed.selector, id));
        bif.buy(t, ASK);
    }

    function test_Buy_PriceAboveMaxReverts() public {
        (, uint256 t) = _listed();
        // seller raises the price just before the buy lands
        vm.prank(alice);
        bif.listForSale(t, 2 * ASK);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.PriceAboveMax.selector, 2 * ASK, ASK));
        bif.buy(t, ASK);
        // a lower price than maxPrice is fine and charges the listed price
        vm.prank(alice);
        bif.listForSale(t, ASK / 2);
        uint256 before = wif.balanceOf(bob);
        vm.prank(bob);
        bif.buy(t, ASK);
        assertEq(before - wif.balanceOf(bob), ASK / 2);
    }

    function test_Transfer_LockedLeavesListingBuyable() public {
        (, uint256 t) = _listed();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(BallIsFlat.CardLocked.selector, t));
        bif.transferFrom(alice, carol, t);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(BallIsFlat.CardLocked.selector, t));
        bif.safeTransferFrom(alice, carol, t);
        // the listing survives the failed transfer and the sale goes through the market
        vm.prank(bob);
        bif.buy(t, ASK);
        assertEq(bif.ownerOf(t), bob);
        _assertNoListing(t);
        // the old seller cannot cancel or relist; the new owner can list
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.NotForSale.selector, t));
        bif.cancelListing(t);
        vm.prank(bob);
        bif.listForSale(t, ASK);
        (address s_,) = bif.listingOf(t);
        assertEq(s_, bob);
    }

    function test_Transfer_ApprovedOperatorIsLocked() public {
        uint256 id = _list(0);
        uint256 t = _mint(alice, id, KANE);
        vm.prank(alice);
        bif.setApprovalForAll(carol, true);
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(BallIsFlat.CardLocked.selector, t));
        bif.transferFrom(alice, carol, t);
        assertEq(bif.ownerOf(t), alice);
    }

    function test_Buy_OwnCardReverts() public {
        (, uint256 t) = _listed();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.CannotBuyOwnCard.selector, t));
        bif.buy(t, ASK);
    }

    function test_Buy_InsufficientAllowanceReverts() public {
        (, uint256 t) = _listed();
        vm.prank(bob);
        wif.approve(address(bif), ASK - 1);
        uint256 burned = ASK * SALE_BURN / 10_000;
        // the burn leg is pulled first, then the seller leg runs out of allowance
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientAllowance.selector, address(bif), ASK - 1 - burned, ASK - burned
            )
        );
        bif.buy(t, ASK);
        assertEq(bif.ownerOf(t), alice);
    }

    // ------------------------------------------------------------------ listings cleared by burns

    function test_Claim_BurnClearsListing() public {
        (uint256 id, uint256 t) = _listed();
        _settle(id, KANE);
        vm.expectEmit(true, false, false, false);
        emit IBallIsFlat.ListingCancelled(t);
        vm.prank(alice);
        bif.claim(t);
        _assertNoListing(t);
    }

    function test_Refund_BurnClearsListing() public {
        (uint256 id, uint256 t) = _listed();
        vm.prank(settler);
        bif.voidMatch(id);
        vm.expectEmit(true, false, false, false);
        emit IBallIsFlat.ListingCancelled(t);
        vm.prank(alice);
        bif.refund(t);
    }

    // ------------------------------------------------------------------ the buyer holds a real card

    function test_Buyer_ClaimsWinningCard() public {
        (uint256 id, uint256 t) = _listed();
        _mint(carol, id, MODRIC);
        vm.prank(bob);
        bif.buy(t, ASK);
        _settle(id, KANE);
        uint256 before = wif.balanceOf(bob);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.NotCardOwner.selector, t));
        bif.claim(t);
        vm.prank(bob);
        uint256 got = bif.claim(t);
        assertEq(got, (2 * PRICE * 9) / 10, "one winning card takes the pay pool");
        assertEq(wif.balanceOf(bob) - before, got);
    }

    function test_Buyer_RefundsVoidedCard() public {
        (uint256 id, uint256 t) = _listed();
        vm.prank(bob);
        bif.buy(t, ASK);
        vm.prank(settler);
        bif.voidMatch(id);
        vm.prank(bob);
        assertEq(bif.refund(t), PRICE, "refund is the mint price, not the sale price");
    }

    // ------------------------------------------------------------------ reentrancy

    function _hookSetup() internal returns (BallIsFlat h, HookToken tok, Reenterer r, uint256 id) {
        tok = new HookToken();
        h = new BallIsFlat(address(tok), settler, BURN, WINDOW, SALE_BURN);
        r = new Reenterer(IBallIsFlat(address(h)));
        tok.mint(address(r), 10 * PRICE);
        r.approve(address(tok), type(uint256).max);
        tok.mint(alice, 10 * PRICE);
        vm.prank(alice);
        tok.approve(address(h), type(uint256).max);
        id = h.listMatch(uint64(block.timestamp) + KICK, PRICE, 0, _players(), 0);
    }

    /// Seller's token hook fires while it is paid and tries to buy the same card again.
    function test_Reentrancy_BuyViaSellerTokenHook() public {
        (BallIsFlat h, HookToken tok, Reenterer r, uint256 id) = _hookSetup();
        uint256 t = r.doMint(id, KANE, _proof(KANE));
        r.doList(t, ASK);
        tok.setHooked(address(r), true);
        r.arm(Reenterer.Mode.Buy, t, 0);
        uint256 aliceBefore = tok.balanceOf(alice);
        vm.prank(alice);
        h.buy(t, ASK);
        assertTrue(r.attempted());
        assertEq(bytes4(r.lastError()), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(h.ownerOf(t), alice);
        assertEq(aliceBefore - tok.balanceOf(alice), ASK, "paid once");
    }

    /// Seller tries to open the card while it is being paid, so the buyer would get an opened card.
    function test_Reentrancy_OpenViaSellerTokenHook() public {
        (BallIsFlat h, HookToken tok, Reenterer r, uint256 id) = _hookSetup();
        uint256 t = r.doMint(id, KANE, _proof(KANE));
        r.doList(t, ASK);
        tok.setHooked(address(r), true);
        r.arm(Reenterer.Mode.Open, t, 0);
        vm.prank(alice);
        h.buy(t, ASK);
        assertEq(bytes4(r.lastError()), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertFalse(h.isOpened(t), "buyer receives a sealed card");
        assertEq(h.ownerOf(t), alice);
    }

    /// Buyer contract re-enters from onERC721Received.
    function test_Reentrancy_BuyerERC721Receiver() public {
        (BallIsFlat h,, Reenterer r, uint256 id) = _hookSetup();
        vm.prank(alice);
        uint256 t = h.mint(id, KANE, _proof(KANE));
        vm.prank(alice);
        h.listForSale(t, ASK);
        r.arm(Reenterer.Mode.Open, t, 0);
        r.doBuy(t, ASK);
        assertTrue(r.attempted());
        assertEq(bytes4(r.lastError()), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(h.ownerOf(t), address(r));
    }

    // ------------------------------------------------------------------ fuzz

    /// price == sellerReceived + burned, buyer pays exactly price, pots untouched.
    function testFuzz_SaleConservation(uint256 price, uint16 saleBps) public {
        price = bound(price, 1, 1e30);
        saleBps = uint16(bound(saleBps, 0, 10_000));
        BallIsFlat h = new BallIsFlat(address(wif), settler, BURN, WINDOW, saleBps);
        uint256 id = h.listMatch(uint64(block.timestamp) + KICK, PRICE, 0, _players(), 0);
        vm.startPrank(alice);
        wif.approve(address(h), type(uint256).max);
        uint256 t = h.mint(id, KANE, _proof(KANE));
        h.listForSale(t, price);
        vm.stopPrank();
        wif.mint(bob, price);
        vm.prank(bob);
        wif.approve(address(h), type(uint256).max);

        uint256 sellerBefore = wif.balanceOf(alice);
        uint256 buyerBefore = wif.balanceOf(bob);
        uint256 deadBefore = wif.balanceOf(DEAD);
        vm.prank(bob);
        h.buy(t, price);

        uint256 received = wif.balanceOf(alice) - sellerBefore;
        uint256 burned = wif.balanceOf(DEAD) - deadBefore;
        assertEq(received + burned, price, "conservation");
        assertEq(burned, price * saleBps / 10_000, "floor burn");
        assertEq(buyerBefore - wif.balanceOf(bob), price);
        assertEq(wif.balanceOf(address(h)), PRICE, "pot untouched");
    }
}

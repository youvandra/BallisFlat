// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721Errors, IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {BallIsFlat} from "../src/BallIsFlat.sol";
import {IBallIsFlat} from "../src/IBallIsFlat.sol";
import {Squad} from "./Squad.sol";
import {IERC4906} from "@openzeppelin/contracts/interfaces/IERC4906.sol";
import {MockWIF, HookToken, Reenterer, NoReceiver} from "./mocks/Mocks.sol";

contract BallIsFlatTest is Test {
    BallIsFlat bif;
    MockWIF wif;

    address owner = address(this);
    address settler = makeAddr("settler");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");
    address dave = makeAddr("dave");
    address stranger = makeAddr("stranger");
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;

    uint16 constant BURN = 1000;
    uint16 constant SALE_BURN = 500;
    uint64 constant WINDOW = 7200;
    uint256 constant PRICE = 1000e18;
    uint64 constant KICK = 1 days;

    uint32 constant KANE = 9;
    uint32 constant MODRIC = 10;
    uint32 constant SAKA = 7;

    function setUp() public {
        vm.warp(1_800_000_000);
        wif = new MockWIF();
        bif = new BallIsFlat(address(wif), settler, BURN, WINDOW, SALE_BURN);
        address[6] memory users = [alice, bob, carol, dave, stranger, address(this)];
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

    function _two(uint32 a, uint32 b) internal pure returns (uint32[] memory w) {
        w = new uint32[](2);
        w[0] = a;
        w[1] = b;
    }

    function _list(uint256 nextMatch) internal returns (uint256) {
        return bif.listMatch(uint64(block.timestamp) + KICK, PRICE, nextMatch, _players(), 0);
    }

    function _list() internal returns (uint256) {
        return _list(0);
    }

    function _mint(address who, uint256 matchId, uint32 player) internal returns (uint256) {
        vm.prank(who);
        return bif.mint(matchId, player, _proof(player));
    }

    function _propose(uint256 matchId, uint32[] memory winners) internal {
        IBallIsFlat.MatchInfo memory m = bif.matchInfo(matchId);
        if (block.timestamp < m.kickoff) vm.warp(m.kickoff);
        vm.prank(settler);
        bif.propose(matchId, winners, _proofs(winners), "https://www.fotmob.com/match/1");
    }

    function _settle(uint256 matchId, uint32[] memory winners) internal {
        _propose(matchId, winners);
        vm.warp(block.timestamp + WINDOW);
        bif.finalize(matchId);
    }

    // ------------------------------------------------------------------ constructor / reads

    function test_Constructor_SetsReads() public view {
        assertEq(bif.wif(), address(wif));
        assertEq(bif.settler(), settler);
        assertEq(bif.burnBps(), BURN);
        assertEq(bif.disputeWindow(), WINDOW);
        assertEq(bif.owner(), owner);
        assertEq(bif.matchCount(), 0);
        assertEq(bif.name(), "Ball is Flat");
        assertEq(bif.symbol(), "BIF");
    }

    function test_Constructor_InputValidation() public {
        vm.expectRevert(BallIsFlat.ZeroAddress.selector);
        new BallIsFlat(address(0), settler, BURN, WINDOW, SALE_BURN);
        vm.expectRevert(BallIsFlat.ZeroAddress.selector);
        new BallIsFlat(address(wif), address(0), BURN, WINDOW, SALE_BURN);
        vm.expectRevert(BallIsFlat.InvalidBurnBps.selector);
        new BallIsFlat(address(wif), settler, 10_001, WINDOW, SALE_BURN);
    }

    // ------------------------------------------------------------------ listMatch

    function test_ListMatch_HappyPath() public {
        uint64 kickoff = uint64(block.timestamp) + KICK;
        vm.expectEmit(true, false, false, true);
        emit IBallIsFlat.MatchListed(1, kickoff, PRICE, 0, Squad.root(_players()), _players());
        uint256 id = bif.listMatch(kickoff, PRICE, 0, _players(), 0);
        assertEq(id, 1);
        assertEq(bif.matchCount(), 1);
        IBallIsFlat.MatchInfo memory m = bif.matchInfo(id);
        assertEq(m.kickoff, kickoff);
        assertEq(m.price, PRICE);
        assertEq(uint8(m.status), uint8(IBallIsFlat.Status.Listed));
        assertEq(m.pot, 0);
        assertEq(m.playersRoot, Squad.root(_players()));
        assertEq(m.playersRoot, bif.squadRoot(_players()));
        assertEq(_list(1), 2);
        assertEq(bif.matchInfo(2).nextMatch, 1);
    }

    function test_ListMatch_AccessControl_StrangerReverts() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        bif.listMatch(uint64(block.timestamp) + KICK, PRICE, 0, _players(), 0);
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, settler));
        bif.listMatch(uint64(block.timestamp) + KICK, PRICE, 0, _players(), 0);
    }

    function test_ListMatch_InputValidation() public {
        uint64 future = uint64(block.timestamp) + KICK;
        vm.expectRevert(BallIsFlat.InvalidListing.selector);
        bif.listMatch(uint64(block.timestamp), PRICE, 0, _players(), 0); // kickoff == now
        vm.expectRevert(BallIsFlat.InvalidListing.selector);
        bif.listMatch(uint64(block.timestamp) - 1, PRICE, 0, _players(), 0); // past
        vm.expectRevert(BallIsFlat.InvalidListing.selector);
        bif.listMatch(future, 0, 0, _players(), 0); // zero price
        vm.expectRevert(BallIsFlat.InvalidListing.selector);
        bif.listMatch(future, PRICE, 0, new uint32[](0), 0); // no players
        vm.expectRevert(BallIsFlat.InvalidSquad.selector);
        bif.listMatch(future, PRICE, 0, _two(KANE, KANE), 0); // duplicate player
        vm.expectRevert(BallIsFlat.InvalidSquad.selector);
        bif.listMatch(future, PRICE, 0, _two(MODRIC, KANE), 0); // not ascending
        vm.expectRevert(BallIsFlat.InvalidListing.selector);
        bif.listMatch(future, PRICE, 1, _players(), 0); // nextMatch does not exist yet
        assertEq(bif.matchCount(), 0);
    }

    // ------------------------------------------------------------------ mint

    function test_Mint_HappyPath() public {
        uint256 id = _list();
        uint256 before = wif.balanceOf(alice);
        vm.expectEmit(true, true, true, true);
        emit IBallIsFlat.CardMinted(id, KANE, 1, alice, 1);
        uint256 tokenId = _mint(alice, id, KANE);
        assertEq(tokenId, 1, "token ids start at 1");
        assertEq(bif.ownerOf(1), alice);
        assertEq(wif.balanceOf(alice), before - PRICE);
        assertEq(wif.balanceOf(address(bif)), PRICE);
        assertEq(bif.cardOf(id, alice), 1);
        assertEq(bif.cardOf(id, bob), 0);
        assertEq(bif.cardsOn(id, KANE), 1);
        IBallIsFlat.CardInfo memory c = bif.cardInfo(1);
        assertEq(c.matchId, id);
        assertEq(c.playerId, KANE);
        assertEq(c.serial, 1);

        uint256 t2 = _mint(bob, id, MODRIC);
        assertEq(t2, 2);
        assertEq(bif.cardInfo(2).serial, 2);
        IBallIsFlat.MatchInfo memory m = bif.matchInfo(id);
        assertEq(m.cards, 2);
        assertEq(m.pot, 2 * PRICE);
        assertEq(bif.totalSupply(), 2);
        assertEq(bif.tokenOfOwnerByIndex(bob, 0), 2);
    }

    function test_Mint_SecondCardReverts_AlreadyHasCard() public {
        uint256 id = _list();
        _mint(alice, id, KANE);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.AlreadyHasCard.selector, id, 1));
        bif.mint(id, MODRIC, _proof(MODRIC));
    }

    function test_Mint_TransferAwayStillBlocksSecondMint() public {
        uint256 id = _list();
        uint256 t = _mint(alice, id, KANE);
        vm.prank(alice);
        bif.transferFrom(alice, bob, t);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.AlreadyHasCard.selector, id, t));
        bif.mint(id, MODRIC, _proof(MODRIC));
        // the receiver of a card can still mint their own
        _mint(bob, id, SAKA);
        assertEq(bif.balanceOf(bob), 2);
    }

    function test_Mint_OneCardPerMatchNotGlobal() public {
        uint256 a = _list();
        uint256 b = _list();
        _mint(alice, a, KANE);
        _mint(alice, b, KANE);
        assertEq(bif.balanceOf(alice), 2);
    }

    function test_Mint_TimingBoundary_AtKickoffReverts() public {
        uint256 id = _list();
        uint64 kickoff = bif.matchInfo(id).kickoff;
        vm.warp(kickoff - 1);
        _mint(alice, id, KANE); // last second ok
        vm.warp(kickoff);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.MintClosed.selector, id));
        bif.mint(id, KANE, _proof(KANE));
        vm.warp(kickoff + 1 hours);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.MintClosed.selector, id));
        bif.mint(id, KANE, _proof(KANE));
    }

    function test_Mint_UnknownPlayerReverts() public {
        uint256 id = _list();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.UnknownPlayer.selector, id, uint32(99)));
        bif.mint(id, 99, _proof(99));
    }

    function test_Mint_NotListedReverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.NotListed.selector, 0));
        bif.mint(0, KANE, _proof(KANE));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.NotListed.selector, 5));
        bif.mint(5, KANE, _proof(KANE));
        uint256 id = _list();
        vm.prank(settler);
        bif.voidMatch(id);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.NotListed.selector, id));
        bif.mint(id, KANE, _proof(KANE));
    }

    function test_Mint_PausedReverts_AndPauseIsOwnerOnly() public {
        uint256 id = _list();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        bif.setMintPaused(true);
        bif.setMintPaused(true);
        assertTrue(bif.mintPaused());
        vm.prank(alice);
        vm.expectRevert(IBallIsFlat.MintPaused.selector);
        bif.mint(id, KANE, _proof(KANE));
        bif.setMintPaused(false);
        _mint(alice, id, KANE);
    }

    function test_Mint_PauseNeverBlocksClaim() public {
        uint256 id = _list();
        uint256 t = _mint(alice, id, KANE);
        _settle(id, _one(KANE));
        bif.setMintPaused(true);
        vm.prank(alice);
        assertGt(bif.claim(t), 0);
    }

    function test_Mint_WithoutAllowanceReverts() public {
        uint256 id = _list();
        address poor = makeAddr("poor");
        wif.mint(poor, PRICE);
        vm.prank(poor);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(bif), 0, PRICE)
        );
        bif.mint(id, KANE, _proof(KANE));
    }

    function test_Mint_ToNonReceiverContractReverts() public {
        uint256 id = _list();
        NoReceiver nr = new NoReceiver();
        wif.mint(address(nr), PRICE);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721InvalidReceiver.selector, address(nr)));
        nr.mint(bif, address(wif), id, KANE, _proof(KANE));
    }

    // ------------------------------------------------------------------ propose / correct

    function test_Propose_BeforeKickoffReverts_AtKickoffOk() public {
        uint256 id = _list();
        uint64 kickoff = bif.matchInfo(id).kickoff;
        vm.warp(kickoff - 1);
        vm.prank(settler);
        vm.expectRevert(IBallIsFlat.TooEarly.selector);
        bif.propose(id, _one(KANE), _proofs(_one(KANE)), "u");
        vm.warp(kickoff);
        vm.expectEmit(true, false, false, true);
        emit IBallIsFlat.ResultProposed(id, _one(KANE), "u");
        vm.prank(settler);
        bif.propose(id, _one(KANE), _proofs(_one(KANE)), "u");
        IBallIsFlat.MatchInfo memory m = bif.matchInfo(id);
        assertEq(uint8(m.status), uint8(IBallIsFlat.Status.Proposed));
        assertEq(m.proposedAt, kickoff);
        assertEq(m.sourceUrl, "u");
        assertEq(bif.winnersOf(id)[0], KANE);
    }

    function test_Propose_AccessControl_NonSettlerReverts() public {
        uint256 id = _list();
        vm.warp(bif.matchInfo(id).kickoff);
        vm.prank(stranger);
        vm.expectRevert(IBallIsFlat.NotSettler.selector);
        bif.propose(id, _one(KANE), _proofs(_one(KANE)), "u");
        vm.expectRevert(IBallIsFlat.NotSettler.selector); // owner is not the settler
        bif.propose(id, _one(KANE), _proofs(_one(KANE)), "u");
    }

    function test_Propose_InvalidWinners() public {
        uint256 id = _list();
        vm.warp(bif.matchInfo(id).kickoff);
        vm.startPrank(settler);
        vm.expectRevert(BallIsFlat.InvalidWinners.selector);
        bif.propose(id, new uint32[](0), _proofs(new uint32[](0)), "u");
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.UnknownPlayer.selector, id, uint32(42)));
        bif.propose(id, _two(KANE, 42), _proofs(_two(KANE, 42)), "u");
        vm.expectRevert(BallIsFlat.InvalidWinners.selector);
        bif.propose(id, _two(KANE, KANE), _proofs(_two(KANE, KANE)), "u"); // duplicate would double count winningCards
        vm.stopPrank();
    }

    function test_Propose_WrongStatus() public {
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.WrongStatus.selector, 3, IBallIsFlat.Status.None));
        bif.propose(3, _one(KANE), _proofs(_one(KANE)), "u");
        uint256 id = _list();
        _propose(id, _one(KANE));
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.WrongStatus.selector, id, IBallIsFlat.Status.Proposed));
        bif.propose(id, _one(KANE), _proofs(_one(KANE)), "u");
    }

    function test_Correct_InsideWindow() public {
        uint256 id = _list();
        uint256 tk = _mint(alice, id, KANE);
        uint256 tm = _mint(bob, id, MODRIC);
        _propose(id, _one(KANE));
        uint64 proposedAt = bif.matchInfo(id).proposedAt;
        vm.warp(proposedAt + WINDOW - 1); // last second of the window
        vm.expectEmit(true, false, false, true);
        emit IBallIsFlat.ResultCorrected(id, _one(MODRIC), "fixed");
        vm.prank(settler);
        bif.correct(id, _one(MODRIC), _proofs(_one(MODRIC)), "fixed");
        IBallIsFlat.MatchInfo memory m = bif.matchInfo(id);
        assertEq(m.proposedAt, proposedAt, "correct restarts nothing");
        assertEq(m.sourceUrl, "fixed");
        assertEq(bif.winnersOf(id).length, 1);
        assertEq(bif.winnersOf(id)[0], MODRIC);

        vm.warp(proposedAt + WINDOW);
        bif.finalize(id);
        assertEq(bif.claimable(tk), 0, "old winner no longer wins");
        assertGt(bif.claimable(tm), 0);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.NotAWinner.selector, tk));
        bif.claim(tk);
    }

    function test_Correct_OutsideWindowReverts() public {
        uint256 id = _list();
        _propose(id, _one(KANE));
        vm.warp(bif.matchInfo(id).proposedAt + WINDOW);
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.WindowClosed.selector, id));
        bif.correct(id, _one(MODRIC), _proofs(_one(MODRIC)), "late");
    }

    function test_Correct_AccessControlAndStatus() public {
        uint256 id = _list();
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.WrongStatus.selector, id, IBallIsFlat.Status.Listed));
        bif.correct(id, _one(KANE), _proofs(_one(KANE)), "u");
        _propose(id, _one(KANE));
        vm.prank(stranger);
        vm.expectRevert(IBallIsFlat.NotSettler.selector);
        bif.correct(id, _one(MODRIC), _proofs(_one(MODRIC)), "u");
    }

    // ------------------------------------------------------------------ finalize

    function test_Finalize_TooEarlyReverts_BoundaryOk() public {
        uint256 id = _list();
        _mint(alice, id, KANE);
        _propose(id, _one(KANE));
        uint64 proposedAt = bif.matchInfo(id).proposedAt;
        vm.warp(proposedAt + WINDOW - 1);
        vm.expectRevert(IBallIsFlat.TooEarly.selector);
        bif.finalize(id);
        vm.warp(proposedAt + WINDOW);
        vm.prank(stranger); // anyone
        bif.finalize(id);
        assertEq(uint8(bif.matchInfo(id).status), uint8(IBallIsFlat.Status.Finalized));
    }

    function test_Finalize_WrongStatus() public {
        uint256 id = _list();
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.WrongStatus.selector, id, IBallIsFlat.Status.Listed));
        bif.finalize(id);
        _settle(id, _one(KANE));
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.WrongStatus.selector, id, IBallIsFlat.Status.Finalized));
        bif.finalize(id);
    }

    function test_Finalize_Math_BurnAndPayPoolExact() public {
        uint256 id = _list();
        _mint(alice, id, KANE);
        _mint(bob, id, KANE);
        _mint(carol, id, MODRIC);
        uint256 pot = 3 * PRICE;
        uint256 burned = pot * BURN / 10_000; // 300e18
        _propose(id, _one(KANE));
        vm.warp(block.timestamp + WINDOW);
        vm.expectEmit(true, false, false, true);
        emit IBallIsFlat.MatchFinalized(id, 2, burned, pot - burned, 0);
        bif.finalize(id);
        IBallIsFlat.MatchInfo memory m = bif.matchInfo(id);
        assertEq(m.burned, 300e18);
        assertEq(m.payPool, 2700e18);
        assertEq(m.winningCards, 2);
        assertEq(wif.balanceOf(DEAD), 300e18);
        assertEq(wif.balanceOf(address(bif)), 2700e18);
    }

    // ------------------------------------------------------------------ claim

    function test_Claim_PaysFloorAndBurnsCard() public {
        uint256 id = bif.listMatch(uint64(block.timestamp) + KICK, 1e18 + 1, 0, _players(), 0);
        uint256 a = _mint(alice, id, KANE);
        uint256 b = _mint(bob, id, KANE);
        uint256 c = _mint(carol, id, KANE);
        _mint(dave, id, SAKA);
        _settle(id, _one(KANE));
        IBallIsFlat.MatchInfo memory m = bif.matchInfo(id);
        uint256 share = m.payPool / 3;
        assertTrue(m.payPool % 3 != 0, "test wants a remainder");

        uint256 before = wif.balanceOf(alice);
        vm.expectEmit(true, true, false, true);
        emit IBallIsFlat.CardClaimed(a, id, alice, share);
        vm.prank(alice);
        assertEq(bif.claim(a), share);
        assertEq(wif.balanceOf(alice), before + share);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, a));
        bif.ownerOf(a);

        vm.prank(bob);
        bif.claim(b);
        vm.prank(carol);
        bif.claim(c);
        uint256 dust = m.payPool - 3 * share;
        assertEq(wif.balanceOf(address(bif)), dust, "only rounding dust remains");
        assertLt(dust, 3);
        assertEq(bif.totalSupply(), 1, "losing card stays as a record");
    }

    function test_Claim_DoubleClaimReverts() public {
        uint256 id = _list();
        uint256 t = _mint(alice, id, KANE);
        _settle(id, _one(KANE));
        vm.prank(alice);
        bif.claim(t);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.NotCardOwner.selector, t));
        bif.claim(t);
    }

    function test_Claim_NonWinnerReverts() public {
        uint256 id = _list();
        _mint(alice, id, KANE);
        uint256 loser = _mint(bob, id, MODRIC);
        _settle(id, _one(KANE));
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.NotAWinner.selector, loser));
        bif.claim(loser);
    }

    function test_Claim_BeforeFinalizeReverts() public {
        uint256 id = _list();
        uint256 t = _mint(alice, id, KANE);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.WrongStatus.selector, id, IBallIsFlat.Status.Listed));
        bif.claim(t);
        _propose(id, _one(KANE));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.WrongStatus.selector, id, IBallIsFlat.Status.Proposed));
        bif.claim(t);
    }

    function test_Claim_AccessControl_StrangerReverts() public {
        uint256 id = _list();
        uint256 t = _mint(alice, id, KANE);
        _settle(id, _one(KANE));
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.NotCardOwner.selector, t));
        bif.claim(t);
        // an approved operator is still not the owner
        vm.prank(alice);
        bif.approve(stranger, t);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.NotCardOwner.selector, t));
        bif.claim(t);
    }

    function test_Claim_TransferThenNewOwnerClaims() public {
        uint256 id = _list();
        uint256 t = _mint(alice, id, KANE);
        _settle(id, _one(KANE));
        vm.prank(alice);
        bif.safeTransferFrom(alice, bob, t);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.NotCardOwner.selector, t));
        bif.claim(t);
        uint256 before = wif.balanceOf(bob);
        vm.prank(bob);
        uint256 amt = bif.claim(t);
        assertEq(amt, bif.matchInfo(id).payPool);
        assertEq(wif.balanceOf(bob), before + amt);
    }

    function test_Claim_TieSplitsAcrossTwoPlayers() public {
        uint256 id = _list();
        uint256 a = _mint(alice, id, KANE);
        uint256 b = _mint(bob, id, MODRIC);
        uint256 c = _mint(carol, id, MODRIC);
        uint256 d = _mint(dave, id, SAKA);
        _settle(id, _two(KANE, MODRIC));
        IBallIsFlat.MatchInfo memory m = bif.matchInfo(id);
        assertEq(m.winningCards, 3);
        uint256 share = m.payPool / 3;
        assertEq(share, 1200e18); // 4000 pot, 400 burned, 3600 / 3
        vm.prank(alice);
        assertEq(bif.claim(a), share);
        vm.prank(bob);
        assertEq(bif.claim(b), share);
        vm.prank(carol);
        assertEq(bif.claim(c), share);
        vm.prank(dave);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.NotAWinner.selector, d));
        bif.claim(d);
        assertEq(wif.balanceOf(address(bif)), 0);
    }

    // ------------------------------------------------------------------ rollover

    function test_Rollover_ToNextMatch() public {
        uint256 next = _list();
        uint256 id = _list(next);
        _mint(alice, id, KANE);
        _mint(bob, id, MODRIC);
        // next match gets one card that will win
        uint256 nt = _mint(carol, next, SAKA);

        _propose(id, _one(SAKA)); // nobody picked Saka in `id`
        vm.warp(block.timestamp + WINDOW);
        vm.expectEmit(true, false, false, true);
        emit IBallIsFlat.MatchFinalized(id, 0, 200e18, 1800e18, next);
        bif.finalize(id);
        assertEq(uint8(bif.stateOf(id)), uint8(IBallIsFlat.State.RolledOver));

        IBallIsFlat.MatchInfo memory n = bif.matchInfo(next);
        assertEq(n.rolledIn, 1800e18);
        assertEq(n.pot, PRICE + 1800e18);

        _settle(next, _one(SAKA));
        uint256 expected = (PRICE + 1800e18) * 9000 / 10_000; // 2520e18
        assertEq(bif.claimable(nt), expected);
        vm.prank(carol);
        assertEq(bif.claim(nt), expected);
        assertEq(wif.balanceOf(address(bif)), 0);
        assertEq(wif.balanceOf(DEAD), 200e18 + 280e18);
    }

    function test_Rollover_IntoProposedNextMatchCounts() public {
        uint256 next = _list();
        uint256 id = _list(next);
        _mint(alice, id, KANE);
        uint256 nt = _mint(carol, next, SAKA);
        _propose(next, _one(SAKA));
        _propose(id, _one(MODRIC));
        vm.warp(block.timestamp + WINDOW);
        bif.finalize(id); // rolls into a Proposed match
        assertEq(bif.matchInfo(next).rolledIn, 900e18);
        bif.finalize(next);
        assertEq(bif.claimable(nt), (PRICE + 900e18) * 9 / 10);
    }

    function test_Rollover_ToTreasuryWhenNextFinalized() public {
        uint256 next = _list();
        uint256 id = _list(next);
        _mint(alice, id, KANE);
        _settle(next, _one(KANE)); // next is finalized first
        uint256 before = wif.balanceOf(owner);
        _settle(id, _one(MODRIC));
        assertEq(wif.balanceOf(owner), before + 900e18);
        assertEq(bif.matchInfo(next).rolledIn, 0);
        assertEq(wif.balanceOf(address(bif)), 0);
    }

    function test_Rollover_ToTreasuryWhenNextVoided() public {
        uint256 next = _list();
        uint256 id = _list(next);
        _mint(alice, id, KANE);
        vm.prank(settler);
        bif.voidMatch(next);
        uint256 before = wif.balanceOf(owner);
        _settle(id, _one(MODRIC));
        assertEq(wif.balanceOf(owner), before + 900e18);
    }

    function test_Rollover_ToTreasuryWhenNoNextMatch() public {
        uint256 id = _list();
        _mint(alice, id, KANE);
        uint256 before = wif.balanceOf(owner);
        _settle(id, _one(MODRIC));
        assertEq(wif.balanceOf(owner), before + 900e18);
        assertEq(wif.balanceOf(DEAD), 100e18);
    }

    function test_Rollover_TreasuryIsDeadAfterRenounce() public {
        uint256 id = _list();
        _mint(alice, id, KANE);
        bif.renounceOwnership();
        _settle(id, _one(MODRIC));
        assertEq(wif.balanceOf(DEAD), PRICE);
    }

    function test_Finalize_EmptyMatchNoTransfers() public {
        uint256 id = _list();
        _settle(id, _one(KANE));
        IBallIsFlat.MatchInfo memory m = bif.matchInfo(id);
        assertEq(m.pot, 0);
        assertEq(m.payPool, 0);
        assertEq(uint8(bif.stateOf(id)), uint8(IBallIsFlat.State.RolledOver));
    }

    // ------------------------------------------------------------------ void / refund

    function test_Void_RefundsPrice() public {
        uint256 id = _list();
        uint256 a = _mint(alice, id, KANE);
        uint256 b = _mint(bob, id, MODRIC);
        vm.expectEmit(true, false, false, true);
        emit IBallIsFlat.MatchVoided(id);
        vm.prank(settler);
        bif.voidMatch(id);
        assertEq(uint8(bif.stateOf(id)), uint8(IBallIsFlat.State.Void));

        uint256 before = wif.balanceOf(alice);
        vm.expectEmit(true, true, false, true);
        emit IBallIsFlat.CardRefunded(a, id, alice, PRICE);
        vm.prank(alice);
        assertEq(bif.refund(a), PRICE);
        assertEq(wif.balanceOf(alice), before + PRICE);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.NotCardOwner.selector, a));
        bif.refund(a);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.NotCardOwner.selector, b));
        bif.refund(b);
        vm.prank(bob);
        bif.refund(b);
        assertEq(wif.balanceOf(address(bif)), 0);
    }

    function test_Void_FromProposedByOwner() public {
        uint256 id = _list();
        uint256 a = _mint(alice, id, KANE);
        _propose(id, _one(KANE));
        bif.voidMatch(id); // owner
        vm.prank(alice);
        assertEq(bif.refund(a), PRICE);
    }

    function test_Void_AccessControlAndStatus() public {
        uint256 id = _list();
        vm.prank(stranger);
        vm.expectRevert(IBallIsFlat.NotSettler.selector);
        bif.voidMatch(id);
        _settle(id, _one(KANE));
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.WrongStatus.selector, id, IBallIsFlat.Status.Finalized));
        bif.voidMatch(id);
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.WrongStatus.selector, 9, IBallIsFlat.Status.None));
        bif.voidMatch(9);
    }

    function test_Refund_NonVoidedReverts() public {
        uint256 id = _list();
        uint256 a = _mint(alice, id, KANE);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.WrongStatus.selector, id, IBallIsFlat.Status.Listed));
        bif.refund(a);
    }

    function test_Void_MovesRolledInToNextMatch() public {
        uint256 third = _list();
        uint256 second = _list(third);
        uint256 first = _list(second);
        _mint(alice, first, KANE);
        uint256 s = _mint(bob, second, KANE);
        _settle(first, _one(MODRIC)); // 900 rolls into second
        assertEq(bif.matchInfo(second).rolledIn, 900e18);

        vm.prank(settler);
        bif.voidMatch(second);
        assertEq(bif.matchInfo(third).rolledIn, 900e18);
        assertEq(bif.matchInfo(third).pot, 900e18);
        vm.prank(bob);
        assertEq(bif.refund(s), PRICE, "refund is the price, never a rolled-in share");
        // contract still holds the 900 for `third`
        assertEq(wif.balanceOf(address(bif)), 900e18);
    }

    function test_Void_MovesRolledInToTreasuryWhenNextDone() public {
        uint256 third = _list();
        uint256 second = _list(third);
        uint256 first = _list(second);
        _mint(alice, first, KANE);
        _settle(first, _one(MODRIC));
        _settle(third, _one(KANE)); // third done, second can no longer forward
        uint256 before = wif.balanceOf(owner);
        vm.prank(settler);
        bif.voidMatch(second);
        assertEq(wif.balanceOf(owner), before + 900e18);
        assertEq(wif.balanceOf(address(bif)), 0);
    }

    // ------------------------------------------------------------------ stateOf / claimable

    function test_StateOf_EachStage() public {
        assertEq(uint8(bif.stateOf(1)), uint8(IBallIsFlat.State.None));
        uint256 id = _list();
        _mint(alice, id, KANE);
        assertEq(uint8(bif.stateOf(id)), uint8(IBallIsFlat.State.Open));
        vm.warp(bif.matchInfo(id).kickoff);
        assertEq(uint8(bif.stateOf(id)), uint8(IBallIsFlat.State.Locked));
        _propose(id, _one(KANE));
        assertEq(uint8(bif.stateOf(id)), uint8(IBallIsFlat.State.Proposed));
        vm.warp(block.timestamp + WINDOW);
        bif.finalize(id);
        assertEq(uint8(bif.stateOf(id)), uint8(IBallIsFlat.State.Final));

        uint256 v = _list();
        vm.prank(settler);
        bif.voidMatch(v);
        assertEq(uint8(bif.stateOf(v)), uint8(IBallIsFlat.State.Void));
    }

    function test_Claimable_View() public {
        uint256 id = _list();
        uint256 a = _mint(alice, id, KANE);
        uint256 l = _mint(bob, id, MODRIC);
        assertEq(bif.claimable(a), 0, "listed");
        _propose(id, _one(KANE));
        assertEq(bif.claimable(a), 0, "proposed");
        vm.warp(block.timestamp + WINDOW);
        bif.finalize(id);
        assertEq(bif.claimable(a), 1800e18);
        assertEq(bif.claimable(l), 0, "loser");
        assertEq(bif.claimable(999), 0, "nonexistent");
        vm.prank(alice);
        bif.claim(a);
        assertEq(bif.claimable(a), 0, "after claim");
    }

    // ------------------------------------------------------------------ settler admin

    function test_SetSettler_OwnerOnlyAndNonZero() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        bif.setSettler(stranger);
        vm.expectRevert(BallIsFlat.ZeroAddress.selector);
        bif.setSettler(address(0));
        bif.setSettler(bob);
        assertEq(bif.settler(), bob);
        uint256 id = _list();
        vm.warp(bif.matchInfo(id).kickoff);
        vm.prank(settler);
        vm.expectRevert(IBallIsFlat.NotSettler.selector);
        bif.propose(id, _one(KANE), _proofs(_one(KANE)), "u");
        vm.prank(bob);
        bif.propose(id, _one(KANE), _proofs(_one(KANE)), "u");
    }

    // ------------------------------------------------------------------ reentrancy

    function _hookSetup() internal returns (BallIsFlat h, HookToken tok, Reenterer r) {
        tok = new HookToken();
        h = new BallIsFlat(address(tok), settler, BURN, WINDOW, SALE_BURN);
        r = new Reenterer(IBallIsFlat(address(h)));
        tok.mint(address(r), 10 * PRICE);
        r.approve(address(tok), type(uint256).max);
    }

    function test_Reentrancy_ClaimViaTokenHook() public {
        (BallIsFlat h, HookToken tok, Reenterer r) = _hookSetup();
        uint256 id = h.listMatch(uint64(block.timestamp) + KICK, PRICE, 0, _players(), 0);
        uint256 t = r.doMint(id, KANE, _proof(KANE));
        vm.warp(block.timestamp + KICK);
        vm.prank(settler);
        h.propose(id, _one(KANE), _proofs(_one(KANE)), "u");
        vm.warp(block.timestamp + WINDOW);
        h.finalize(id);

        tok.setHooked(address(r), true);
        r.arm(Reenterer.Mode.Claim, t, 0);
        uint256 amt = r.doClaim(t);
        assertTrue(r.attempted());
        assertEq(bytes4(r.lastError()), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(amt, 900e18);
        assertEq(tok.balanceOf(address(h)), 0, "paid once");
    }

    function test_Reentrancy_RefundViaTokenHook() public {
        (BallIsFlat h, HookToken tok, Reenterer r) = _hookSetup();
        uint256 id = h.listMatch(uint64(block.timestamp) + KICK, PRICE, 0, _players(), 0);
        uint256 t = r.doMint(id, KANE, _proof(KANE));
        // a second honest card so a double refund would have funds to steal
        tok.mint(alice, PRICE);
        vm.prank(alice);
        tok.approve(address(h), PRICE);
        vm.prank(alice);
        h.mint(id, KANE, _proof(KANE));
        vm.prank(settler);
        h.voidMatch(id);

        tok.setHooked(address(r), true);
        r.arm(Reenterer.Mode.Refund, t, 0);
        r.doRefund(t);
        assertEq(bytes4(r.lastError()), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(tok.balanceOf(address(h)), PRICE, "alice's refund untouched");
    }

    function test_Reentrancy_MintViaERC721Receiver() public {
        uint256 id = _list();
        Reenterer r = new Reenterer(IBallIsFlat(address(bif)));
        wif.mint(address(r), 10 * PRICE);
        r.approve(address(wif), type(uint256).max);
        r.arm(Reenterer.Mode.Mint, id, MODRIC);
        r.doMint(id, KANE, _proof(KANE));
        assertTrue(r.attempted());
        assertEq(bytes4(r.lastError()), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(bif.balanceOf(address(r)), 1);
        assertEq(bif.matchInfo(id).cards, 1);
    }

    function test_Reentrancy_FinalizeDuringClaim() public {
        (BallIsFlat h, HookToken tok, Reenterer r) = _hookSetup();
        uint256 a = h.listMatch(uint64(block.timestamp) + KICK, PRICE, 0, _players(), 0);
        uint256 t = r.doMint(a, KANE, _proof(KANE));
        vm.warp(block.timestamp + KICK);
        vm.prank(settler);
        h.propose(a, _one(KANE), _proofs(_one(KANE)), "u");
        vm.warp(block.timestamp + WINDOW);
        h.finalize(a);
        tok.setHooked(address(r), true);
        r.arm(Reenterer.Mode.Finalize, a, 0);
        r.doClaim(t);
        assertEq(bytes4(r.lastError()), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
    }

    // ------------------------------------------------------------------ fuzz: conservation & rounding

    /// sum(claims) + burned + dust == pot, dust < winningCards, losers get nothing.
    function testFuzz_PayoutConservation(uint8 nCards, uint256 price, uint16 burnBps_, uint256 seed) public {
        nCards = uint8(bound(nCards, 1, 40));
        price = bound(price, 1, 1e30);
        burnBps_ = uint16(bound(burnBps_, 0, 10_000));
        BallIsFlat h = new BallIsFlat(address(wif), settler, burnBps_, WINDOW, SALE_BURN);
        uint256 id = h.listMatch(uint64(block.timestamp) + KICK, price, 0, _players(), 0);

        uint256[] memory tokens = new uint256[](nCards);
        address[] memory holders = new address[](nCards);
        uint32[3] memory ps = [KANE, MODRIC, SAKA];
        for (uint256 i; i < nCards; ++i) {
            holders[i] = address(uint160(0x10000 + i));
            wif.mint(holders[i], price);
            vm.startPrank(holders[i]);
            wif.approve(address(h), price);
            uint32 pick = ps[uint256(keccak256(abi.encode(seed, i))) % 3];
            tokens[i] = h.mint(id, pick, _proof(pick));
            vm.stopPrank();
        }
        // winners: KANE, or KANE+MODRIC tie, by seed
        uint32[] memory winners = seed % 2 == 0 ? _one(KANE) : _two(KANE, MODRIC);
        vm.warp(block.timestamp + KICK);
        vm.prank(settler);
        h.propose(id, winners, _proofs(winners), "u");
        vm.warp(block.timestamp + WINDOW);
        uint256 treasuryBefore = wif.balanceOf(owner);
        uint256 deadBefore = wif.balanceOf(DEAD);
        h.finalize(id);

        IBallIsFlat.MatchInfo memory m = h.matchInfo(id);
        uint256 pot = price * nCards;
        assertEq(m.pot, pot);
        assertEq(m.burned + m.payPool, pot);
        assertEq(wif.balanceOf(DEAD) - deadBefore, m.burned);

        uint256 claimed;
        for (uint256 i; i < nCards; ++i) {
            uint32 p = h.cardInfo(tokens[i]).playerId;
            bool wins = p == KANE || (winners.length == 2 && p == MODRIC);
            uint256 c = h.claimable(tokens[i]);
            if (!wins) {
                assertEq(c, 0);
                continue;
            }
            vm.prank(holders[i]);
            uint256 got = h.claim(tokens[i]);
            assertEq(got, c);
            claimed += got;
        }

        uint256 dust = wif.balanceOf(address(h));
        if (m.winningCards == 0) {
            assertEq(claimed, 0);
            assertEq(dust, 0);
            assertEq(wif.balanceOf(owner) - treasuryBefore, m.payPool, "uncalled pot to treasury");
        } else {
            assertEq(claimed + m.burned + dust, pot, "conservation");
            assertLt(dust, m.winningCards, "dust below one wei per winning card");
        }
    }

    /// Refunds always return exactly what was paid, for any price.
    function testFuzz_VoidRefundsExact(uint8 nCards, uint256 price) public {
        nCards = uint8(bound(nCards, 1, 30));
        price = bound(price, 1, 1e30);
        uint256 id = bif.listMatch(uint64(block.timestamp) + KICK, price, 0, _players(), 0);
        uint256[] memory tokens = new uint256[](nCards);
        for (uint256 i; i < nCards; ++i) {
            address u = address(uint160(0x20000 + i));
            wif.mint(u, price);
            vm.startPrank(u);
            wif.approve(address(bif), price);
            tokens[i] = bif.mint(id, KANE, _proof(KANE));
            vm.stopPrank();
        }
        vm.prank(settler);
        bif.voidMatch(id);
        for (uint256 i; i < nCards; ++i) {
            address u = address(uint160(0x20000 + i));
            vm.prank(u);
            assertEq(bif.refund(tokens[i]), price);
            assertEq(wif.balanceOf(u), price);
        }
        assertEq(wif.balanceOf(address(bif)), 0);
    }

    // ------------------------------------------------------------------ squads (merkle root)

    function _ascending(uint256 n, uint256 seed) internal pure returns (uint32[] memory ids) {
        ids = new uint32[](n);
        uint32 next = uint32(seed % 1000);
        for (uint256 i; i < n; ++i) {
            next += uint32(1 + (uint256(keccak256(abi.encode(seed, i))) % 50));
            ids[i] = next;
        }
    }

    function testFuzz_Squad_EveryPlayerProvesAndOutsiderFails(uint256 n, uint256 seed) public {
        n = bound(n, 1, 60);
        uint32[] memory ids = _ascending(n, seed);
        uint256 id = bif.listMatch(uint64(block.timestamp) + KICK, PRICE, 0, ids, 0);
        assertEq(bif.matchInfo(id).playersRoot, Squad.root(ids));
        for (uint256 i; i < n; ++i) {
            assertTrue(bif.inSquad(id, ids[i], Squad.proof(ids, ids[i])));
        }
        uint32 outsider = ids[n - 1] + 1;
        assertFalse(bif.inSquad(id, outsider, Squad.proof(ids, ids[0])));
        assertFalse(bif.inSquad(id, outsider, new bytes32[](0)));
    }

    function test_Squad_ListingCostIsFlatInSquadSize() public {
        uint64 kickoff = uint64(block.timestamp) + KICK;
        uint256 before = gasleft();
        bif.listMatch(kickoff, PRICE, 0, _ascending(20, 1), 0);
        uint256 twenty = before - gasleft();
        before = gasleft();
        bif.listMatch(kickoff, PRICE, 0, _ascending(60, 2), 0);
        uint256 sixty = before - gasleft();
        // only hashing and calldata grow with the squad; storage is one root per match
        assertLt(sixty, 400_000);
        assertLt(sixty - twenty, 120_000);
    }

    function test_Mint_ProofOfAnotherPlayerReverts() public {
        uint256 id = _list();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.UnknownPlayer.selector, id, KANE));
        bif.mint(id, KANE, _proof(MODRIC));
    }

    function test_Propose_ProofsMustMatchWinners() public {
        uint256 id = _list();
        _mint(alice, id, KANE);
        vm.warp(block.timestamp + KICK);
        vm.startPrank(settler);
        vm.expectRevert(BallIsFlat.InvalidWinners.selector);
        bif.propose(id, _one(KANE), new bytes32[][](0), "u");
        bytes32[][] memory wrong = new bytes32[][](1);
        wrong[0] = _proof(SAKA);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.UnknownPlayer.selector, id, KANE));
        bif.propose(id, _one(KANE), wrong, "u");
        bif.propose(id, _one(KANE), _proofs(_one(KANE)), "u");
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ listMatches

    function test_ListMatches_ListsInOrderAndChainsRollover() public {
        IBallIsFlat.MatchListing[] memory batch = new IBallIsFlat.MatchListing[](3);
        uint64 kickoff = uint64(block.timestamp) + KICK;
        for (uint256 i; i < 3; ++i) {
            batch[i] = IBallIsFlat.MatchListing({
                kickoff: kickoff + uint64(i),
                price: PRICE,
                nextMatch: i, // 0 for the first, then the one listed just before it
                maxPerPlayer: 10,
                playerIds: _players()
            });
        }
        assertEq(bif.listMatches(batch), 1);
        assertEq(bif.matchCount(), 3);
        assertEq(bif.matchInfo(3).nextMatch, 2);
        assertEq(bif.matchInfo(2).kickoff, kickoff + 1);
        assertEq(bif.matchInfo(1).maxPerPlayer, 10);
    }

    function test_ListMatches_EmptyAndAccessControl() public {
        vm.expectRevert(BallIsFlat.InvalidListing.selector);
        bif.listMatches(new IBallIsFlat.MatchListing[](0));
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        bif.listMatches(new IBallIsFlat.MatchListing[](0));
    }

    // ------------------------------------------------------------------ setPlayers

    function test_SetPlayers_LateCallUpMintsAndDroppedPlayerKeepsCards() public {
        uint256 id = _list();
        _mint(alice, id, SAKA);
        uint32[] memory squad = new uint32[](3);
        squad[0] = KANE;
        squad[1] = MODRIC;
        squad[2] = 11; // late call-up, SAKA dropped
        vm.expectEmit(true, false, false, true);
        emit IBallIsFlat.PlayersUpdated(id, Squad.root(squad), squad);
        bif.setPlayers(id, squad);

        vm.prank(bob);
        bif.mint(id, 11, Squad.proof(squad, 11));
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.UnknownPlayer.selector, id, SAKA));
        bif.mint(id, SAKA, _proof(SAKA));
        assertEq(bif.cardsOn(id, SAKA), 1);
        assertEq(bif.matchInfo(id).pot, 2 * PRICE);
    }

    function test_SetPlayers_OwnerOnlyAndBeforeKickoff() public {
        uint256 id = _list();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        bif.setPlayers(id, _players());
        vm.warp(block.timestamp + KICK);
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.TradingClosed.selector, id));
        bif.setPlayers(id, _players());
        vm.expectRevert(abi.encodeWithSelector(IBallIsFlat.TradingClosed.selector, 77));
        bif.setPlayers(77, _players());
    }

    // ------------------------------------------------------------------ metadata

    function test_TokenURI_EmptyUntilSetThenBasePlusId() public {
        uint256 id = _list();
        uint256 t = _mint(alice, id, KANE);
        assertEq(bif.tokenURI(t), "");
        assertEq(bif.contractURI(), "");
        vm.expectEmit(false, false, false, false);
        emit BallIsFlat.ContractURIUpdated();
        vm.expectEmit(false, false, false, true);
        emit IERC4906.BatchMetadataUpdate(1, t);
        bif.setMetadataURIs("https://api.example/cards/", "https://api.example/collection");
        assertEq(bif.tokenURI(t), string.concat("https://api.example/cards/", vm.toString(t)));
        assertEq(bif.contractURI(), "https://api.example/collection");
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 999));
        bif.tokenURI(999);
    }

    function test_SetMetadataURIs_OwnerOnly() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        bif.setMetadataURIs("a", "b");
    }

    function test_Metadata_OpenAndSettleEmitRefresh() public {
        uint256 id = _list();
        uint256 t = _mint(alice, id, KANE);
        vm.prank(alice);
        vm.expectEmit(false, false, false, true);
        emit IERC4906.MetadataUpdate(t);
        bif.open(t);
        _propose(id, _one(KANE));
        vm.warp(block.timestamp + WINDOW);
        vm.expectEmit(false, false, false, true);
        emit IERC4906.BatchMetadataUpdate(1, t);
        bif.finalize(id);
    }

    function test_SupportsInterface_ERC721AndERC4906() public view {
        assertTrue(bif.supportsInterface(0x80ac58cd)); // ERC-721
        assertTrue(bif.supportsInterface(0x780e9d63)); // ERC-721 Enumerable
        assertTrue(bif.supportsInterface(0x49064906)); // ERC-4906
        assertFalse(bif.supportsInterface(0xffffffff));
    }
}

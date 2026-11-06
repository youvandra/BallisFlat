// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IBallIsFlat} from "../../src/IBallIsFlat.sol";

/// Plain 18-decimal stand-in for $WIF.
contract MockWIF is ERC20 {
    constructor() ERC20("dogwifhat", "WIF") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

interface ITokenHook {
    function onTokenReceived() external;
}

/// ERC-20 that calls back into the recipient on every transfer (ERC-777 style), to model a
/// malicious or hook-bearing token.
contract HookToken is ERC20 {
    mapping(address => bool) public hooked;

    constructor() ERC20("Hook", "HOOK") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setHooked(address who, bool on) external {
        hooked[who] = on;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (hooked[to]) ITokenHook(to).onTokenReceived();
    }
}

/// Card holder that tries to re-enter BallIsFlat from token and NFT callbacks and records what
/// the nested call reverted with.
contract Reenterer is ITokenHook, IERC721Receiver {
    enum Mode {
        None,
        Claim,
        Refund,
        Mint,
        Finalize,
        Buy,
        Open
    }

    IBallIsFlat public bif;
    Mode public mode;
    uint256 public arg;
    uint32 public argPlayer;
    bytes public lastError;
    bool public attempted;

    constructor(IBallIsFlat bif_) {
        bif = bif_;
    }

    function approve(address token, uint256 amount) external {
        IERC20(token).approve(address(bif), amount);
    }

    function arm(Mode m, uint256 a, uint32 p) external {
        mode = m;
        arg = a;
        argPlayer = p;
        attempted = false;
        delete lastError;
    }

    function doMint(uint256 matchId, uint32 playerId, bytes32[] calldata proof) external returns (uint256) {
        return bif.mint(matchId, playerId, proof);
    }

    function doClaim(uint256 tokenId) external returns (uint256) {
        return bif.claim(tokenId);
    }

    function doRefund(uint256 tokenId) external returns (uint256) {
        return bif.refund(tokenId);
    }

    function doList(uint256 tokenId, uint256 price) external {
        bif.listForSale(tokenId, price);
    }

    function doBuy(uint256 tokenId, uint256 maxPrice) external {
        bif.buy(tokenId, maxPrice);
    }

    function onTokenReceived() external {
        _attack();
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        _attack();
        return IERC721Receiver.onERC721Received.selector;
    }

    function _attack() internal {
        if (mode == Mode.None || attempted) return;
        attempted = true;
        bytes memory data;
        if (mode == Mode.Claim) data = abi.encodeCall(IBallIsFlat.claim, (arg));
        else if (mode == Mode.Refund) data = abi.encodeCall(IBallIsFlat.refund, (arg));
        else if (mode == Mode.Mint) data = abi.encodeCall(IBallIsFlat.mint, (arg, argPlayer, new bytes32[](0)));
        else if (mode == Mode.Buy) data = abi.encodeCall(IBallIsFlat.buy, (arg, type(uint256).max));
        else if (mode == Mode.Open) data = abi.encodeCall(IBallIsFlat.open, (arg));
        else data = abi.encodeCall(IBallIsFlat.finalize, (arg));
        (bool ok, bytes memory ret) = address(bif).call(data);
        lastError = ok ? bytes("") : ret;
    }
}

/// Contract wallet that cannot receive ERC-721s.
contract NoReceiver {
    function mint(IBallIsFlat bif, address token, uint256 matchId, uint32 playerId, bytes32[] calldata proof)
        external
    {
        IERC20(token).approve(address(bif), type(uint256).max);
        bif.mint(matchId, playerId, proof);
    }
}

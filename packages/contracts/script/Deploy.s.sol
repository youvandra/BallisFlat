// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {BallIsFlat} from "../src/BallIsFlat.sol";

/// Deploys BallIsFlat. The broadcasting key becomes the owner.
/// Env: WIF_ADDRESS, SETTLER_ADDRESS (required); BURN_BPS (default 1000), DISPUTE_WINDOW (default 7200),
/// SALE_BURN_BPS (default 500, burned from every market sale).
contract Deploy is Script {
    function run() external returns (BallIsFlat bif) {
        address wif = vm.envAddress("WIF_ADDRESS");
        address settler = vm.envAddress("SETTLER_ADDRESS");
        uint16 burnBps = uint16(vm.envOr("BURN_BPS", uint256(1000)));
        uint16 saleBurnBps = uint16(vm.envOr("SALE_BURN_BPS", uint256(500)));
        uint64 disputeWindow = uint64(vm.envOr("DISPUTE_WINDOW", uint256(7200)));

        vm.startBroadcast();
        bif = new BallIsFlat(wif, settler, burnBps, disputeWindow, saleBurnBps);
        vm.stopBroadcast();

        console2.log("BallIsFlat deployed at", address(bif));
        console2.log("  owner        ", bif.owner());
        console2.log("  wif          ", wif);
        console2.log("  settler      ", settler);
        console2.log("  burnBps      ", burnBps);
        console2.log("  disputeWindow", disputeWindow);
        console2.log("  saleBurnBps  ", saleBurnBps);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Hashes} from "@openzeppelin/contracts/utils/cryptography/Hashes.sol";

/// Test-side copy of the squad tree (BallIsFlat.squadRoot, packages/core/src/squad.ts): builds the
/// root and a proof for one player. ids must be strictly ascending.
library Squad {
    function leaf(uint32 playerId) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(playerId))));
    }

    function root(uint32[] memory ids) internal pure returns (bytes32) {
        bytes32[] memory level = _leaves(ids);
        uint256 n = level.length;
        while (n > 1) {
            n = _up(level, n);
        }
        return level[0];
    }

    function proof(uint32[] memory ids, uint32 playerId) internal pure returns (bytes32[] memory out) {
        bytes32[] memory level = _leaves(ids);
        uint256 n = level.length;
        uint256 index = type(uint256).max;
        for (uint256 i; i < n; ++i) {
            if (ids[i] == playerId) index = i;
        }
        // A player outside the squad gets an empty proof, which fails verification (unless n == 1).
        if (index == type(uint256).max) return new bytes32[](0);
        bytes32[] memory path = new bytes32[](32);
        uint256 depth;
        while (n > 1) {
            uint256 sibling = index ^ 1;
            if (sibling < n) path[depth++] = level[sibling];
            index /= 2;
            n = _up(level, n);
        }
        out = new bytes32[](depth);
        for (uint256 i; i < depth; ++i) {
            out[i] = path[i];
        }
    }

    function _leaves(uint32[] memory ids) private pure returns (bytes32[] memory level) {
        level = new bytes32[](ids.length);
        for (uint256 i; i < ids.length; ++i) {
            level[i] = leaf(ids[i]);
        }
    }

    function _up(bytes32[] memory level, uint256 n) private pure returns (uint256 half) {
        half = (n + 1) / 2;
        for (uint256 i; i < half; ++i) {
            uint256 left = 2 * i;
            level[i] = left + 1 < n ? Hashes.commutativeKeccak256(level[left], level[left + 1]) : level[left];
        }
    }
}

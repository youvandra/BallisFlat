import { describe, expect, it } from "vitest";
import { squadIds, squadLeaf, squadProof, squadRoot, verifySquadProof } from "./squad";

// Pinned against the contract: test_Squad_RootMatchesCoreVector in packages/contracts/test/BallIsFlat.t.sol
// asserts BallIsFlat.squadRoot([7, 9, 10]) equals this value.
const VECTOR_ROOT = "0xabd7d0e544a932d93429c4ac640a966a696a2c5ef7f7cc95dcee15996d020ea7";

describe("squad tree", () => {
  it("matches the contract on a fixed vector", () => {
    expect(squadRoot([7, 9, 10])).toBe(VECTOR_ROOT);
  });

  it("a single player is its own root", () => {
    expect(squadRoot([42])).toBe(squadLeaf(42));
    expect(squadProof([42], 42)).toEqual([]);
  });

  it("every player of every size proves, outsiders do not", () => {
    for (let n = 1; n <= 60; n++) {
      const ids = Array.from({ length: n }, (_, i) => 100 + i * 3);
      const root = squadRoot(ids);
      for (const id of ids) {
        const proof = squadProof(ids, id);
        expect(proof).not.toBeNull();
        expect(verifySquadProof(root, id, proof ?? [])).toBe(true);
      }
      expect(squadProof(ids, 1)).toBeNull();
      expect(verifySquadProof(root, 1, squadProof(ids, ids[0] as number) ?? [])).toBe(false);
    }
  });

  it("rejects unsorted or duplicate ids, and squadIds fixes them", () => {
    expect(() => squadRoot([9, 7])).toThrow();
    expect(() => squadRoot([7, 7])).toThrow();
    expect(() => squadRoot([])).toThrow();
    expect(squadIds([9, 7, 9, 10])).toEqual([7, 9, 10]);
  });
});

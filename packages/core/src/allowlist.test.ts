import { describe, expect, it } from "vitest";
import { allowLeaf, allowProof, allowRoot, parseAllowlist, verifyAllowProof } from "./allowlist";

// Pinned against the contract: test_free_silver_with_the_core_allowlist_vector in
// packages/contracts/test/Hunt.t.sol buys with this root and proof from VECTOR[0].
const VECTOR = [
  "0x00000000000000000000000000000000000A11cE",
  "0x0000000000000000000000000000000000000B0b",
  "0x0000000000000000000000000000000000c4A201",
];
const VECTOR_ROOT = "0x03e77b9c5c125fe5291407762aeb940d2671c1f85bb63af2a6fbcda457c08889";
const VECTOR_PROOF = [
  "0x7740b371745000923b2b7cb0f43a638c71ba9d6a6f760f879e55fb1f075a434c",
  "0xc7f1a6a03dd2a5a7b659fd4236187d678cb912ad644a3bc283783bd5d6f227a9",
];

describe("allowlist tree", () => {
  it("matches the contract on a fixed vector", () => {
    expect(allowRoot(VECTOR)).toBe(VECTOR_ROOT);
    expect(allowProof(VECTOR, VECTOR[0] as string)).toEqual(VECTOR_PROOF);
  });

  it("case and duplicates do not change the root", () => {
    const lower = VECTOR.map((wallet) => wallet.toLowerCase());
    expect(allowRoot([...lower, ...VECTOR])).toBe(allowRoot(VECTOR));
    expect(allowRoot([...VECTOR].reverse())).toBe(allowRoot(VECTOR));
  });

  it("a single wallet is its own root", () => {
    expect(allowRoot([VECTOR[1] as string])).toBe(allowLeaf(VECTOR[1] as string));
    expect(allowProof([VECTOR[1] as string], VECTOR[1] as string)).toEqual([]);
  });

  it("every listed wallet proves, outsiders do not", () => {
    for (let n = 1; n <= 40; n++) {
      const wallets = Array.from({ length: n }, (_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}`);
      const root = allowRoot(wallets);
      for (const wallet of wallets) {
        expect(verifyAllowProof(root, wallet, allowProof(wallets, wallet) ?? [])).toBe(true);
      }
      const outsider = `0x${"f".repeat(40)}`;
      expect(allowProof(wallets, outsider)).toBeNull();
      expect(verifyAllowProof(root, outsider, allowProof(wallets, wallets[0] as string) ?? [])).toBe(false);
    }
  });

  it("parses addresses out of a CSV and reports bad ones", () => {
    const csv = `wallet,note\n${VECTOR[0]},first\n${VECTOR[0]?.toLowerCase()},dupe\n0x1234,short\n${VECTOR[2]}`;
    const { wallets, invalid } = parseAllowlist(csv);
    expect(wallets).toEqual([VECTOR[0], VECTOR[2]]);
    expect(invalid).toEqual(["0x1234"]);
  });

  it("refuses an empty list", () => {
    expect(() => allowRoot([])).toThrow("empty allowlist");
  });
});

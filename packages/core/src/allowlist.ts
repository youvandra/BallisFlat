// The Hunt allowlist tree, checked on chain by BallIsFlatHunt.buy (packages/contracts/src/BallIsFlatHunt.sol):
//   leaf   = keccak256(bytes.concat(keccak256(abi.encode(address wallet))))
//   parent = commutative keccak of its two children (smaller hash first), as OpenZeppelin MerkleProof
//   leaves are sorted by hash; an odd node at the end of a level moves up unchanged
// One wallet, one leaf: duplicates and letter case are folded before building.
import { concat, encodeAbiParameters, getAddress, type Hex, isAddress, keccak256 } from "viem";

export function allowLeaf(wallet: string): Hex {
  return keccak256(keccak256(encodeAbiParameters([{ type: "address" }], [getAddress(wallet)])));
}

function pair(a: Hex, b: Hex): Hex {
  return BigInt(a) < BigInt(b) ? keccak256(concat([a, b])) : keccak256(concat([b, a]));
}

function up(level: Hex[]): Hex[] {
  const next: Hex[] = [];
  for (let i = 0; i < level.length; i += 2) {
    const left = level[i] as Hex;
    const right = level[i + 1];
    next.push(right === undefined ? left : pair(left, right));
  }
  return next;
}

/**
 * Pulls every 0x address out of pasted text or a CSV (any column, any separator), checksummed and
 * de-duplicated in first-seen order. `invalid` lists 0x… tokens that are not addresses.
 */
export function parseAllowlist(text: string): { wallets: Hex[]; invalid: string[] } {
  const seen = new Set<string>();
  const wallets: Hex[] = [];
  const invalid: string[] = [];
  for (const token of text.match(/0x[0-9a-fA-F]+/g) ?? []) {
    if (token.length !== 42 || !isAddress(token, { strict: false })) {
      invalid.push(token);
      continue;
    }
    const wallet = getAddress(token);
    if (seen.has(wallet)) continue;
    seen.add(wallet);
    wallets.push(wallet);
  }
  return { wallets, invalid };
}

function sortedLeaves(wallets: readonly string[]): Hex[] {
  if (wallets.length === 0) throw new Error("empty allowlist");
  const leaves = [...new Set(wallets.map((wallet) => allowLeaf(wallet)))];
  return leaves.sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0));
}

export function allowRoot(wallets: readonly string[]): Hex {
  let level = sortedLeaves(wallets);
  while (level.length > 1) level = up(level);
  return level[0] as Hex;
}

/** Proof that `wallet` is on the list, or null when it is not. */
export function allowProof(wallets: readonly string[], wallet: string): Hex[] | null {
  let level = sortedLeaves(wallets);
  let index = level.indexOf(allowLeaf(wallet));
  if (index < 0) return null;
  const proof: Hex[] = [];
  while (level.length > 1) {
    const sibling = level[index ^ 1];
    if (sibling !== undefined) proof.push(sibling);
    index = Math.floor(index / 2);
    level = up(level);
  }
  return proof;
}

/** Same check as OpenZeppelin MerkleProof.verify. */
export function verifyAllowProof(root: Hex, wallet: string, proof: readonly Hex[]): boolean {
  let hash = allowLeaf(wallet);
  for (const node of proof) hash = pair(hash, node);
  return hash.toLowerCase() === root.toLowerCase();
}

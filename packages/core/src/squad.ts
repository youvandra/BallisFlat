// The squad merkle tree, mirrored from BallIsFlat.squadRoot (packages/contracts/src/BallIsFlat.sol):
//   leaf   = keccak256(bytes.concat(keccak256(abi.encode(uint32 playerId))))
//   parent = commutative keccak of its two children (smaller hash first)
//   an odd node at the end of a level moves up unchanged
// Ids must be strictly ascending. Proofs verify with OpenZeppelin MerkleProof on chain and with
// `verifySquadProof` here.
import { concat, encodeAbiParameters, type Hex, keccak256 } from "viem";

export function squadLeaf(playerId: number): Hex {
  return keccak256(keccak256(encodeAbiParameters([{ type: "uint32" }], [playerId])));
}

function pair(a: Hex, b: Hex): Hex {
  return BigInt(a) < BigInt(b) ? keccak256(concat([a, b])) : keccak256(concat([b, a]));
}

function assertAscending(ids: readonly number[]) {
  if (ids.length === 0) throw new Error("empty squad");
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i] as number;
    if (!Number.isInteger(id) || id < 0 || id > 0xffffffff) throw new Error(`bad player id ${id}`);
    if (i > 0 && id <= (ids[i - 1] as number)) throw new Error("player ids must be strictly ascending");
  }
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

/** Sorts and de-duplicates, which is what the contract expects to receive. */
export function squadIds(ids: Iterable<number>): number[] {
  return [...new Set(ids)].sort((a, b) => a - b);
}

export function squadRoot(ids: readonly number[]): Hex {
  assertAscending(ids);
  let level = ids.map(squadLeaf);
  while (level.length > 1) level = up(level);
  return level[0] as Hex;
}

/** Proof that playerId is in the squad, or null when it is not. */
export function squadProof(ids: readonly number[], playerId: number): Hex[] | null {
  assertAscending(ids);
  let index = ids.indexOf(playerId);
  if (index < 0) return null;
  let level = ids.map(squadLeaf);
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
export function verifySquadProof(root: Hex, playerId: number, proof: readonly Hex[]): boolean {
  let hash = squadLeaf(playerId);
  for (const node of proof) hash = pair(hash, node);
  return hash.toLowerCase() === root.toLowerCase();
}

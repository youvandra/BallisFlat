import { describe, expect, it } from "vitest";
import { type HuntCardView, huntCardStatus, huntCardSvg, huntMetadataJson } from "./metadata";

const card: HuntCardView = {
  tokenId: 7n,
  round: 1,
  packId: 3n,
  tier: "Gold",
  wanted: false,
  claimed: false,
  paid: false,
  playerName: "Luka Modrić",
  playerPosition: "MF",
  playerNumber: 10,
  teamCode: "CRO",
  teamColour: "#d52b1e",
};

describe("hunt card metadata", () => {
  it("names the pack and points images at the hunt routes", () => {
    const meta = huntMetadataJson(card, "https://api.test", "https://app.test");
    expect(meta.name).toBe("Luka Modrić · Hunt Round 1");
    expect(meta.image).toBe("https://api.test/hunt/cards/7/image.png");
    expect(meta.animation_url).toBe("https://api.test/hunt/cards/7/image.svg");
    expect(meta.external_url).toBe("https://app.test/hunt");
    expect(meta.attributes).toContainEqual({ trait_type: "Pack", value: "Gold" });
    expect(meta.attributes).toContainEqual({ trait_type: "Status", value: "Drawn" });
  });

  it("marks the wanted card through claimed and paid", () => {
    const wanted = { ...card, wanted: true };
    expect(huntCardStatus(wanted)).toBe("Wanted");
    expect(huntCardStatus({ ...wanted, claimed: true })).toBe("Claimed");
    expect(huntCardStatus({ ...wanted, claimed: true, paid: true })).toBe("Paid");
    expect(huntMetadataJson(wanted, "a", "b").name).toContain("Wanted");
  });

  it("draws the number when there is no art and escapes names", () => {
    const svg = huntCardSvg({ ...card, playerName: "A & B" });
    expect(svg).toContain("A &#38; B");
    expect(svg).toContain(">10</text>");
    expect(svg).toContain("HUNT ROUND 1");
    expect(svg).toContain("GOLD");
  });
});

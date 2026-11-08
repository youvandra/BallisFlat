import { describe, expect, it, vi } from "vitest";
import { artUrlFor, inlineArt } from "./art";
import { type CardView, cardSvg, footLine } from "./metadata";

const png = new Uint8Array([137, 80, 78, 71]);
const ok = () =>
  new Response(png, { status: 200, headers: { "content-type": "image/png" } }) as unknown as Response;

const card: CardView = {
  tokenId: 23n,
  serial: 5,
  cardsInMatch: 5,
  opened: true,
  state: "live",
  matchStatus: "Listed",
  won: null,
  playerName: "Harry Kane",
  playerPosition: "FW",
  playerNumber: 9,
  teamCode: "ENG",
  teamColour: "#FFFFFF",
  home: "England",
  away: "Croatia",
  competition: "UEFA Nations League 2026-27",
  matchday: 5,
  kickoff: new Date("2026-11-12T19:45:00Z"),
  slug: "england-v-croatia",
};

describe("card art", () => {
  it("knows Kane's illustration on our CDN and nothing for a player without one", () => {
    expect(artUrlFor("ENG", "Harry Kane")).toMatch(/^https:\/\/d29qeiydx3h9k2\.cloudfront\.net\//);
    expect(artUrlFor("ENG", "Nobody Here")).toBeNull();
  });

  it("downloads once, then serves the data URI from memory", async () => {
    const fetcher = vi.fn(async () => ok());
    const url = "https://d29qeiydx3h9k2.cloudfront.net/players/test-once.png";
    const first = await inlineArt(url, fetcher as unknown as typeof fetch);
    const second = await inlineArt(url, fetcher as unknown as typeof fetch);
    expect(first).toBe(`data:image/png;base64,${Buffer.from(png).toString("base64")}`);
    expect(second).toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("forgets a failed download so the next request retries", async () => {
    const url = "https://d29qeiydx3h9k2.cloudfront.net/players/test-retry.png";
    const down = vi.fn(async () => new Response("nope", { status: 503 }));
    expect(await inlineArt(url, down as unknown as typeof fetch)).toBeNull();
    const up = vi.fn(async () => ok());
    expect(await inlineArt(url, up as unknown as typeof fetch)).toMatch(/^data:image\/png;base64,/);
  });
  it("re-encodes WebP art as PNG so the rasterised card shows it", async () => {
    const sharp = (await import("sharp")).default;
    const webp = await sharp({ create: { width: 4, height: 4, channels: 4, background: "#ff4fa3" } })
      .webp()
      .toBuffer();
    const fetcher = vi.fn(
      async () =>
        new Response(new Uint8Array(webp), { status: 200, headers: { "content-type": "image/webp" } }),
    );
    const url = "https://d29qeiydx3h9k2.cloudfront.net/players/test-webp.webp";
    expect(await inlineArt(url, fetcher as unknown as typeof fetch)).toMatch(/^data:image\/png;base64,/);
  });
});

describe("card svg", () => {
  it("writes the illustration in as a data URI and never as a remote URL", () => {
    expect(cardSvg(card, "data:image/png;base64,AAAA")).toContain('href="data:image/png;base64,AAAA"');
    expect(cardSvg(card, "https://evil.example/x.png")).not.toContain("evil.example");
  });

  it("a sealed card hides the player and prints no art", () => {
    const sealed = cardSvg({ ...card, opened: false }, "data:image/png;base64,AAAA");
    expect(sealed).not.toContain("HARRY KANE");
    expect(sealed).not.toContain("data:image/png");
    expect(sealed).toContain("SEALED PICK");
  });

  it("falls back to the shirt number without art", () => {
    expect(cardSvg(card, null)).toContain(">9</text>");
  });

  it("keeps the footer short enough to clear the status pill", () => {
    expect(footLine(card)).toBe("UEFA Nations League · MD5");
    expect(
      footLine({ competition: "A Very Long Competition Name Indeed 2026", matchday: 12 }).length,
    ).toBeLessThanOrEqual(28);
    expect(footLine({ competition: "Friendly", matchday: 0 })).toBe("Friendly · Warm-up");
  });
});

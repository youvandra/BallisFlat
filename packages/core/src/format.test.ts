import { describe, expect, it } from "vitest";
import { sentenceFor } from "./errors";
import { formatCompact, formatUsd, shortId } from "./format";

describe("format", () => {
  it("formats dollars and compact figures", () => {
    expect(formatUsd(1234.5)).toBe("$1,234.50");
    expect(formatCompact(2_160_000)).toBe("2.2M");
  });

  it("shortens long ids and keeps short ones", () => {
    expect(shortId("0x1234567890abcdef1234567890abcdef12345678")).toBe("0x1234…5678");
    expect(shortId("0x12")).toBe("0x12");
  });
});

describe("errors", () => {
  it("falls back to the unknown sentence", () => {
    expect(sentenceFor("NotAuthorized")).toBe("This wallet is not allowed to do that.");
    expect(sentenceFor("SomethingNew")).toBe("Something went wrong. Nothing was sent.");
  });
});

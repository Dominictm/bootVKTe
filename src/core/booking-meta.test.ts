import { describe, expect, it } from "vitest";
import { decodeDescription, encodeDescription, matchesUser } from "./booking-meta";

describe("encodeDescription / decodeDescription", () => {
  it("round-trips a valid meta object", () => {
    const meta = { platform: "telegram" as const, userId: "123", username: "ivan" };
    const description = encodeDescription(meta);
    expect(decodeDescription(description)).toEqual(meta);
  });

  it("returns null for undefined description", () => {
    expect(decodeDescription(undefined)).toBeNull();
  });

  it("returns null for null description", () => {
    expect(decodeDescription(null)).toBeNull();
  });

  it("returns null when the marker is missing", () => {
    expect(decodeDescription("just some random text")).toBeNull();
  });

  it("returns null when the JSON after the marker is malformed", () => {
    expect(decodeDescription("Забронировано через бота.\n---META---\n{not valid json")).toBeNull();
  });

  it("returns null when the parsed object is missing required fields", () => {
    expect(decodeDescription("---META---\n{\"platform\":\"telegram\"}")).toBeNull();
  });
});

describe("matchesUser", () => {
  const meta = { platform: "telegram" as const, userId: "123", username: "ivan" };

  it("matches same platform and userId", () => {
    expect(matchesUser(meta, "telegram", "123")).toBe(true);
  });

  it("does not match a different userId", () => {
    expect(matchesUser(meta, "telegram", "999")).toBe(false);
  });

  it("does not match a different platform", () => {
    expect(matchesUser(meta, "vk", "123")).toBe(false);
  });

  it("does not match null meta", () => {
    expect(matchesUser(null, "telegram", "123")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { cleanUrl, scrubEvent } from "./monitoring";

describe("error tracking scrubbing", () => {
  it("drops query strings and replaces IDs in the path", () => {
    expect(cleanUrl("https://laluan.app/?view=card&card=abcDEF1234567890xyz_-99#top")).toBe("https://laluan.app/");
    expect(cleanUrl("https://api/api/profiles/0b6c3f1e-1d2a-4c5b-9e8f-112233445566/pathway?role=x"))
      .toBe("https://api/api/profiles/{id}/pathway");
  });

  it("removes the user, breadcrumbs and extra data from an event", () => {
    const event = scrubEvent({ request: { url: "https://x/?q=Siti" }, user: { email: "a@b.my" }, breadcrumbs: [{ message: "typed 012-345" }], extra: { cv: "text" } });
    expect(event).toEqual({ request: { url: "https://x/" }, user: undefined, breadcrumbs: undefined, extra: undefined });
  });
});

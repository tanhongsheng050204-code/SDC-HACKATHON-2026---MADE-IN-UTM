import { afterEach, describe, expect, it, vi } from "vitest";
import { api, onRateLimited } from "./api";

describe("rate-limited requests", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("tells the shell how long to wait when the API answers 429", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "slow down" }),
      { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "120" } })));
    const heard: number[] = [];
    const off = onRateLimited((s) => heard.push(s));
    await expect(api.coach("p1", "How long?", "baseline")).rejects.toThrow("429");
    off();
    expect(heard).toEqual([120]);
  });
});

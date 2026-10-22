import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth", () => ({
  freshToken: vi.fn(async () => "login-token"),
  refreshToken: vi.fn(async () => "login-token-2"),
  signOut: vi.fn(async () => undefined),
}));

import { api, onAuthExpired } from "./api";
import { signOut } from "./auth";

const answer = (detail: string) => new Response(JSON.stringify({ detail }),
  { status: 401, headers: { "Content-Type": "application/json" } });

describe("401 answers for a logged-in person", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.mocked(signOut).mockClear(); });

  it("a wrong admin token is not a lost login: no sign-out, no expiry notice", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => answer("Admin token required")));
    let expired = false;
    const off = onAuthExpired(() => { expired = true; });
    await expect(api.refreshStart("wrong-token", false)).rejects.toThrow("401");
    off();
    expect(expired).toBe(false);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("a refused login is refreshed once, then signs out and tells the shell", async () => {
    const fetch = vi.fn(async () => answer("Please log in again"));
    vi.stubGlobal("fetch", fetch);
    let expired = false;
    const off = onAuthExpired(() => { expired = true; });
    await expect(api.me()).rejects.toThrow("401");
    off();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(expired).toBe(true);
    expect(signOut).toHaveBeenCalledOnce();
  });
});

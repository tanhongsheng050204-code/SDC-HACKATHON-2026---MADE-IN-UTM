import { afterEach, describe, expect, it, vi } from "vitest";
import { load, save } from "./storage";

describe("browser storage", () => {
  afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

  it("saves, reads and removes a value", () => {
    save("laluan.test", "yes");
    expect(load("laluan.test")).toBe("yes");
    save("laluan.test", null);
    expect(load("laluan.test")).toBeNull();
  });

  it("never throws when storage is blocked (private mode)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => save("laluan.test", "x")).not.toThrow();
    expect(load("laluan.test")).toBeNull();
  });
});

describe("clearing a person's data from this device", () => {
  it("removes coach conversations kept in the tab", async () => {
    const { clearOfflineData } = await import("./pwa");
    sessionStorage.setItem("laluan.coach.p1.any", "[]");
    sessionStorage.setItem("laluan.other", "keep");
    clearOfflineData();
    expect(sessionStorage.getItem("laluan.coach.p1.any")).toBeNull();
    expect(sessionStorage.getItem("laluan.other")).toBe("keep");
  });
});

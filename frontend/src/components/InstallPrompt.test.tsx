import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InstallPrompt } from "./InstallPrompt";

const usage = vi.fn(async () => undefined);
vi.mock("../lib/api", () => ({ api: { usage: (...a: unknown[]) => usage(...(a as [])) } }));

function offerInstall(outcome: "accepted" | "dismissed") {
  const event = Object.assign(new Event("beforeinstallprompt"), {
    prompt: vi.fn(async () => undefined), userChoice: Promise.resolve({ outcome }),
  });
  act(() => { window.dispatchEvent(event); });
  return event;
}

describe("InstallPrompt", () => {
  it("waits for the second visit, then appears when the browser offers install and counts an accepted install", async () => {
    localStorage.clear(); sessionStorage.clear();
    const first = render(<InstallPrompt />);
    offerInstall("dismissed");
    expect(screen.queryByRole("button", { name: "Install" })).toBeNull();
    first.unmount();
    sessionStorage.clear();  // a new visit
    render(<InstallPrompt />);
    const event = offerInstall("accepted");
    fireEvent.click(await screen.findByRole("button", { name: "Install" }));
    await vi.waitFor(() => expect(usage).toHaveBeenCalledWith("app_installed"));
    expect(event.prompt).toHaveBeenCalled();
  });

  it("Not now hides it for good on this device", async () => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem("laluan.visits", "1");
    const { unmount } = render(<InstallPrompt />);
    offerInstall("dismissed");
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("region", { name: "Install Laluan" })).toBeNull();
    unmount();
    render(<InstallPrompt />);
    offerInstall("dismissed");
    expect(screen.queryByRole("region", { name: "Install Laluan" })).toBeNull();
  });
});

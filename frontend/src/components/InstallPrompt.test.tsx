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
  it("appears when the browser offers install, and counts an accepted install", async () => {
    localStorage.clear();
    render(<InstallPrompt />);
    expect(screen.queryByText("Install Laluan")).toBeNull();
    const event = offerInstall("accepted");
    fireEvent.click(await screen.findByRole("button", { name: "Install" }));
    await vi.waitFor(() => expect(usage).toHaveBeenCalledWith("app_installed"));
    expect(event.prompt).toHaveBeenCalled();
  });

  it("Not now hides it for good on this device", async () => {
    localStorage.clear();
    const { unmount } = render(<InstallPrompt />);
    offerInstall("dismissed");
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    expect(screen.queryByText("Install Laluan")).toBeNull();
    unmount();
    render(<InstallPrompt />);
    offerInstall("dismissed");
    expect(screen.queryByText("Install Laluan")).toBeNull();
  });
});

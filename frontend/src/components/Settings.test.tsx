import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Profile } from "../lib/api";
import { Settings } from "./Settings";

vi.mock("../lib/api", () => ({ api: { exportData: vi.fn(), reportProblem: vi.fn() } }));
vi.mock("../lib/auth", () => ({ authEnabled: false, signIn: vi.fn(), signOut: vi.fn() }));

const demo = { id: "p1", is_demo: true, skills: [] } as unknown as Profile;

describe("Settings", () => {
  it("holds language, leave the demo, data rights and report a problem in one dialog", () => {
    const onLeave = vi.fn(), onDelete = vi.fn();
    render(<Settings profile={demo} userId={null} screen="home" lang="en" onLang={() => {}} onLeave={onLeave} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Language");
    expect(screen.getByRole("button", { name: /Download my data/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Report a problem/ })).toBeTruthy();
    expect(screen.queryByText(/Lite mode/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Delete my profile/ }));
    expect(onDelete).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: /Leave the demo/ }));
    expect(onLeave).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

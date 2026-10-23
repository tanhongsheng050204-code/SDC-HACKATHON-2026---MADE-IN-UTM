import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Journey, Profile } from "../lib/api";
import { Home } from "./Home";

const outlook = (i: number, label: string) => ({ slow: { index: i, label }, baseline: { index: i, label }, accelerated: { index: i, label } });
const role = (role_id: string, title: string, rank: number, fit: number, i: number, label: string, extra = {}) =>
  ({ role_id, title, rank, fit, outlook: outlook(i, label), why: { entry_points: 0 }, robust_pick: false, ...extra });

vi.mock("../lib/api", () => ({ api: {
  matches: vi.fn(async () => ({
    roles: [role("hotel", "Hotel front-desk clerk", 1, 0.82, -8.1, "stable"), role("csr", "Customer service representative", 2, 0.73, -2.8, "stable"),
      role("bim", "Engineering drafting and BIM technician", 3, 0.6, 20.8, "growing"), role("cashier", "Cashier", 21, 0.55, -20.4, "declining", { is_current_role: true })],
    current_role: null, signal_source: { snapshot_id: "s1", imported: "2026-10-22", illustrative: false },
  })),
  pathway: vi.fn(async () => ({ readiness: 0.6, hours_left: 28, steps: [] })),
  progress: vi.fn(async () => ({ readiness: 0.6, target_date: null, status: null })),
  replan: vi.fn(async () => ({ changed: false })), myActions: vi.fn(async () => []), planCheck: vi.fn(async () => []),
  history: vi.fn(async () => ({ points: [] })), role: vi.fn(async () => ({ title: "x" })),
} }));

const profile = { id: "p1", display_name: "QA", target_role_id: "bim", current_role_id: "cashier", completed_courses: [], skills: [] } as unknown as Profile;
const journey: Journey = { steps: [{ id: "stand", done: true }, { id: "explore", done: true }, { id: "build", done: true }, { id: "apply", done: false }],
  next: "apply", target_role_id: "bim", target_title: "Engineering drafting and BIM technician" };

describe("Today", () => {
  it("leads with one next step and the journey, then tiles, updates and three role rows", async () => {
    const onTarget = vi.fn();
    render(<Home profile={profile} scenario="baseline" journey={journey} onOpenRole={() => {}} onGo={() => {}} onTarget={onTarget} />);
    expect(await screen.findByRole("heading", { name: "Get ready to apply" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Your journey" })).toBeInTheDocument();
    expect(screen.getByText("Hotel front-desk clerk", { selector: ".today-tile small" })).toBeInTheDocument();
    expect(await screen.findByText("60% ready")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /#\d/ })).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: /Set a target date/ }));
    expect(onTarget).toHaveBeenCalledWith("tree");
  });
});

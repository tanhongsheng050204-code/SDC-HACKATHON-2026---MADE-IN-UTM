import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Profile } from "../lib/api";
import { Roles } from "./Roles";

// Modules the test does not look at (emerging roles, AI-assisted job…) fail quietly, as when offline.
const { matches, tipping } = vi.hoisted(() => ({ matches: vi.fn(), tipping: vi.fn() }));
vi.mock("../lib/api", () => ({
  api: new Proxy({ matches, tipping }, {
    get: (known: Record<string, unknown>, key: string) => known[key] ?? vi.fn(async () => { throw new Error("offline"); }),
  }),
}));

const out = (index: number, label: string) => ({ slow: { index, label }, baseline: { index, label }, accelerated: { index, label } });
const role = (i: number) => ({
  role_id: `r${i}`, title: `Role ${i}`, rank: i, fit: 0.7 - i * 0.05, outlook: out(10 - i, "growing"), robust_pick: i === 2, at_risk: false,
  is_current_role: false, rank_change_vs_baseline: 0, sdgs: [], pay: { median_rm: 3000 }, plan_hours: 20 * i, missing: [], covered: [], carry_over: [],
});

function setup() {
  matches.mockResolvedValue({
    roles: [1, 2, 3, 4, 5, 6, 7].map(role), year: 2030, year_range: [2026, 2030], also_like: [], shortest_route: null,
    current_role: { role_id: "cashier", title: "Cashier", outlook: out(-20, "declining"), at_risk: true, fit: 0.4, summary: "" },
    scenario: { id: "baseline", label: "Baseline", description: "As published." },
    signal_source: { source: "WEF", source_url: "", published: "2025", imported: "2026-10-22", horizon_year: 2030, illustrative: false },
  });
  tipping.mockResolvedValue({ current_role: { role_id: "cashier", title: "Cashier", declining_at: 0.53, declining_below: false, label_now: "declining" },
    overtakes: [], range: [0.5, 2], step: 0.05 });
  render(<Roles profile={{ id: "p1", current_role_id: "cashier", audience: "worker", skills: [], completed_courses: [], preferences: {} } as unknown as Profile}
    scenario="baseline" onScenario={() => {}} onAdoption={() => {}} onYear={() => {}} onOpen={() => {}} onSurvey={() => {}} />);
}

describe("Future roles", () => {
  it("sums up first, then shows the top 5 with Show all", async () => {
    setup();
    expect(await screen.findByText("Your best match is Role 1: 65% fit, growing +9%.")).toBeInTheDocument();
    expect(screen.getByText("Your current job, Cashier, is shrinking by 2030: look at the robust picks below.")).toBeInTheDocument();
    expect(screen.getByText("Role 5")).toBeInTheDocument();
    expect(screen.queryByText("Role 6")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show all 7" }));
    expect(screen.getByText("Role 7")).toBeInTheDocument();
  });

  it("marks tipping points on the custom AI speed", async () => {
    setup();
    await screen.findByText("Role 1");
    fireEvent.click(screen.getByRole("radio", { name: /Custom/ }));
    expect(await screen.findByText("0.53×: Cashier starts shrinking")).toBeInTheDocument();
  });
});

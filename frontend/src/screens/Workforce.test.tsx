import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Workforce } from "./Workforce";

const { workforceSample, workforce } = vi.hoisted(() => ({ workforceSample: vi.fn(), workforce: vi.fn() }));
vi.mock("../lib/api", () => ({ api: { workforceSample, workforce, savedReports: vi.fn().mockResolvedValue([]) } }));

const outlook = (i: number) => ({ slow: { index: i / 2, label: i < 0 ? "declining" : "growing" }, baseline: { index: i, label: i < 0 ? "declining" : "growing" },
  accelerated: { index: i * 1.5, label: i < 0 ? "declining" : "growing" } });
const role = (role_id: string, title: string, headcount: number, i: number) => ({ role_id, title, headcount, at_risk: i < 0, avg_fit: 0.7, outlook: outlook(i) });
const move = (from_role: string, to_role: string, people: number) => ({ from_role, to_role, to_role_id: to_role, people, avg_hours: 30, avg_fit_now: 0.4, fees_each_rm: 0, sdgs: [] });

function setup() {
  workforceSample.mockResolvedValue("role,skills\nData entry clerk,Excel");
  workforce.mockResolvedValue({
    scenario: { id: "baseline", label: "", description: "" }, employees: 73, at_risk: 73, total_hours: 900,
    budget: { total_rm: 0, claimable_rm: 0, ask_provider_rm: 0, unpriced_courses: [], people_with_fees: 0, staff_time_rm: 1000, pay_year: 2025 },
    roles: [role("dec", "Data entry clerk", 42, -26), role("adm", "Administrative assistant", 31, -20)],
    moves: [move("Data entry clerk", "Data analyst", 8), move("Administrative assistant", "AI operations specialist", 9)],
    in_place: [{ role_id: "dec", title: "Data entry clerk", people: 42, avg_hours: 47, fees_each_rm: 0, staff_time_rm: 500, ai_skills: ["Using generative AI tools"] }],
    get_ahead: [], sdg_contribution: [], grant_plan: [], problems: ["row 4: no role"],
    signal_source: { snapshot_id: "s1", imported: new Date().toISOString(), illustrative: false },
  });
  render(<Workforce />);
}

describe("Workforce", () => {
  it("starts with the sample as the main choice and leads the result with one sentence", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Show the results →" }));
    expect(await screen.findByText("73 of 73 people are in roles that shrink at this AI speed.")).toBeInTheDocument();
    expect(screen.getByText(/Upskilling in place starts from 47 hours a person/)).toBeInTheDocument();
    expect(screen.getByText(/1 skipped/)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Moves" })).toHaveAttribute("aria-selected", "true");
  });

  it("filters the moves when a role in the heatmap is tapped", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Show the results →" }));
    fireEvent.click(await screen.findByRole("button", { name: "Administrative assistant" }));
    expect(screen.getByText("AI operations specialist")).toBeInTheDocument();
    expect(screen.queryByText("Data analyst")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show every role" }));
    expect(screen.getByText("Data analyst")).toBeInTheDocument();
  });
});

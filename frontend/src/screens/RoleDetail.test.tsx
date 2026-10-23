import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Profile, RoleMatch } from "../lib/api";
import { RoleDetail } from "./RoleDetail";

// Panels the page does not test here (forecast history, role case…) fail quietly, as when offline.
const { updateProfile, matches, setTarget } = vi.hoisted(() => ({ updateProfile: vi.fn(), matches: vi.fn(), setTarget: vi.fn() }));
vi.mock("../lib/api", () => ({
  api: new Proxy({ updateProfile, matches, setTarget }, {
    get: (known: Record<string, unknown>, key: string) => known[key] ?? vi.fn(async () => { throw new Error("offline"); }),
  }),
}));

const skill = (id: string, name: string, weight = 2) => ({ skill_id: id, name, weight, sdgs: [] });
const outlook = { index: 18.8, label: "growing" };
const ROLE = {
  role_id: "care_worker", title: "Care worker", family: "Care", summary: "Supports elderly people.", rank: 11, score: 0.33, fit: 0.25,
  requirements: null, evidence: null, rank_change_vs_baseline: 0, carry_over: [], pay: null, pay_change_rm: null,
  why: { fit: 0.25, score: 0.33, fit_points: 0.15, outlook_points: 0.18, preference_points: 0, entry_points: 0, matched_preferences: [] },
  estimate_range: { low: 16.8, high: 21.2, horizon_year: 2030, year: 2030 },
  citation: { snapshot_id: "s1", imported: "2026-10-22", note: null }, skills_source: { onet_code: null, onet_note: null },
  outlook: { slow: outlook, baseline: outlook, accelerated: outlook }, robust_pick: true, at_risk: false, is_current_role: false,
  covered: [skill("communication", "Communication")], missing: [skill("care", "Patient and elderly care", 3)], sdgs: [],
} as unknown as RoleMatch;
const PROFILE = { id: "p1", skills: ["communication"], target_role_id: null } as unknown as Profile;

function setup(tab: "overview" | "fit" = "overview") {
  const props = { onProfile: vi.fn(), onRole: vi.fn(), onFlash: vi.fn() };
  render(<RoleDetail profile={PROFILE} role={ROLE} scenario="baseline" tab={tab} onTab={() => {}} onImpact={() => {}}
    onTree={() => {}} onBack={() => {}} {...props} />);
  return props;
}

describe("Role page", () => {
  it("answers is-this-for-me first and keeps the score maths in a sheet", () => {
    setup();
    expect(screen.getByText("A growing job. You have 1 of 2 skills.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Set as destination/ })).toHaveClass("primary");
    expect(screen.queryByText("Skill fit 25% × 0.6")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "How we ranked this (#11)" }));
    expect(screen.getByRole("dialog", { name: "How we ranked this" })).toBeInTheDocument();
    expect(screen.getByText("Skill fit 25% × 0.6")).toBeInTheDocument();
  });

  it("adds a skill you already have and refreshes the role", async () => {
    updateProfile.mockImplementation(async (p: Profile) => p);
    matches.mockResolvedValue({ roles: [{ ...ROLE, fit: 0.6 }] });
    const props = setup("fit");
    fireEvent.click(screen.getByRole("button", { name: "I already have Patient and elderly care" }));
    await vi.waitFor(() => expect(props.onRole).toHaveBeenCalled());
    expect(updateProfile.mock.calls[0][0].skills).toEqual(["communication", "care"]);
    expect(props.onFlash).toHaveBeenCalledWith("Added Patient and elderly care to your skills. Your fit goes up.");
  });
});

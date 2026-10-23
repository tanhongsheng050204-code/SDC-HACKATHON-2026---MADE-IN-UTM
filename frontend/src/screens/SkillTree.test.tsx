import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Profile, RoleMatch } from "../lib/api";
import { SkillTree } from "./SkillTree";

// Panels the test does not look at (progress, current role…) fail quietly, as when offline.
const { tree, pathway, complete } = vi.hoisted(() => ({ tree: vi.fn(), pathway: vi.fn(), complete: vi.fn() }));
vi.mock("../lib/api", () => ({
  api: new Proxy({ tree, pathway, complete }, {
    get: (known: Record<string, unknown>, key: string) => known[key] ?? vi.fn(async () => { throw new Error("offline"); }),
  }),
}));

const course = (id: string, title: string, cost = "free_audit") =>
  ({ id, title, provider: "Coursera", url: `https://example.com/${id}`, hours: 9, cost, level: "intro", price_rm: cost === "paid" ? null : 0 });
const node = (id: string, step: number | null, level = 0) =>
  ({ skill_id: id, name: id, level, from_cv: false, unlocked: true, prereqs: [], depth: 0, tier: "foundation", in_role: true, course: null, step, course_done: false });
const ROLE = { role_id: "tech", title: "BIM technician", covered: [{ skill_id: "comm", name: "Communication", weight: 2 }],
  missing: [{ skill_id: "think", name: "Thinking", weight: 2 }, { skill_id: "bim", name: "BIM", weight: 3 }] } as unknown as RoleMatch;
const PROFILE = { id: "p1", completed_courses: [], target_role_id: null, current_role_id: null } as unknown as Profile;

function setup(firstDone = false) {
  // jsdom has no matchMedia; report reduced motion so the hour counters show their final value at once.
  window.matchMedia = vi.fn(() => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
  tree.mockResolvedValue({ role: { role_id: "tech", title: "BIM technician" }, nodes: [node("think", 1), node("bim", 2)] });
  pathway.mockResolvedValue({
    role_id: "tech", fit: 0.4, readiness: 0.4, total_hours: 18, hours_left: 18, summary: "Two courses.", summary_mode: "template",
    grounding: null, uncovered_skills: [],
    steps: [
      { step: 1, skills: [{ skill_id: "think", name: "Thinking" }], course: course("c1", "Critical thinking"), why: "Important.", done: firstDone },
      { step: 2, skills: [{ skill_id: "bim", name: "BIM" }], course: course("c2", "BIM basics", "paid"), why: "Core.", done: false },
    ],
  });
  complete.mockImplementation(async () => PROFILE);
  render(<SkillTree profile={PROFILE} role={ROLE} userId={null} onProfile={() => {}} onImpact={() => {}} onBack={() => {}} onDestinations={() => {}} />);
}

describe("Pathway", () => {
  it("shows one next step and the path down to the job", async () => {
    setup();
    expect(await screen.findByText("Next · Step 1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open course/ })).toHaveAttribute("href", "https://example.com/c1");
    expect(screen.getByText("You already have 1 skill", { exact: false })).toBeInTheDocument();
    expect(screen.getAllByText("BIM basics", { exact: false }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "I finished it" }));
    await vi.waitFor(() => expect(complete).toHaveBeenCalledWith("p1", "c1", true));
  });

  it("asks for the proof once the course is finished", async () => {
    setup(true);
    expect(await screen.findByRole("button", { name: "Prove it: 3 questions" })).toBeInTheDocument();
  });
});

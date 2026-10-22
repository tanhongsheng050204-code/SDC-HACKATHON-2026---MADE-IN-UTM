import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CheckinAction, CheckinAgenda, Profile } from "../lib/api";
import { CheckinPanel } from "./CheckinPanel";
import { CounsellorActions, PlanChecks } from "./PlanGuard";

const proposed: CheckinAction = { id: "a1", kind: "weekly_hours", value: "6", status: "proposed", created_at: "2026-10-22T02:00:00Z",
  decided_at: null, class_name: "DKM 2", counsellor: "Puan Aminah", label: null };
const agenda: CheckinAgenda = {
  key: "k1", since: "2026-10-08", since_last_checkin: false, recent: { courses_finished: 1, skills_proven: 0 },
  student: { display_name: "Siti", destination: "Data analyst", readiness: 0.24, courses_finished: 1, skills_proven: [], last_active: "2026-10-21",
    target_date: "2027-06-30", status: "behind" },
  next_course: { id: "sql_basics", title: "SQL for Data Science", hours: 14 },
  checks: [{ kind: "hours_short", level: "warn", need: 9, weekly_hours: 4, hours_left: 280, target_date: "2027-06-30" }],
  options: { courses: [{ id: "sql_basics", title: "SQL for Data Science", hours: 14 }], skills: [{ id: "sql", name: "SQL" }] },
  actions: [],
};
const api = vi.hoisted(() => ({
  myActions: vi.fn(), answerAction: vi.fn(), planCheck: vi.fn(), checkin: vi.fn(), proposeAction: vi.fn(), withdrawAction: vi.fn(),
}));
vi.mock("../lib/api", () => ({ api }));

const profile = { id: "p1", completed_courses: [], target_role_id: "data_analyst" } as unknown as Profile;

describe("Counsellor proposals and plan checks", () => {
  it("lets the student accept a proposal, which refreshes their plan", async () => {
    api.myActions.mockResolvedValue([proposed]);
    api.answerAction.mockResolvedValue([{ ...proposed, status: "done" }]);
    const changed = vi.fn();
    render(<CounsellorActions profile={profile} onChanged={changed} />);
    expect(await screen.findByText("Study 6 h a week")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(changed).toHaveBeenCalled());
    expect(api.answerAction).toHaveBeenCalledWith("p1", "a1", "accept");
  });

  it("names the numbers behind a plan check", async () => {
    api.planCheck.mockResolvedValue(agenda.checks);
    render(<PlanChecks profile={profile} roleTitle="Data analyst" />);
    expect(await screen.findByText(/you need about 9 h a week for the 280 course hours left. You set 4 h/)).toBeTruthy();
  });

  it("builds a check-in agenda and sends a proposal from the student's own pathway", async () => {
    api.checkin.mockResolvedValue(agenda);
    api.proposeAction.mockResolvedValue({ ...agenda, actions: [{ ...proposed, kind: "next_course", value: "sql_basics", label: "SQL for Data Science" }] });
    render(<CheckinPanel classId="c1" memberKey="k1" onClose={() => {}} />);
    expect(await screen.findByText("Check-in with Siti")).toBeTruthy();
    expect(screen.getByText(/Not enough study hours/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send to the student" }));
    await waitFor(() => expect(api.proposeAction).toHaveBeenCalledWith("c1", "k1", "next_course", "sql_basics"));
    expect(await screen.findByText("Do this course next: SQL for Data Science")).toBeTruthy();
  });
});

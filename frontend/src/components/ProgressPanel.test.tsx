import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Profile, Progress } from "../lib/api";
import { ProgressPanel } from "./ProgressPanel";

const progress: Progress = {
  role_id: "data_analyst", target_date: "2027-04-30", weekly_hours: 6, today: "2026-10-22",
  readiness: 0.42, hours_left: 120, total_hours: 300, start: { date: "2026-10-01", readiness: 0.24 },
  expected: 0.3, status: "ahead", finish_estimate: "2027-02-11",
  week: { starts: "2026-10-19", hours_done: 3, target: 6 },
  points: [{ date: "2026-10-01", readiness: 0.24, kind: "destination_set", subject: "data_analyst" },
    { date: "2026-10-15", readiness: 0.42, kind: "course_finished", subject: "khan_statistics" }],
};
vi.mock("../lib/api", () => ({ api: { progress: vi.fn(async () => progress), setPlan: vi.fn() } }));

describe("ProgressPanel", () => {
  it("shows the status, readiness, finish estimate, week bar and a chart with a text summary", async () => {
    render(<ProgressPanel profile={{ id: "p1", completed_courses: [], target_role_id: "data_analyst" } as unknown as Profile}
      roleTitle="Data analyst" onProfile={() => {}} />);
    expect(await screen.findByText("Ahead")).toBeInTheDocument();
    expect(screen.getByText("42% ready")).toBeInTheDocument();
    expect(screen.getByText(/120 course hours left/)).toBeInTheDocument();
    expect(screen.getByText("Course hours finished this week: 3 of 6")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Readiness over time: .*24%.*42%/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Target date")).toHaveValue("");
  });
});

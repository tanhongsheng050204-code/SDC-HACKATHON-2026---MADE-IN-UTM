import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Profile } from "../lib/api";
import { CounsellorClasses } from "./CounsellorClasses";
import { JoinClass } from "./JoinClass";

const { api } = vi.hoisted(() => {
const joined = [{ id: "c1", name: "DKM 2", code: "ABCD2345", joined_at: "2026-10-22T01:00:00+00:00", counsellor: "Puan Aminah", organisation: "KV Shah Alam" }];
const api = {
  myClasses: vi.fn(async () => [] as typeof joined),
  classPreview: vi.fn(async () => ({ name: "DKM 2", counsellor: "Puan Aminah", organisation: "KV Shah Alam",
    shared: ["display_name", "destination", "readiness", "courses_finished", "skills_proven", "last_active", "target_date", "status"] })),
  joinClass: vi.fn(async () => joined),
  counsellorMe: vi.fn(async () => ({ status: "approved", name: "Puan Aminah", organisation: "KV", classes: [{ id: "c1", name: "DKM 2", code: "ABCD2345", created_at: "", members: 2 }] })),
  classDashboard: vi.fn(async () => ({ id: "c1", name: "DKM 2", code: "ABCD2345", created_at: "", shared: [],
    counts: { on_track: 1, ahead: 0, behind: 1, done: 0, no_date: 0 },
    students: [
      { display_name: "Siti", destination: "Data analyst", readiness: 0.42, courses_finished: 2, skills_proven: [], last_active: "2026-10-21", target_date: "2027-06-30", status: "on_track" },
      { display_name: "Ravi", destination: "Data analyst", readiness: 0.2, courses_finished: 0, skills_proven: [{ name: "SQL", level: 1 }], last_active: "2026-10-01", target_date: "2027-01-31", status: "behind" },
    ] })),
};
return { api, joined };
});
vi.mock("../lib/api", () => ({ api }));
vi.mock("../lib/auth", () => ({ authEnabled: true, signIn: vi.fn(), signOut: vi.fn() }));

describe("JoinClass", () => {
  it("shows who runs the class and exactly what is shared before joining", async () => {
    render(<JoinClass profile={{ id: "p1", user_id: "u1", completed_courses: [] } as unknown as Profile} userId="u1" />);
    fireEvent.change(screen.getByLabelText("Join code"), { target: { value: "abcd2345" } });
    fireEvent.click(screen.getByRole("button", { name: "Find class" }));
    expect(await screen.findByText(/your counsellor will see only/)).toBeInTheDocument();
    expect(screen.getByText("Skills proven (level)")).toBeInTheDocument();
    expect(screen.getByText(/Never shared: your skill list/)).toBeInTheDocument();
    expect(api.classPreview).toHaveBeenCalledWith("ABCD2345");
    fireEvent.click(screen.getByRole("button", { name: "Join and share" }));
    expect(await screen.findByText("You joined DKM 2.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Leave" })).toBeInTheDocument();
  });

  it("asks people who are not logged in to log in first", async () => {
    render(<JoinClass profile={{ id: "p1", user_id: null, completed_courses: [] } as unknown as Profile} userId={null} />);
    expect(await screen.findByText(/Log in with Google and save your profile/)).toBeInTheDocument();
  });
});

describe("CounsellorClasses", () => {
  it("lists the class and filters the dashboard by on-track status", async () => {
    render(<CounsellorClasses userId="t1" />);
    expect(await screen.findByText("ABCD2345")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(await screen.findByText("Ravi")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Behind (1)" }));
    expect(screen.queryByText("Siti")).toBeNull();
    expect(screen.getByText("Ravi")).toBeInTheDocument();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApplicationTracker } from "./ApplicationTracker";

const saved = { id: "a1", role_id: "data_analyst", title: "Junior Data Analyst", employer: "Acme Sdn Bhd", url: "https://example.org/job",
  status: "saved", interview_date: null, note: null, created_at: "2026-10-22", updated_at: "2026-10-22" };
const addApplication = vi.fn(async (_id: string, body: { title: string }) => ({ ...saved, id: "a2", title: body.title, employer: null, url: null }));
const updateApplication = vi.fn(async (_id: string, _app: string, body: object) => ({ ...saved, ...body }));
vi.mock("../lib/api", () => ({
  api: {
    applications: async () => [saved],
    addApplication: (...a: unknown[]) => addApplication(...(a as [string, { title: string }])),
    updateApplication: (...a: unknown[]) => updateApplication(...(a as [string, string, object])),
    deleteApplication: async () => undefined,
  },
}));

describe("ApplicationTracker", () => {
  it("lists saved jobs for this role, adds one and moves one to interview", async () => {
    render(<ApplicationTracker profileId="p1" roleId="data_analyst" />);
    expect(await screen.findByRole("link", { name: /Junior Data Analyst/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add a job" }));
    fireEvent.change(screen.getByLabelText("Job title"), { target: { value: "Data Analyst Intern" } });
    fireEvent.click(screen.getByRole("button", { name: "Save job" }));
    expect(await screen.findByText("Data Analyst Intern")).toBeTruthy();
    expect(addApplication).toHaveBeenCalledWith("p1", expect.objectContaining({ role_id: "data_analyst", title: "Data Analyst Intern" }));
    fireEvent.change(screen.getAllByLabelText("Status")[1], { target: { value: "interview" } });
    await vi.waitFor(() => expect(updateApplication).toHaveBeenCalledWith("p1", "a1", { status: "interview" }));
    expect(await screen.findByLabelText("Interview date")).toBeTruthy();
  });
});

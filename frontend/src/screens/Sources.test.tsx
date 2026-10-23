import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Sources } from "./Sources";

const { snapshots, fairness } = vi.hoisted(() => ({ snapshots: vi.fn(), fairness: vi.fn() }));
vi.mock("../lib/api", () => ({ api: { snapshots, fairness, exportData: vi.fn() } }));

const snap = (id: string, imported: string, illustrative = false) => ({ snapshot_id: id, source: "WEF Future of Jobs 2025", source_url: "",
  published: "2025-01-07", imported, horizon_year: 2030, illustrative, signal_count: 23, reviewed_by: null });

function setup() {
  snapshots.mockResolvedValue([snap("s3", "2026-10-22"), snap("s2", "2026-10-20"), snap("s1", "2026-10-19", true)]);
  fairness.mockResolvedValue({ passed: true, checks: 59, profiles: 3, cvs: 5, names: ["A", "B"], scenarios: [], failures: [], not_collected: ["age"], method: "" });
  render(<Sources profile={null} onDelete={() => {}} onReviewKit={() => {}} onAdmin={() => {}} />);
}

describe("Sources", () => {
  it("shows your data as short label rows with the full text one tap down", () => {
    setup();
    expect(screen.getByText("Your skills, job, goals and progress")).toBeInTheDocument();
    expect(screen.getByText(/They are read once in memory and then dropped/)).not.toBeVisible();
  });

  it("leads the sources with the forecast in use and filters the list by search", async () => {
    setup();
    fireEvent.click(screen.getByRole("tab", { name: "Data sources" }));
    expect(await screen.findByText("In use now", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Earlier versions (2)")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "O*NET" } });
    expect(screen.getByText("O*NET 30.0 · US Department of Labor")).toBeInTheDocument();
    expect(screen.queryByText("TalentCorp · MyCOL 2024/2025")).not.toBeInTheDocument();
  });
});

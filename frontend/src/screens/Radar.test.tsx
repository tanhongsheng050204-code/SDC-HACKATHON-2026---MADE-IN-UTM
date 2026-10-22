import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Profile } from "../lib/api";
import { Radar } from "./Radar";

// Snapshots approved at different times carry different fields: the radar must render all of them.
const { radar, updateProfile } = vi.hoisted(() => ({ radar: vi.fn(), updateProfile: vi.fn() }));
vi.mock("../lib/api", () => ({ api: { radar, updateProfile, skills: vi.fn(async () => []), malaysiaAiUse: vi.fn(async () => { throw new Error("offline"); }) } }));

const base = { snapshot_id: "s1", imported: "2026-10-22", source: "test", illustrative: false, scenarios: [] };

describe("Radar", () => {
  it("renders a snapshot with missing and odd fields instead of crashing", async () => {
    radar.mockResolvedValueOnce({
      ...base, inputs: undefined, capability_momentum: undefined,
      skills: [
        { skill_id: "sql", name: "SQL", trend: null, label: "rising", sources: undefined, mine: true,
          forecast: { horizon_year: 2030, history: [{ period: 2024, share_pct: 1 }, { period: "2025Q1", share_pct: 2 }], scenarios: {} } },
        { skill_id: "excel", name: "Excel", trend: -0.2, label: "declining", sources: ["x"], mine: false,
          forecast: { horizon_year: 2030, history: undefined,
            scenarios: { baseline: { change_pct: -30, low_pct: -50, high_pct: -10, label: "declining", sure: true } } } },
      ],
      roles: [{ role_id: "a", title: "Data analyst", index: 5, label: "growing", scenarios: { baseline: { index: 5, label: "growing" } }, malaysia: { history: undefined } },
              { role_id: "b", title: "Broken role", index: 1, label: "steady", scenarios: undefined, malaysia: null }],
      forecast: { method: "m", horizon_year: 2030, history: undefined, backtest: { model_error: undefined } },
    });
    render(<Radar profile={{ id: "p1", skills: ["sql"] } as unknown as Profile} onNext={() => {}} onPathway={() => {}} onProfile={() => {}} onFlash={() => {}} />);
    expect((await screen.findAllByText("SQL")).length).toBeGreaterThan(0);
    expect(screen.getByText("Excel")).toBeInTheDocument();
    expect(screen.getByText("Data analyst")).toBeInTheDocument();
  });

  it("leads with your skills and adds a rising skill from its detail", async () => {
    const band = (change_pct: number, label: string, sure = true) => ({ change_pct, low_pct: change_pct - 10, high_pct: change_pct + 10, label, sure });
    const fc = (b: ReturnType<typeof band>) => ({ horizon_year: 2030, emerging: false, growth_per_year: 0, ai_per_year: 0,
      history: [{ period: "2025Q1", share_pct: 1 }, { period: "2026Q1", share_pct: 1.2 }],
      scenarios: { slow: b, baseline: b, accelerated: b } });
    radar.mockResolvedValueOnce({
      ...base, inputs: [], capability_momentum: [], roles: [], forecast: null,
      skills: [
        { skill_id: "excel", name: "Excel", trend: 0, label: "steady", sources: [], mine: true, forecast: fc(band(-2, "steady", false)) },
        { skill_id: "genai", name: "Generative AI", trend: 1, label: "rising", sources: ["src"], mine: false, forecast: fc(band(244, "rising")) },
      ],
    });
    updateProfile.mockImplementation(async (p: Profile) => p);
    const onProfile = vi.fn();
    render(<Radar profile={{ id: "p1", skills: ["excel"] } as unknown as Profile} onNext={() => {}} onPathway={() => {}} onProfile={onProfile} onFlash={() => {}} />);
    expect(await screen.findByText("Your skills hold steady")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /\+ Generative AI/ }));
    expect(screen.getByRole("dialog", { name: "Generative AI" })).toBeInTheDocument();
    expect(screen.getByText("Could land anywhere from +234% to +254%.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add to my skills" }));
    await vi.waitFor(() => expect(onProfile).toHaveBeenCalled());
    expect(updateProfile.mock.calls[0][0].skills).toEqual(["excel", "genai"]);
  });
});

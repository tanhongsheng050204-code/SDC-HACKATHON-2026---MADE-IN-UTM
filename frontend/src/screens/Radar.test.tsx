import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Profile } from "../lib/api";
import { Radar } from "./Radar";

// Snapshots approved at different times carry different fields: the radar must render all of them.
const { radar } = vi.hoisted(() => ({ radar: vi.fn() }));
vi.mock("../lib/api", () => ({ api: { radar, malaysiaAiUse: vi.fn(async () => { throw new Error("offline"); }) } }));

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
    render(<Radar profile={{ id: "p1" } as Profile} onNext={() => {}} />);
    expect(await screen.findByText("SQL")).toBeInTheDocument();
    expect(screen.getByText("Excel")).toBeInTheDocument();
    expect(screen.getByText("Data analyst")).toBeInTheDocument();
  });
});

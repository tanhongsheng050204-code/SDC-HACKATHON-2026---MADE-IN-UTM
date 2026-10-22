import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RoleMatch } from "../lib/api";
import { SdgLens } from "./SdgLens";

const role = (id: string, rank: number, sdgs: number[], hours: number, fit: number, outlook: number) => ({
  role_id: id, title: id, rank, fit, plan_hours: hours, outlook: { baseline: { index: outlook, label: "growing" } },
  sdgs: sdgs.map((n) => ({ number: n, name: `Goal ${n}`, colour: "#336699" })),
}) as unknown as RoleMatch;

describe("SdgLens", () => {
  it("shows the trade-off of choosing for a goal without changing the ranking", () => {
    localStorage.clear();
    const roles = [role("Data analyst", 1, [8], 120, 0.6, 35), role("Renewable energy technician", 4, [7, 13], 300, 0.3, 40)];
    const onOpen = vi.fn(); const onOnly = vi.fn();
    render(<SdgLens roles={roles} scenario="baseline" onOpen={onOpen} onlyGoal={null} onOnlyGoal={onOnly} />);
    fireEvent.click(screen.getByRole("radio", { name: /Goal 13/ }));
    expect(screen.getByText(/1 of your top 10 roles serve SDG 13 Goal 13/)).toBeInTheDocument();
    expect(screen.getByText(/best role for this goal is Renewable energy technician \(#4\)/)).toBeInTheDocument();
    expect(screen.getByText("Study: 300 hours instead of 120 for Data analyst")).toBeInTheDocument();
    expect(screen.getByText("Skill fit now: 30% instead of 60%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Renewable energy technician" }));
    expect(onOpen).toHaveBeenCalledWith(roles[1]);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onOnly).toHaveBeenCalledWith(13);
  });
});

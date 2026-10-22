import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Profile, RoleMatch } from "../lib/api";
import { ReplanCard } from "./ReplanCard";

const { replan } = vi.hoisted(() => ({ replan: vi.fn() }));
vi.mock("../lib/api", () => ({ api: { replan } }));

describe("ReplanCard", () => {
  it("says what the new forecast moved, offers the new best fit, and hides after Got it", async () => {
    localStorage.clear();
    replan.mockResolvedValue({
      changed: true, to_snapshot: { id: "s2", imported: "2026-10-22", source: "x" }, from_snapshot: { id: "s1", imported: "2026-10-20" },
      moves: [{ role_id: "data_analyst", title: "Data analyst", before: 2, after: 5 }],
      destination: { role_id: "data_analyst", title: "Data analyst", rank_before: 2, rank_after: 5, outlook_before: 30, outlook_after: 10, label_before: "growing", label_after: "steady" },
      new_top: { role_id: "ai_ops", title: "AI operations specialist" },
    });
    const onOpen = vi.fn();
    const roles = [{ role_id: "ai_ops", title: "AI operations specialist" }] as RoleMatch[];
    render(<ReplanCard profile={{ id: "p1", target_role_id: "data_analyst" } as Profile} roles={roles} onOpenRole={onOpen} />);
    expect(await screen.findByText("Your recommendations were updated")).toBeInTheDocument();
    expect(screen.getByText(/Your destination Data analyst is now #5 \(was #2\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open AI operations specialist" }));
    expect(onOpen).toHaveBeenCalledWith(roles[0]);
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByText("Your recommendations were updated")).toBeNull();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Profile } from "../lib/api";
import { GlobalSearch } from "./GlobalSearch";

vi.mock("../lib/api", () => ({ api: { matches: vi.fn(async () => ({ roles: [
  { role_id: "da", title: "Data analyst", rank: 5, fit: 0.35 }, { role_id: "cs", title: "Cashier", rank: 21, fit: 0.55 }] })) } }));

describe("GlobalSearch", () => {
  it("jumps to a matching role, and sends anything else to the coach", async () => {
    const onOpenRole = vi.fn(), onAsk = vi.fn();
    render(<GlobalSearch profile={{ id: "p1" } as Profile} scenario="baseline" onOpenRole={onOpenRole} onAsk={onAsk} />);
    const box = screen.getAllByRole("combobox")[0];
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "data" } });
    fireEvent.click(await screen.findByRole("option", { name: /Data analyst/ }));
    expect(onOpenRole).toHaveBeenCalledWith(expect.objectContaining({ role_id: "da" }));
    fireEvent.change(box, { target: { value: "Which role pays more?" } });
    fireEvent.submit(box.closest("form")!);
    expect(onAsk).toHaveBeenCalledWith("Which role pays more?");
  });
});

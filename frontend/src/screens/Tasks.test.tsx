import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Profile } from "../lib/api";
import { Tasks } from "./Tasks";

const { roles, tasks } = vi.hoisted(() => ({ roles: vi.fn(), tasks: vi.fn() }));
vi.mock("../lib/api", () => ({ api: { roles, tasks } }));

const TASKS = [
  { id: "a", text: "Receive payment by cash.", short: "Take payments", short_reason: "Self-checkout", label: "automate", reason: "Kiosks.", reviewed_by: null, observed: null },
  { id: "b", text: "Scan prices.", short: "Scan items", label: "automate", reason: "Scanners.", reviewed_by: null, observed: null },
  { id: "c", text: "Greet customers entering establishments.", short: "Greet customers", label: "human", reason: "Warmth.", reviewed_by: null, observed: null },
];
const body = (done: string[]) => {
  const counted = done.length ? TASKS.filter((x) => done.includes(x.id)) : TASKS;
  const share = (l: string) => counted.filter((x) => x.label === l).length / counted.length;
  return { role_id: "cashier", onet_code: "41-2011.00", onet_note: null, source: "O*NET", source_url: "", labels_note: "",
    tasks: TASKS, counted: counted.length, shares: { automate: share("automate"), assist: share("assist"), human: share("human") },
    reviewed: 0, observed_source: { name: "AEI", url: "", month: "", licence: "" } };
};

function setup() {
  roles.mockResolvedValue([{ id: "cashier", title: "Cashier" }]);
  tasks.mockImplementation(async (_: string, done: string[]) => body(done));
  sessionStorage.clear();
  render(<Tasks profile={{ id: "p1", current_role_id: "cashier" } as Profile} onNext={() => {}} onPathway={() => {}} onAsk={() => {}} />);
}

describe("Tasks", () => {
  it("leads with a verdict and short task titles, keeping the O*NET text behind Why?", async () => {
    setup();
    expect(await screen.findByText("A big part of this work is changing")).toBeInTheDocument();
    expect(screen.getByText("Take payments")).toBeInTheDocument();
    expect(screen.queryByText(/Receive payment by cash/)).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Why?" })[0]);
    expect(screen.getByText(/Receive payment by cash/)).toBeInTheDocument();
  });

  it("personalises the result from the card sort", async () => {
    setup();
    await screen.findByText("Take payments");
    fireEvent.click(screen.getByRole("button", { name: /Make it about me/ }));
    fireEvent.click(screen.getByRole("button", { name: /^No/ }));
    fireEvent.click(screen.getByRole("button", { name: /^No/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Yes/ }));
    expect(await screen.findByText("Most of this work stays with people")).toBeInTheDocument();
    expect(tasks).toHaveBeenLastCalledWith("cashier", ["c"]);
  });
});

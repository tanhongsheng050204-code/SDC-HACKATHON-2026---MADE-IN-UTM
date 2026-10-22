import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EvidencePanel } from "./EvidencePanel";

const { api } = vi.hoisted(() => {
  const roles = [
    { id: "r1", role_id: "data_analyst", title: "Data analyst", searched: "2026-10-22", widened: false, job_ads: 30, pages: 30, added: [], added_names: [] },
    { id: "r2", role_id: "accounts_clerk", title: "Accounts clerk", searched: "2026-10-22", widened: false, job_ads: 25, pages: 25, added: [], added_names: [] },
    { id: "r3", role_id: "nurse", title: "Nurse", searched: "2026-10-22", widened: false, job_ads: 12, pages: 12, added: [], added_names: [] },
  ];
  const api = {
    evidencePending: vi.fn(async () => roles),
    emergingPending: vi.fn(async () => []),
    dayPending: vi.fn(async () => []),
    evidenceDecide: vi.fn(async (_t: string, id: string, _decision: string, _body: object) => {
      const i = roles.findIndex((r) => r.id === id);
      if (i >= 0) roles.splice(i, 1);
      return { id, role_id: id };
    }),
  };
  return { api };
});
vi.mock("../lib/api", () => ({ api }));

describe("EvidencePanel bulk review", () => {
  beforeEach(() => {
    sessionStorage.setItem("laluan.adminToken", "local-review-test-token");
    localStorage.setItem("laluan.reviewer", "Aisyah");
  });

  it("approves the ticked roles together and leaves the rest waiting", async () => {
    const onDone = vi.fn(async () => {});
    render(<EvidencePanel onDone={onDone} />);
    fireEvent.click(await screen.findByLabelText("Select Data analyst"));
    fireEvent.click(screen.getByLabelText("Select Nurse"));
    const bar = screen.getByRole("group", { name: "Decide the selected items" });
    fireEvent.click(within(bar).getByRole("button", { name: "Approve 2 selected" }));
    expect(await screen.findByText("Approved 2 items, by Aisyah.")).toBeInTheDocument();
    expect(api.evidenceDecide.mock.calls.map((c) => [c[1], c[2]])).toEqual([["r1", "approve"], ["r3", "approve"]]);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Select Accounts clerk")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Decide the selected items" })).not.toBeInTheDocument();
  });

  it("needs a reason before rejecting the ticked rows", async () => {
    render(<EvidencePanel onDone={vi.fn(async () => {})} />);
    fireEvent.click(await screen.findByLabelText("Select all roles"));
    const bar = screen.getByRole("group", { name: "Decide the selected items" });
    const reject = within(bar).getByRole("button", { name: /Reject \d selected/ });
    expect(reject).toBeDisabled();
    fireEvent.change(within(bar).getByLabelText(/Reason/), { target: { value: "ads are from Singapore" } });
    expect(reject).toBeEnabled();
    fireEvent.click(reject);
    await waitFor(() => expect(api.evidenceDecide).toHaveBeenLastCalledWith(
      "local-review-test-token", expect.any(String), "reject", { reviewer: "Aisyah", reason: "ads are from Singapore" }));
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CoachReply, Profile } from "../lib/api";
import { Coach } from "./Coach";

const reply: CoachReply = {
  answer: "Your top roles under the Baseline scenario are listed [SOURCE-1].", mode: "gemini",
  sources: [{ id: "SOURCE-1", text: "Your top roles under the Baseline scenario: #1 Data analyst." }],
  grounding: { sentences: 1, supported: 1, unsupported: [], all_supported: true },
  proposal: null, suggestions: [], removed: { PHONE: 1 }, revised: true, dropped: 1,
};

vi.mock("../lib/api", () => ({ api: { coach: vi.fn(async () => reply), health: vi.fn(async () => ({ voice: false })) } }));

describe("Coach", () => {
  it("shows a corrected answer with the self-check note and what was removed from the question", async () => {
    render(<Coach profile={{ id: "p1" } as Profile} scenario="baseline" onApply={async () => {}} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Ask about your results"), { target: { value: "Call 012-345 6789, which job?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    // The [SOURCE-1] tag is shown as a small "[1]" that matches the numbered source list.
    expect(await screen.findByText(/Your top roles under the Baseline scenario are listed/)).toBeInTheDocument();
    expect(screen.getByText("[1]")).toHaveClass("coach-cite");
    expect(screen.queryByText(/SOURCE-1/)).toBeNull();
    expect(screen.getByText(/Checked and corrected against your sources/)).toBeInTheDocument();
    expect(screen.getByText(/1 unsupported sentence removed/)).toBeInTheDocument();
    expect(screen.getByText(/1 phone number/)).toBeInTheDocument();
  });

  it("says to slow down, not that the coach is offline, after a 429", async () => {
    const { api } = await import("../lib/api");
    vi.mocked(api.coach).mockRejectedValueOnce(new Error("429 {\"detail\":\"slow\"}"));
    render(<Coach profile={{ id: "p1" } as Profile} scenario="baseline" onApply={async () => {}} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Ask about your results"), { target: { value: "Which job?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByText(/going a bit fast/)).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<Coach profile={{ id: "p1" } as Profile} scenario="baseline" onApply={async () => {}} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});

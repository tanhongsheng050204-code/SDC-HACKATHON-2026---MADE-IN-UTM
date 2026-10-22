import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Profile } from "../lib/api";
import { Review } from "./Review";

const { skills, roles, updateProfile } = vi.hoisted(() => ({ skills: vi.fn(), roles: vi.fn(), updateProfile: vi.fn() }));
vi.mock("../lib/api", () => ({ api: { skills, roles, updateProfile } }));

const PROFILE = { id: "p1", display_name: "Aisyah", skills: ["customer_service"], audience: "worker", current_role_id: "cashier",
  experience_years: 2 } as unknown as Profile;

function setup(onSaved = vi.fn()) {
  skills.mockResolvedValue([
    { id: "customer_service", name: "Customer service", category: "people" },
    { id: "excel", name: "Spreadsheets (Excel / Google Sheets)", category: "digital", aliases: ["vlookup"] },
    { id: "pos", name: "Point-of-sale operations", category: "retail" },
  ]);
  roles.mockResolvedValue([{ id: "cashier", title: "Cashier", skills: [{ skill_id: "pos", weight: 3 }, { skill_id: "customer_service", weight: 3 }] }]);
  render(<Review initial={PROFILE.skills} audience="worker" existing={PROFILE} onSaved={onSaved} onBack={() => {}} />);
  return onSaved;
}

describe("My profile", () => {
  it("sums the person up in one sentence and suggests the job's skills", async () => {
    setup();
    expect(await screen.findByText("Often used by a cashier:")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Current or most recent job" })).toHaveValue("cashier");
    expect(screen.getByRole("spinbutton", { name: "Years of work experience" })).toHaveValue(2);
    expect(screen.getByRole("button", { name: "+ Point-of-sale operations" })).toBeInTheDocument();
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("finds a skill by its nickname and shows one save bar until saved or undone", async () => {
    setup();
    await screen.findByText("Customer service");
    const box = screen.getByRole("combobox", { name: "Add a skill" });
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "vlookup" } });
    fireEvent.click(screen.getByRole("option", { name: /Spreadsheets/ }));
    expect(screen.getByText("Spreadsheets (Excel / Google Sheets)")).toBeInTheDocument();
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
    expect(screen.queryByText("Spreadsheets (Excel / Google Sheets)")).not.toBeInTheDocument();
  });

  it("saves the changed skills from the save bar", async () => {
    updateProfile.mockImplementation(async (p: Profile) => p);
    const onSaved = setup();
    fireEvent.click(await screen.findByRole("button", { name: "+ Point-of-sale operations" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(updateProfile.mock.calls[0][0].skills).toEqual(["customer_service", "pos"]);
  });
});

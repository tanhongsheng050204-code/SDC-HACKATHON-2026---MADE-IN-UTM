import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EmailSettingsReply, Profile } from "../lib/api";
import { EmailSettings } from "./EmailSettings";

let reply: EmailSettingsReply = { available: true, logged_in: true, email: "siti@example.com", settings: null };
const save = vi.fn(async (_id: string, body: { digest: boolean; alerts: string }) =>
  ({ ...reply, settings: { ...body, state: "selangor", language: "en" } }));
vi.mock("../lib/api", () => ({ api: {
  emailSettings: vi.fn(async () => reply),
  saveEmailSettings: (id: string, body: { digest: boolean; alerts: string }) => save(id, body),
} }));
vi.mock("../lib/auth", () => ({ authEnabled: true, signIn: vi.fn(), signOut: vi.fn() }));

const profile = { id: "p1", completed_courses: [] } as unknown as Profile;

describe("EmailSettings", () => {
  it("is off by default; weekly job ads need the weekly email; saving sends the choices", async () => {
    render(<EmailSettings profile={profile} userId="user-1" />);
    const digest = await screen.findByRole("checkbox", { name: /Email me a weekly summary/ });
    expect(digest).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "In my weekly email" })).toBeDisabled();
    fireEvent.click(digest);
    fireEvent.click(screen.getByRole("radio", { name: /as they appear/ }));
    fireEvent.change(screen.getByLabelText("Where"), { target: { value: "selangor" } });
    fireEvent.click(screen.getByRole("button", { name: "Save email choices" }));
    expect(await screen.findByText(/one-click unsubscribe/)).toBeInTheDocument();
    expect(save).toHaveBeenCalledWith("p1", { digest: true, alerts: "instant", state: "selangor", language: "en" });
    expect(screen.getByText(/siti@example.com/)).toBeInTheDocument();
  });

  it("asks anonymous visitors to log in, and says when email isn't set up", async () => {
    reply = { available: true, logged_in: false, email: null, settings: null };
    const { unmount } = render(<EmailSettings profile={profile} userId={null} />);
    expect(await screen.findByText(/Log in with Google to get emails/)).toBeInTheDocument();
    unmount();
    reply = { available: false, logged_in: true, email: "a@b.my", settings: null };
    render(<EmailSettings profile={profile} userId="u" />);
    expect(await screen.findByText(/isn't set up on this server/)).toBeInTheDocument();
  });
});

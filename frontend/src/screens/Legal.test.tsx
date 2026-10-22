import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Legal } from "./Legal";

let contact: string | null = null;
vi.mock("../lib/api", () => ({ api: { health: async () => ({ contact }) } }));

describe("Legal", () => {
  it("the privacy notice is marked as a draft and names the PDPA, what we keep and how long", async () => {
    contact = null;
    render(<Legal doc="privacy" />);
    expect(screen.getByRole("heading", { level: 1, name: "Privacy notice" })).toBeTruthy();
    expect(screen.getByText(/not legal advice/)).toBeTruthy();
    expect(screen.getByText(/Personal Data Protection Act 2010/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "What we keep" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "How long we keep it" })).toBeTruthy();
    expect(await screen.findByText(/use Report a problem in Settings/)).toBeTruthy();
  });

  it("shows the team's contact email when the server has one", async () => {
    contact = "team@example.org";
    render(<Legal doc="terms" />);
    expect(screen.getByRole("heading", { level: 1, name: "Terms of use" })).toBeTruthy();
    expect(screen.getByText(/practice for you, not a certificate/)).toBeTruthy();
    expect((await screen.findByRole("link", { name: "team@example.org" })).getAttribute("href")).toBe("mailto:team@example.org");
  });
});

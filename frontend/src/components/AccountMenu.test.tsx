import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountMenu } from "./AccountButton";

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("../lib/auth", () => ({ authEnabled: true, signIn: vi.fn(), signOut }));

describe("AccountMenu", () => {
  it("shows a log-in button when signed out", () => {
    render(<AccountMenu userId={null} name={null} />);
    expect(screen.getByRole("button", { name: "Log in with Google" })).toBeInTheDocument();
  });

  it("shows the initial when signed in, and Log out inside the menu", () => {
    render(<AccountMenu userId="u1" name="Hong Sheng Tan" />);
    expect(screen.getByText("H")).toBeInTheDocument();
    fireEvent.click(screen.getByText("H"));
    expect(screen.getByText("Hong Sheng Tan")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(signOut).toHaveBeenCalled();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Helpful } from "./Helpful";

const feedback = vi.fn(async () => undefined);
vi.mock("../lib/api", () => ({ api: { feedback: (...a: unknown[]) => feedback(...(a as [])) } }));

describe("Helpful", () => {
  it("sends thumbs down with a reason and a note, without any profile ID", async () => {
    render(<Helpful target="role_advice" subject="data_analyst" />);
    fireEvent.click(screen.getByRole("button", { name: /No/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Something is wrong" }));
    fireEvent.change(screen.getByPlaceholderText(/Anything to add/), { target: { value: "Hours look off" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/Thanks, that helps/)).toBeInTheDocument();
    expect(feedback).toHaveBeenCalledWith({ target: "role_advice", subject: "data_analyst", helpful: false, reason: "wrong",
      note: "Hours look off", language: "en" });
  });
});

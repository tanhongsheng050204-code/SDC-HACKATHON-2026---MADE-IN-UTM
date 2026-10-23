import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Intake } from "./Intake";

vi.mock("../lib/api", () => ({
  api: {
    previewUpload: vi.fn(async () => ({ text: "[NAME] / Marketing Manager", removed: { NAME: 1 }, characters: 26, from_scan: true })),
    extract: vi.fn(async () => ({ skills: ["seo", "content_writing"], unmatched: [], mode: "dictionary" })),
    health: vi.fn(async () => ({ voice: false })),
  },
}));

const cv = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "image.png", { type: "image/png" });

async function openUpload(onDone: (skills: string[]) => void) {
  render(<Intake audience="worker" onAudience={() => {}} onDone={onDone} />);
  fireEvent.click(await screen.findByRole("radio", { name: /I.m working/ }));
  fireEvent.click(await screen.findByRole("button", { name: /Upload a CV/ }));
}

describe("Intake: a designed CV as a file", () => {
  it("reads a screenshot pasted with Ctrl+V like an upload", async () => {
    const onDone = vi.fn();
    await openUpload(onDone);
    const { api } = await import("../lib/api");
    const file = cv();
    fireEvent.paste(window, { clipboardData: { files: [file] } });
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(["seo", "content_writing"]));
    expect(api.previewUpload).toHaveBeenCalledWith(file);
  });

  it("reads a file dropped on the upload box", async () => {
    const onDone = vi.fn();
    await openUpload(onDone);
    fireEvent.drop(screen.getByText("Upload your CV").closest(".dropzone")!, { dataTransfer: { files: [cv()] } });
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });
});

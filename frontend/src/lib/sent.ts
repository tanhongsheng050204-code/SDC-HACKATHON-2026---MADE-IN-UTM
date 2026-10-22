import type { SendPreview } from "./api";

// What an uploaded CV sent to the AI (already scrubbed), handed from the upload step to the
// "Check your skills" screen, which shows it once in a collapsed note. Kept in memory only.
let last: SendPreview | null = null;

export function setSent(preview: SendPreview | null) {
  last = preview;
}

/** The last upload's scrubbed text, once: the next call returns null. */
export function takeSent(): SendPreview | null {
  const sent = last;
  last = null;
  return sent;
}

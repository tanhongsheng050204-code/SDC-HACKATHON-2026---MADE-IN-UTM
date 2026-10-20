import type { Scenario, TaskLabel } from "./api";

export const SCENARIOS: { id: Scenario; label: string }[] = [
  { id: "slow", label: "Slow" },
  { id: "baseline", label: "Baseline" },
  { id: "accelerated", label: "Accelerated" },
];

// Outlook is never colour alone: each label has a word and an arrow (UI brief).
export const OUTLOOK_TONE: Record<string, string> = { emerging: "good", growing: "good", stable: "", declining: "risk" };
export const OUTLOOK_TEXT: Record<string, string> = {
  emerging: "▲ Emerging", growing: "▲ Growing", stable: "▬ Stable", declining: "▼ Declining",
};
export const HEAT: Record<string, string> = { emerging: "hm-good", growing: "hm-good", stable: "hm-stable", declining: "hm-risk" };

export const TREND_TEXT: Record<string, string> = { rising: "▲ Rising", steady: "▬ Steady", declining: "▼ Declining", no_data: "No data" };

export const COST: Record<string, { label: string; tone: string }> = {
  free: { label: "Free", tone: "good" },
  free_audit: { label: "Free to audit", tone: "good" },
  paid: { label: "Paid", tone: "gold" },
};

export const HRD: Record<string, { label: string; tone: string }> = {
  claimable: { label: "HRD Corp claimable", tone: "good" },
  check: { label: "HRD Corp: ask the provider", tone: "" },
};

export function priceText(price: number | null | undefined, cost: string) {
  if (price === 0) return cost === "free_audit" ? "Free to audit" : "Free";
  if (price == null) return "Paid · ask for the price";
  return `Paid · RM ${price.toLocaleString("en-MY", { minimumFractionDigits: price % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

export const TASK_LABEL: Record<TaskLabel, { text: string; tone: string; help: string }> = {
  automate: { text: "AI likely to automate", tone: "risk", help: "Software can already do most of this." },
  assist: { text: "AI assists you", tone: "gold", help: "AI speeds it up; you stay in charge." },
  human: { text: "Stays human", tone: "good", help: "Needs judgement, presence or trust." },
};

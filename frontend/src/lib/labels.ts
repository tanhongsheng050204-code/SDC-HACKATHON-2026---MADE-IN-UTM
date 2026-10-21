import type { Scenario, TaskLabel } from "./api";
import { t, type StringKey } from "./i18n";

// Labels are read through t() each time, so they follow the chosen language.
const live = <T,>(make: (key: string) => T): Record<string, T> =>
  new Proxy({} as Record<string, T>, { get: (_, key) => (typeof key === "string" ? make(key) : undefined) });

export const SCENARIOS: { id: Scenario; readonly label: string }[] = (["slow", "baseline", "accelerated"] as const)
  .map((id) => ({ id, get label() { return t(`sc.${id}`); } }));

// Outlook is never colour alone: each label has a word and an arrow (UI brief).
export const OUTLOOK_TONE: Record<string, string> = { emerging: "good", growing: "good", stable: "", declining: "risk" };
export const OUTLOOK_TEXT = live((label) => t(`out.${label}` as StringKey) ?? label);
export const HEAT: Record<string, string> = { emerging: "hm-good", growing: "hm-good", stable: "hm-stable", declining: "hm-risk" };

export const TREND_TEXT = live((label) => t(`trend.${label}` as StringKey) ?? label);

const COST_TONE: Record<string, string> = { free: "good", free_audit: "good", paid: "gold" };
export const COST = live((id) => (id in COST_TONE ? { label: t(`cost.${id}` as StringKey), tone: COST_TONE[id] } : undefined)) as
  Record<string, { label: string; tone: string } | undefined>;

const HRD_TONE: Record<string, string> = { claimable: "good", check: "" };
export const HRD = live((id) => (id in HRD_TONE ? { label: t(`hrd.${id}` as StringKey), tone: HRD_TONE[id] } : undefined)) as
  Record<string, { label: string; tone: string } | undefined>;

export function priceText(price: number | null | undefined, cost: string) {
  if (price === 0) return cost === "free_audit" ? t("cost.free_audit") : t("cost.free");
  if (price == null) return t("cost.askPrice");
  return `${t("cost.paid")} · RM ${price.toLocaleString("en-MY", { minimumFractionDigits: price % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

const TASK_TONE: Record<TaskLabel, string> = { automate: "risk", assist: "gold", human: "good" };
export const TASK_LABEL = live((id) => ({ text: t(`task.${id}` as StringKey), tone: TASK_TONE[id as TaskLabel], help: t(`task.${id}Help` as StringKey) })) as
  Record<TaskLabel, { text: string; tone: string; help: string }>;


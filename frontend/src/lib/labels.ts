import type { Scenario, TaskLabel } from "./api";
import { StringKey, t } from "./i18n";

// Labels shown on many screens. Each is read through t() when it is used (getters), so it
// follows the chosen language without changing any call site.
function translated<K extends string>(keys: Record<K, StringKey>): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const k of Object.keys(keys) as K[]) Object.defineProperty(out, k, { get: () => t(keys[k]), enumerable: true });
  return out;
}

export const SCENARIOS: { id: Scenario; label: string }[] = (["slow", "baseline", "accelerated"] as Scenario[]).map((id) => {
  const s = { id } as { id: Scenario; label: string };
  Object.defineProperty(s, "label", { get: () => t(`sc.${id}` as StringKey), enumerable: true });
  return s;
});

// Outlook is never colour alone: each label has a word and an arrow (UI brief).
export const OUTLOOK_TONE: Record<string, string> = { emerging: "good", growing: "good", stable: "", declining: "risk" };
export const OUTLOOK_TEXT: Record<string, string> = translated({
  emerging: "lbl.emerging", growing: "lbl.growing", stable: "lbl.stable", declining: "lbl.declining",
});
export const HEAT: Record<string, string> = { emerging: "hm-good", growing: "hm-good", stable: "hm-stable", declining: "hm-risk" };

export const TREND_TEXT: Record<string, string> = translated({
  rising: "lbl.rising", steady: "lbl.steady", declining: "lbl.declining", no_data: "lbl.noData",
});

const withLabel = (key: StringKey, tone: string) => {
  const o = { tone } as { label: string; tone: string };
  Object.defineProperty(o, "label", { get: () => t(key), enumerable: true });
  return o;
};

export const COST: Record<string, { label: string; tone: string }> = {
  free: withLabel("lbl.free", "good"), free_audit: withLabel("lbl.freeAudit", "good"), paid: withLabel("lbl.paid", "gold"),
};

export const HRD: Record<string, { label: string; tone: string }> = {
  claimable: withLabel("lbl.hrdClaimable", "good"), check: withLabel("lbl.hrdCheck", ""),
};

export function priceText(price: number | null | undefined, cost: string) {
  if (price === 0) return cost === "free_audit" ? t("lbl.freeAudit") : t("lbl.free");
  if (price == null) return t("lbl.paidAsk");
  return `${t("lbl.paid")} · RM ${price.toLocaleString("en-MY", { minimumFractionDigits: price % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

const task = (text: StringKey, tone: string, help: StringKey) => {
  const o = { tone } as { text: string; tone: string; help: string };
  Object.defineProperty(o, "text", { get: () => t(text), enumerable: true });
  Object.defineProperty(o, "help", { get: () => t(help), enumerable: true });
  return o;
};

export const TASK_LABEL: Record<TaskLabel, { text: string; tone: string; help: string }> = {
  automate: task("lbl.automate", "risk", "lbl.automateHelp"),
  assist: task("lbl.assist", "gold", "lbl.assistHelp"),
  human: task("lbl.human", "good", "lbl.humanHelp"),
};

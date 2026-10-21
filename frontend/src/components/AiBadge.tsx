import { t } from "../lib/i18n";

// Says who wrote a piece of text: the AI model (checked against sources), plain rules, or a
// safety check that stopped the request. Modes come straight from the API responses.
export function AiBadge({ mode }: { mode: string }) {
  const m = mode.toLowerCase();
  const kind = m === "blocked" ? "blocked" : m.includes("gemini") && !m.includes("skipped") ? "ai" : "rules";
  const label = { ai: t("badge.ai"), rules: t("badge.rules"), blocked: t("badge.blocked") }[kind];
  return <span className={`badge ai-badge ${kind}`} title={mode}>{kind === "ai" ? "✦ " : kind === "blocked" ? "⛉ " : "⚙ "}{label}</span>;
}

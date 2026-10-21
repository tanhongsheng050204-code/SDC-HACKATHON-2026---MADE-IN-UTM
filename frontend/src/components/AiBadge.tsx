import { t } from "../lib/i18n";

// Says who wrote a piece of text: the AI model, plain rules, or a safety check that stopped the
// request. Modes come straight from the API responses. `grounded` is false where the text is not
// checked against sources (interview feedback), so the badge doesn't claim it is.
export function AiBadge({ mode, grounded = true }: { mode: string; grounded?: boolean }) {
  const m = mode.toLowerCase();
  const kind = m === "blocked" ? "blocked" : m.includes("gemini") && !m.includes("skipped") ? "ai" : "rules";
  const label = { ai: grounded ? t("badge.ai") : t("badge.aiPlain"), rules: t("badge.rules"), blocked: t("badge.blocked") }[kind];
  return <span className={`badge ai-badge ${kind}`} title={mode}>{kind === "ai" ? "✦ " : kind === "blocked" ? "⛉ " : "⚙ "}{label}</span>;
}

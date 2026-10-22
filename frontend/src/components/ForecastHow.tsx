import type { Matches } from "../lib/api";
import { t, tf } from "../lib/i18n";

// The three AI-exposure studies the team checked its automation and AI-use estimates against
// (backend/data/ai_exposure.json).
const EXPOSURE = [
  { name: "ILO Working Paper 140 (Gmyrek et al., 2025)", url: "https://www.ilo.org/publications/generative-ai-and-jobs-refined-global-index-occupational-exposure" },
  { name: "OpenAI, “GPTs are GPTs” (Eloundou et al., 2023)", url: "https://github.com/openai/GPTs-are-GPTs" },
  { name: "Anthropic Economic Index", url: "https://huggingface.co/datasets/Anthropic/EconomicIndex" },
];

// "How is this worked out?" for the scenario buttons, the adoption slider and the year: every
// step in plain words, with the formula (backend/app/services/scenario.py) and its sources.
export function ForecastHow({ data }: { data: Matches }) {
  const src = data.signal_source;
  const horizon = data.year_range[1];
  return (
    <details className="card forecast-how">
      <summary>{t("how.title")}</summary>
      <ol>
        <li>
          <strong>{t("how.startTitle")}</strong>{" "}
          {tf("how.start", { year: horizon })}{" "}
          <a href={src.source_url} target="_blank" rel="noreferrer">{src.source}</a>
          {src.published && <> ({tf("how.published", { date: src.published })})</>}.
        </li>
        <li>
          <strong>{t("how.scenarioTitle")}</strong> {t("how.scenario")}
          <code className="how-formula">{t("how.formula")}</code>
          <span className="muted">{t("how.estimates")}</span>{" "}
          {EXPOSURE.map((s, i) => (
            <span key={s.url}>{i > 0 && " · "}<a href={s.url} target="_blank" rel="noreferrer">{s.name}</a></span>
          ))}
        </li>
        <li><strong>{t("how.yearTitle")}</strong> {tf("how.year", { year: horizon })}</li>
        <li><strong>{t("how.rankTitle")}</strong> {t("how.rank")}</li>
      </ol>
      <p className="muted">{t("how.limits")}</p>
    </details>
  );
}

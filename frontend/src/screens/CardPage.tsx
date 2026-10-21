import { useEffect, useState } from "react";
import { PayLine } from "../components/PayLine";
import { levelName, t } from "../lib/i18n";
import { LogoMark } from "../components/Brand";
import { Sdgs } from "../components/Sdgs";
import { api, FutureCard } from "../lib/api";
import { percent, signed } from "../lib/format";
import { OUTLOOK_TEXT, OUTLOOK_TONE } from "../lib/labels";

// S8: the read-only Future Card opened from a shared link or QR code (/?card=ID).
export function CardPage({ cardId }: { cardId: string }) {
  const [card, setCard] = useState<FutureCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.card(cardId).then(setCard).catch((e) => setError(e instanceof Error && e.message.startsWith("404")
      ? "This Future Card no longer exists. Its owner may have deleted their profile."
      : "Can't reach Laluan right now. Try again in a moment."));
  }, [cardId]);

  return (
    <div className="site">
      <nav className="site-nav" aria-label="Main">
        <a className="brand" href={window.location.pathname} aria-label="Laluan home"><LogoMark /><span>Laluan</span></a>
      </nav>
      <main className="card-page">
        {error && <div className="banner error" role="alert">{error}</div>}
        {!card && !error && <p className="muted">Loading the card…</p>}
        {card && (
          <article className="future-card card">
            <p className="eyebrow">Future Card{card.display_name ? ` · ${card.display_name}` : ""}</p>
            <h1>Moving toward {card.role.title}</h1>
            <p className="muted">{card.role.summary}</p>
            {card.identity && <blockquote className="card-identity">{card.identity}</blockquote>}
            <div className="kpis">
              <div className="kpi"><span className="kpi-label">Readiness</span><strong>{percent(card.readiness)}%</strong>
                <span className="badge">skills already covered</span></div>
              <div className="kpi"><span className="kpi-label">Outlook to {card.estimate_range.horizon_year}</span><strong>{signed(card.outlook.index)}%</strong>
                <span className={`badge ${OUTLOOK_TONE[card.outlook.label]}`}>{OUTLOOK_TEXT[card.outlook.label]}</span></div>
              <div className="kpi"><span className="kpi-label">Plan</span><strong>{card.steps} steps</strong>
                <span className="badge">about {card.hours} hours left</span></div>
            </div>
            {card.robust_pick && <p><span className="badge gold">Robust pick</span> Stays in the top five under every AI-adoption scenario.</p>}
            <PayLine pay={card.pay} change={card.pay_change_rm} />
            {card.proven && card.proven.length > 0 && (
              <div><h3>{t("card.proven")}</h3><div className="chips">
                {card.proven.map((p) => <span key={p.name} className="chip covered">✓ {p.name} · {levelName(p.level)}</span>)}
              </div></div>
            )}
            <p className="muted">Range across scenarios: {signed(card.estimate_range.low)}% to {signed(card.estimate_range.high)}% jobs. An estimate, not a prediction.</p>
            {card.next_skills.length > 0 && <p><strong>Next skills:</strong> {card.next_skills.join(", ")}</p>}
            {card.first_step && <p><strong>First step:</strong> {card.first_step}</p>}
            <Sdgs sdgs={card.sdgs} />
            <p className="source">Outlook source: {card.source.snapshot_id}, imported {card.source.imported}. Card created {card.created_at.slice(0, 10)}; figures update when the data does.</p>
            <a className="btn ink" href={window.location.pathname}>Make your own plan</a>
          </article>
        )}
      </main>
    </div>
  );
}

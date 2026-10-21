import { useEffect, useState } from "react";
import { PayLine } from "../components/PayLine";
import { levelName, t, tf, tr } from "../lib/i18n";
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
      ? t("fc.gone")
      : t("fc.offline")));
  }, [cardId]);

  return (
    <div className="site">
      <nav className="site-nav" aria-label={t("nav.main")}>
        <a className="brand" href={window.location.pathname} aria-label={t("nav.homeAria")}><LogoMark /><span>Laluan</span></a>
      </nav>
      <main className="card-page">
        {error && <div className="banner error" role="alert">{error}</div>}
        {!card && !error && <p className="muted">{t("fc.loading")}</p>}
        {card && (
          <article className="future-card card">
            <p className="eyebrow">{t("share.title")}{card.display_name ? ` · ${card.display_name}` : ""}</p>
            <h1>{tf("fc.toward", { role: tr(card.role.title) })}</h1>
            <p className="muted">{tr(card.role.summary)}</p>
            {card.identity && <blockquote className="card-identity">{card.identity}</blockquote>}
            <div className="kpis">
              <div className="kpi"><span className="kpi-label">{t("path.readiness")}</span><strong>{percent(card.readiness)}%</strong>
                <span className="badge">{t("fc.covered")}</span></div>
              <div className="kpi"><span className="kpi-label">{tf("fc.outlookTo", { year: card.estimate_range.horizon_year })}</span><strong>{signed(card.outlook.index)}%</strong>
                <span className={`badge ${OUTLOOK_TONE[card.outlook.label]}`}>{OUTLOOK_TEXT[card.outlook.label]}</span></div>
              <div className="kpi"><span className="kpi-label">{t("fc.plan")}</span><strong>{tf("fc.steps", { n: card.steps })}</strong>
                <span className="badge">{tf("fc.hoursLeft", { n: card.hours })}</span></div>
            </div>
            {card.robust_pick && <p><span className="badge gold">{t("card.robust")}</span> {t("fc.robust")}</p>}
            <PayLine pay={card.pay} change={card.pay_change_rm} />
            {card.proven && card.proven.length > 0 && (
              <div><h3>{t("card.proven")}</h3><div className="chips">
                {card.proven.map((p) => <span key={p.name} className="chip covered">✓ {tr(p.name)} · {levelName(p.level)}</span>)}
              </div></div>
            )}
            <p className="muted">{tf("fc.range", { low: signed(card.estimate_range.low), high: signed(card.estimate_range.high) })}</p>
            {card.next_skills.length > 0 && <p><strong>{t("fc.next")}:</strong> {card.next_skills.map((n) => tr(n)).join(", ")}</p>}
            {card.first_step && <p><strong>{t("fc.first")}:</strong> {card.first_step}</p>}
            <Sdgs sdgs={card.sdgs} />
            <p className="source">{tf("fc.source", { id: card.source.snapshot_id, date: card.source.imported, created: card.created_at.slice(0, 10) })}</p>
            <a className="btn ink" href={window.location.pathname}>{t("fc.own")}</a>
          </article>
        )}
      </main>
    </div>
  );
}

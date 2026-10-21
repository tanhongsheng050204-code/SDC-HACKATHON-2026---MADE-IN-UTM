import { useEffect, useState } from "react";
import { api, EmergingCard, EmergingSource, Profile, Texts } from "../lib/api";
import { getLang, t } from "../lib/i18n";
import { SdgTile } from "./Sdgs";

const pickText = (x: Texts) => x[getLang()] || x.en;

function Sources({ items }: { items: EmergingSource[] }) {
  return (
    <ul className="citations">
      {items.map((s) => (
        <li key={s.url}><q>{s.quote}</q>
          <span className="source"> · <span className="badge">{s.kind === "job_ad" ? t("ev.jobAd") : t("ev.web")}</span>{" "}
            <a href={s.url} target="_blank" rel="noreferrer">{s.employer || s.title || new URL(s.url).hostname} ↗</a>
            {!s.grounded && <em> ({t("ev.notGrounded")})</em>}</span>
        </li>
      ))}
    </ul>
  );
}

function Card({ card, profile, onStart }: { card: EmergingCard; profile: Profile; onStart: (roleId: string) => void }) {
  const [live, setLive] = useState<EmergingSource[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const why = card.momentum !== null
    ? t("em.momentum").replace("{cap}", card.capability_name).replace("{m}", `+${card.momentum.toFixed(2)}`)
    : t("em.unmeasured").replace("{cap}", card.capability_name);

  async function searchAds() {
    setBusy(true); setError(null);
    try { setLive((await api.emergingSearch(card.capability_id, profile.id)).sources); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  return (
    <article className="card emerging-card">
      <div className="card-head"><span className="badge gold">{t("em.badge")}</span>
        {card.sdg && <SdgTile sdg={card.sdg} small />}</div>
      <h3>{pickText(card.title)}</h3>
      <p className="muted">{pickText(card.summary)}</p>
      <p className="source">{why}</p>
      {card.carry_over.length > 0 && (
        <div><span className="kpi-label">{t("em.bring")}</span>
          <div className="chips">{card.carry_over.map((s) => <span key={s.skill_id} className="chip covered">✓ {s.name}</span>)}</div></div>
      )}
      {card.to_learn.length > 0 && (
        <div><span className="kpi-label">{t("em.learn")}</span>
          <div className="chips">{card.to_learn.map((s) => <span key={s.skill_id} className="chip missing">{s.name}</span>)}</div></div>
      )}
      <div className="emerging-start">
        <span className="kpi-label">{t("em.start")}</span>
        <button className="link" onClick={() => onStart(card.stepping_stone.role_id)}>{card.stepping_stone.title} →</button>
        <p className="muted">{pickText(card.stepping_stone.reason)}</p>
      </div>
      {card.sdg && <p className="source">SDG {card.sdg.number}: {pickText(card.sdg.reason)}</p>}
      <details className="evidence-row"><summary>{t("em.sources")} ({card.sources.length})</summary><Sources items={card.sources} /></details>
      <p className="source">{t("ev.reviewed").replace("{date}", card.searched).replace("{name}", card.reviewed_by ?? "—")}</p>
      {!live && <button className="btn quiet sm" disabled={busy} onClick={searchAds}>{busy ? t("em.searching") : t("em.search")}</button>}
      {error && <p className="error" role="alert">{error}</p>}
      {live && (
        <div className="emerging-live" role="status">
          <p className="badge gold">{t("em.unreviewed")}</p>
          {live.length ? <Sources items={live} /> : <p className="muted">{t("em.noAds")}</p>}
        </div>
      )}
    </article>
  );
}

// Emerging roles: a labelled prediction under the ranked roles, never mixed into the ranking.
export function EmergingRoles({ profile, onStart, refreshKey }: { profile: Profile; onStart: (roleId: string) => void; refreshKey?: number }) {
  const [cards, setCards] = useState<EmergingCard[] | null>(null);
  useEffect(() => { api.emerging(profile.id).then((r) => setCards(r.roles)).catch(() => setCards([])); }, [profile.id, refreshKey]);
  if (!cards || cards.length === 0) return null;
  return (
    <section className="emerging" aria-labelledby="emerging-title">
      <div className="section-head"><h2 id="emerging-title">{t("em.title")} <span className="badge gold">{t("em.badge")}</span></h2>
        <p className="muted">{t("em.intro")}</p></div>
      <div className="grid">{cards.map((c) => <Card key={c.capability_id} card={c} profile={profile} onStart={onStart} />)}</div>
    </section>
  );
}

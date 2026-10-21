// A still of the app's Today screen for the landing hero. Figures are copied from the synthetic
// demo profile (Aisyah) so the picture matches what "Open the demo profile" shows.
import { LogoMark } from "../../components/Brand";
import { t, tf, tr } from "../../lib/i18n";
import { OUTLOOK_TEXT } from "../../lib/labels";

const ROLES = [
  { title: "AI operations specialist", fit: 50 },
  { title: "UX / UI designer", fit: 25 },
  { title: "Sustainability and ESG analyst", fit: 29 },
];

export function HeroPreview() {
  return (
    <div className="lp-stage" aria-hidden="true">
      <div className="lp-window">
        <div className="lp-side">
          <div className="lp-who"><span className="avatar">A</span><span>Aisyah (demo)</span></div>
          <span className="lp-nav is-on">{t("nav.home")}</span>
          <span className="lp-nav">{t("nav.radar")}</span>
          <span className="lp-nav">{t("nav.tasks")}</span>
          <span className="lp-nav">{t("nav.roles")} <i>13</i></span>
          <span className="lp-nav">{t("nav.pathway")}</span>
          <span className="lp-nav">{t("nav.impact")}</span>
        </div>
        <div className="lp-main">
          <p className="lp-hello">{t("hp.hello")}</p>
          <div className="lp-next">
            <small>{tf("v3.destTag", { role: tr("AI operations specialist") })}</small>
            <b>{tf("v3.nextCourse", { course: tr("Critical thinking"), h: 9, cost: t("v3.freeAudit") })}</b>
            <span className="lp-next-bar"><span /></span>
            <em>{t("v3.startCourse")}</em>
          </div>
          <div className="lp-legs">
            <i className="done">✓</i><s className="done" /><i className="now">2</i><s /><i>3</i><s /><i>4</i>
          </div>
          <div className="lp-rolecards">
            {ROLES.map((r) => (
              <div key={r.title}><small>{tr(r.title)}</small><b>{r.fit}%</b><em>▲ {OUTLOOK_TEXT.growing}</em></div>
            ))}
          </div>
        </div>
        <div className="lp-aside">
          <small>{t("home.whereTo")}</small>
          <div className="lp-step"><span className="lp-tag">{t("hp.ask")}</span></div>
          <div className="lp-step">
            <span className="lp-tag"><LogoMark size={16} /> {t("fc.storyReady")}</span>
            <b>{tr("AI operations specialist")}</b>
            <span className="lp-meta">≈ 11 h · 2 {t("path.steps")} · 50% → 100%</span>
          </div>
          <div className="lp-step">
            <span className="lp-tag">{t("hp.cardH")}</span>
            <span className="lp-meta">{tr("Data entry clerk")} · ▼ {OUTLOOK_TEXT.declining}</span>
          </div>
        </div>
      </div>
      <p className="lp-caption">{t("hp.caption")}</p>
    </div>
  );
}

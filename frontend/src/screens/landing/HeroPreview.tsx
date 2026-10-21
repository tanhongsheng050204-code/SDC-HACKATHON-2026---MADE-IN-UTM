// A still of the app's home screen for the landing hero. Figures are copied from the synthetic
// demo profile (Aisyah) so the picture matches what "Open the demo profile" shows.
import { LogoMark } from "../../components/Brand";
import { t, tf, tr } from "../../lib/i18n";
import { OUTLOOK_TEXT } from "../../lib/labels";

const ROLES = [
  { title: "AI operations specialist", fit: 50, outlook: "growing", tone: "good" },
  { title: "Data analyst", fit: 24, outlook: "growing", tone: "good" },
  { title: "UX / UI designer", fit: 25, outlook: "growing", tone: "good" },
  { title: "Data entry clerk", fit: 88, outlook: "declining", tone: "risk" },
];

export function HeroPreview() {
  return (
    <div className="lp-stage" aria-hidden="true">
      <div className="lp-window">
        <div className="lp-side">
          <div className="lp-who"><span className="avatar">A</span><span>Aisyah (demo)</span></div>
          <span className="lp-search">{t("shell.coach")} <kbd>/</kbd></span>
          <span className="lp-nav is-on">{t("nav.home")}</span>
          <span className="lp-nav">{t("nav.radar")}</span>
          <span className="lp-nav">{t("nav.tasks")}</span>
          <span className="lp-nav">{t("nav.roles")} <i>13</i></span>
          <span className="lp-nav">{t("nav.pathway")}</span>
          <span className="lp-nav">{t("nav.impact")}</span>
        </div>
        <div className="lp-main">
          <p className="lp-hello">{t("hp.hello")}</p>
          <div className="lp-ask">{t("hp.ask")}</div>
          <div className="lp-kpis">
            <div><small>{t("k.top")}</small><b>{tr("AI operations specialist")}</b><em className="good">{tf("card.fit", { n: 50 })}</em></div>
            <div><small>{t("k.robust")}</small><b>3</b><em>{t("hp.every")}</em></div>
            <div><small>{t("k.current")}</small><b>−25.9%</b><em className="risk">{OUTLOOK_TEXT.declining}</em></div>
            <div><small>{t("fc.plan")}</small><b>{tf("fc.steps", { n: 2 })}</b><em>{t("hp.hours")}</em></div>
          </div>
          <div className="lp-card">
            <p><b>{t("hp.cardH")}</b> {t("hp.cardText")}</p>
            <ol className="lp-roles">
              {ROLES.map((r) => (
                <li key={r.title} className={r.tone === "risk" ? "dim" : ""}>
                  <span>{tr(r.title)}</span>
                  <span className="lp-bar"><span style={{ width: `${r.fit}%` }} /></span>
                  <em className={r.tone}>{OUTLOOK_TEXT[r.outlook]}</em>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="lp-aside">
          <small>{t("hp.next")}</small>
          <div className="lp-step">
            <span className="lp-tag"><LogoMark size={16} /> {t("hp.step1")}</span>
            <b>{tr("Critical thinking")}</b>
            <span className="lp-meta">{t("cost.free_audit")} · {t("hp.tenHours")} <i>{t("hp.start")}</i></span>
          </div>
          <div className="lp-step">
            <span className="lp-tag"><LogoMark size={16} /> {t("hp.coach")}</span>
            <b>{t("hp.compare")}</b>
            <span className="lp-meta">{t("hp.youDecide")} <i>{t("a.apply")}</i></span>
          </div>
          <div className="lp-step">
            <span className="lp-tag"><LogoMark size={16} /> {t("share.title")}</span>
            <b>{t("hp.share")}</b>
            <span className="lp-meta">{t("hp.shareSub")}</span>
          </div>
        </div>
      </div>
      <p className="lp-caption">{t("hp.caption")}</p>
    </div>
  );
}

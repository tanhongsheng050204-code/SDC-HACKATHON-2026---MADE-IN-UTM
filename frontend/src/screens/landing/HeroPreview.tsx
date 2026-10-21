// A still of the app's Today screen for the landing hero: "Where to?", the resume-route card and
// the four-step strip. Figures are copied from the synthetic demo profile (Aisyah) so the picture
// matches what "Open the demo profile" shows: AI operations specialist, two courses, 11 hours.
import { LogoMark } from "../../components/Brand";
import { StringKey, t, tf, tr } from "../../lib/i18n";
import { OUTLOOK_TEXT } from "../../lib/labels";

const ROLES = [
  { title: "AI operations specialist", fit: 50, outlook: "growing", tone: "good" },
  { title: "UX / UI designer", fit: 25, outlook: "growing", tone: "good" },
  { title: "Sustainability and ESG analyst", fit: 29, outlook: "growing", tone: "good" },
];
const LEGS = [["step.stand", "done"], ["step.explore", "done"], ["step.build", "now"], ["step.apply", "later"]] as const;

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
          <div className="lp-ask"><b>{t("home.whereTo")}</b> {t("hp.ask")}</div>
          <div className="lp-resume">
            <small>{t("home.resume")}</small>
            <b>{tf("route.from", { from: tr("Data entry clerk"), to: tr("AI operations specialist") })}</b>
            <span className="lp-meta">{tf("route.hoursLeft", { h: 11 })} · {tf("route.rm", { n: 0 })} · {tf("route.stops", { n: 2 })} · {tf("route.readiness", { now: 50, after: 100 })}</span>
          </div>
          <ol className="lp-legs">
            {LEGS.map(([key, state], i) => (
              <li key={key} className={state}><i>{state === "done" ? "✓" : i + 1}</i>{t(key as StringKey)}</li>
            ))}
          </ol>
          <div className="lp-card">
            <p><b>{t("home.topDest")}</b></p>
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

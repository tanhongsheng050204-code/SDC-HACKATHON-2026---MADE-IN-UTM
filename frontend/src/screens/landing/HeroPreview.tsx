// A live replay of the app's Today screen for the landing hero: Aisyah asks "Where to?", starts her
// first course, finishes it, and her readiness and journey move on; then it plays again. Figures are
// copied from the synthetic demo profile (Aisyah) so the picture matches what "Open the demo
// profile" shows. With reduce motion or Lite mode it shows the finished state, still.
import { useLayoutEffect, useRef, useState } from "react";
import { LogoMark } from "../../components/Brand";
import { useDemoLoop, useTyping } from "../../lib/demoLoop";
import { t, tf, tr } from "../../lib/i18n";
import { OUTLOOK_TEXT } from "../../lib/labels";

// idle · typing · answer · press Start · course done · journey moves on · hold
const PHASES = [700, 1900, 1300, 900, 1700, 1700, 2800];
const TYPED = 1, ANSWER = 2, PRESS = 3, DONE = 4, MOVED = 5;

const ROLES = [
  { title: "AI operations specialist", fit: 50, after: 71 },
  { title: "UX / UI designer", fit: 25, after: 25 },
  { title: "Sustainability and ESG analyst", fit: 29, after: 29 },
];

export function HeroPreview() {
  const stage = useRef<HTMLDivElement>(null);
  const win = useRef<HTMLDivElement>(null);
  const ask = useRef<HTMLDivElement>(null);
  const start = useRef<HTMLElement>(null);
  const phase = useDemoLoop(stage, PHASES);
  const typed = useTyping(t("hp.ask"), phase >= TYPED);
  const done = phase >= DONE;
  const moved = phase >= MOVED;

  // The pointer glides to the ask box while typing, then to Start the course.
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const target = phase === TYPED || phase === ANSWER ? ask.current : phase === PRESS ? start.current : null;
    const box = win.current?.getBoundingClientRect();
    const r = target?.getBoundingClientRect();
    setPointer(box && r ? { x: r.left - box.left + r.width * 0.6, y: r.top - box.top + r.height * 0.6 } : null);
  }, [phase]);

  return (
    <div className="lp-stage" ref={stage} aria-hidden="true">
      <div className="lp-window is-live" ref={win}>
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
          <div className={`lp-next ${done ? "is-done" : ""}`}>
            <small>{tf("v3.destTag", { role: tr("AI operations specialist") })}</small>
            <b key={done ? "b" : "a"} className="lp-swap">
              {done
                ? tf("v3.nextCourse", { course: tr("Prompt engineering"), h: 2, cost: t("v3.free") })
                : tf("v3.nextCourse", { course: tr("Critical thinking"), h: 9, cost: t("v3.freeAudit") })}
            </b>
            <span className="lp-next-bar"><span style={{ width: done ? "71%" : "50%" }} /></span>
            <em ref={start} className={phase === PRESS ? "is-pressed" : ""}>{t("v3.startCourse")}</em>
            {done && <span className="lp-toast">✓ {tr("Critical thinking")} · {tf("v3.ready", { n: 71 })}</span>}
          </div>
          <div className="lp-legs">
            <i className="done">✓</i><s className="done" />
            <i className={moved ? "done" : "now"}>{moved ? "✓" : "2"}</i><s className={moved ? "done" : ""} />
            <i className={moved ? "now" : ""}>3</i><s /><i>4</i>
          </div>
          <div className="lp-rolecards">
            {ROLES.map((r) => (
              <div key={r.title} className={moved && r.after !== r.fit ? "is-up" : ""}>
                <small>{tr(r.title)}</small><b>{moved ? r.after : r.fit}%</b><em>{OUTLOOK_TEXT.growing}</em>
              </div>
            ))}
          </div>
        </div>
        <div className="lp-aside">
          <small>{t("home.whereTo")}</small>
          <div className={`lp-step lp-ask ${phase === TYPED || phase === ANSWER ? "is-focus" : ""}`} ref={ask}>
            <span className="lp-tag">{typed || <span className="lp-placeholder">{t("home.whereToPlaceholder")}</span>}{phase === TYPED && <i className="lp-caret" />}</span>
          </div>
          {phase >= ANSWER && (
            <div className="lp-step lp-answer">
              <span className="lp-tag">{t("shell.coach")}</span>
              <b>{tr("AI operations specialist")}</b>
              <span className="lp-meta">{tf("card.fit", { n: 50 })} · {OUTLOOK_TEXT.growing}</span>
            </div>
          )}
          <div className="lp-step">
            <span className="lp-tag"><LogoMark size={16} /> {t("fc.storyReady")}</span>
            <b>{tr("AI operations specialist")}</b>
            <span className="lp-meta">≈ {done ? 2 : 11} h · {done ? 71 : 50}% → 100%</span>
          </div>
        </div>
        {pointer && <span className={`lp-pointer ${phase === PRESS ? "is-click" : ""}`} style={{ left: pointer.x, top: pointer.y }} />}
      </div>
      <p className="lp-caption">{t("hp.caption")}</p>
    </div>
  );
}

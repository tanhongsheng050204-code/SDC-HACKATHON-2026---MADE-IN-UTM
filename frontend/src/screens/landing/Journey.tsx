import { ReactNode, useEffect, useRef, useState } from "react";
import { stillMode } from "../../lib/demoLoop";
import { t, tr } from "../../lib/i18n";
import { TASK_LABEL, TREND_TEXT } from "../../lib/labels";

// "One afternoon with Laluan": the main journey as a timeline. Pick a step on the left to see a
// small picture of that screen on the right.
interface Step { time: string; title: string; text: string; panel: ReactNode }

// Built at render time, so the steps follow the chosen language.
const steps = (): Step[] => [
  {
    time: "14:00", title: t("jy.t1"),
    text: t("jy.x1"),
    panel: (
      <div className="jp-card">
        <p className="jp-label">{t("jy.found")}</p>
        <div className="chips">
          {["Data entry", "Spreadsheets (Excel / Google Sheets)", "Office administration", "Scheduling and coordination", "Communication", "Using generative AI tools"].map((s) => (
            <span key={s} className="chip covered">✓ {tr(s)}</span>
          ))}
        </div>
        <p className="jp-note">{t("jy.removed")}</p>
      </div>
    ),
  },
  {
    time: "14:05", title: t("jy.t2"),
    text: t("jy.x2"),
    panel: (
      <div className="jp-card jp-radar" title={t("jy.example")}>
        <div><p className="jp-label good">{TREND_TEXT.rising}</p><span>{tr("Using generative AI tools")}</span><span>{tr("Data visualisation")}</span><span className="mine">Excel <i>{t("radar.yours")}</i></span></div>
        <div><p className="jp-label">{TREND_TEXT.steady}</p><span>{tr("Customer service")}</span><span>{tr("Communication")}</span></div>
        <div><p className="jp-label risk">{TREND_TEXT.declining}</p><span className="mine">{tr("Data entry")} <i>{t("radar.yours")}</i></span><span>{tr("Office administration")}</span></div>
        <p className="jp-note jp-span">{t("jy.exampleNote")}</p>
      </div>
    ),
  },
  {
    time: "14:10", title: t("jy.t3"),
    text: t("jy.x3"),
    panel: (
      <div className="jp-card">
        <div className="split-bar"><span className="split automate" style={{ width: "60%" }} /><span className="split assist" style={{ width: "20%" }} /><span className="split human" style={{ width: "20%" }} /></div>
        <ul className="jp-legend"><li><i className="swatch automate" />60% {TASK_LABEL.automate.text}</li><li><i className="swatch assist" />20% {TASK_LABEL.assist.text}</li><li><i className="swatch human" />20% {TASK_LABEL.human.text}</li></ul>
        <p className="jp-note">{tr("Data entry clerk")} · {t("jy.allTasks")} · O*NET 30.0</p>
      </div>
    ),
  },
  {
    time: "14:20", title: t("jy.t4"),
    text: t("jy.x4"),
    panel: (
      <div className="jp-card">
        <div className="seg-mini"><span>{t("sc.slow")}</span><span className="on">{t("sc.baseline")}</span><span>{t("sc.accelerated")}</span></div>
        <p className="jp-why"><b>{t("jy.why")}</b> {t("jy.whyText")}</p>
        <span className="badge gold">{t("card.robust")}: {t("jy.robust")}</span>
      </div>
    ),
  },
  {
    time: "14:30", title: t("jy.t5"),
    text: t("jy.x5"),
    panel: (
      <div className="jp-card">
        <ol className="jp-plan">
          <li><b>{tr("Critical thinking")}</b><span className="badge good">{t("cost.free_audit")}</span></li>
          <li><b>ChatGPT Prompt Engineering for Developers</b><span className="badge good">{t("cost.free")}</span></li>
        </ol>
        <div className="fit"><div style={{ width: "50%" }} /></div>
        <p className="jp-note">{t("path.readiness")} 50% · {t("jy.hoursLeft")}</p>
      </div>
    ),
  },
  {
    time: "14:40", title: t("jy.t6"),
    text: t("jy.x6"),
    panel: (
      <div className="jp-card jp-share">
        <div><p className="jp-label">{t("share.title")}</p><b>{t("jy.toward")}</b><span className="jp-note">{t("path.readiness")} 50% · {t("jy.stepsLeft")}</span></div>
        <div className="jp-qr" />
      </div>
    ),
  },
];

// Plays by itself like a demo: each step for STEP_MS while the section is on screen. Clicking a step
// takes over (auto-play stops). A thin bar under the current step shows the time left.
const STEP_MS = 4500;

export function Journey() {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(() => !stillMode());
  const [visible, setVisible] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const all = steps();
  const step = all[active];

  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!auto || !visible) return;
    const id = window.setTimeout(() => setActive((a) => (a + 1) % all.length), STEP_MS);
    return () => window.clearTimeout(id);
  }, [auto, visible, active, all.length]);

  return (
    <div className={`lp-journey ${auto && visible ? "is-auto" : ""}`} ref={box}>
      <ol className="lp-times" role="tablist" aria-label={t("jy.steps")}>
        {all.map((s, i) => (
          <li key={s.title} role="presentation">
            <button role="tab" aria-selected={i === active} aria-controls="journey-panel" onClick={() => { setAuto(false); setActive(i); }}>
              <small>{s.time}</small>{s.title}
              {i === active && auto && visible && <span className="lp-time-bar" key={active} style={{ animationDuration: `${STEP_MS}ms` }} />}
            </button>
          </li>
        ))}
      </ol>
      <div className="lp-journey-body" id="journey-panel" role="tabpanel">
        <p className="lp-two-tone small" key={`t${active}`}><span>{step.title}.</span> {step.text}</p>
        <div className="lp-dots"><div className="lp-panel-in" key={`p${active}`}>{step.panel}</div></div>
      </div>
    </div>
  );
}

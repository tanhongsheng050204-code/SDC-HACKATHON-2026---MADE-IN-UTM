// A live replay of the app's Today screen for the landing hero: Aisyah asks "Where to?", starts her
// first course, finishes it, and her readiness and journey move on; then it plays again. Figures are
// copied from the synthetic demo profile (Aisyah) so the picture matches what "Open the demo
// profile" shows. With reduce motion or Lite mode it shows the finished state, still.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LogoMark } from "../../components/Brand";
import { stillMode, useDemoLoop, useTyping } from "../../lib/demoLoop";
import { t, tf, tr } from "../../lib/i18n";
import { OUTLOOK_TEXT } from "../../lib/labels";

// idle · typing · answer · press Start · course done · journey moves on · hold
const PHASES = [700, 1900, 1300, 900, 1700, 1700, 2800];
const TYPED = 1, ANSWER = 2, PRESS = 3, DONE = 4, MOVED = 5;

const ROLES = [
  { title: "AI operations specialist", fit: 47, after: 67 },
  { title: "Engineering drafting and BIM technician", fit: 40, after: 40 },
  { title: "Supply chain and logistics specialist", fit: 38, after: 38 },
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
        <Side on="home" />
        <div className="lp-main">
          <p className="lp-hello">{t("hp.hello")}</p>
          <div className={`lp-next ${done ? "is-done" : ""}`}>
            <small>{tf("v3.destTag", { role: tr("AI operations specialist") })}</small>
            <b key={done ? "b" : "a"} className="lp-swap">
              {done
                ? tf("v3.nextCourse", { course: tr("Prompt engineering"), h: 2, cost: t("v3.free") })
                : tf("v3.nextCourse", { course: tr("Critical thinking"), h: 9, cost: t("v3.freeAudit") })}
            </b>
            <span className="lp-next-bar"><span style={{ width: done ? "67%" : "47%" }} /></span>
            <em ref={start} className={phase === PRESS ? "is-pressed" : ""}>{t("v3.startCourse")}</em>
            {done && <span className="lp-toast">✓ {tr("Critical thinking")} · {tf("v3.ready", { n: 67 })}</span>}
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
              <span className="lp-meta">{tf("card.fit", { n: 47 })} · {OUTLOOK_TEXT.growing}</span>
            </div>
          )}
          <div className="lp-step">
            <span className="lp-tag"><LogoMark size={16} /> {t("fc.storyReady")}</span>
            <b>{tr("AI operations specialist")}</b>
            <span className="lp-meta">≈ {done ? 62 : 71} h · {done ? 67 : 47}% → 100%</span>
          </div>
        </div>
        {pointer && <span className={`lp-pointer ${phase === PRESS ? "is-click" : ""}`} style={{ left: pointer.x, top: pointer.y }} />}
      </div>
      <p className="lp-caption">{t("hp.caption")}</p>
    </div>
  );
}

type Nav = "home" | "radar" | "tasks";

function Side({ on }: { on: Nav }) {
  return (
    <div className="lp-side">
      <div className="lp-who"><span className="avatar">A</span><span>Aisyah (demo)</span></div>
      <span className={`lp-nav ${on === "home" ? "is-on" : ""}`}>{t("nav.home")}</span>
      <span className={`lp-nav ${on === "radar" ? "is-on" : ""}`}>{t("nav.radar")}</span>
      <span className={`lp-nav ${on === "tasks" ? "is-on" : ""}`}>{t("nav.tasks")}</span>
      <span className="lp-nav">{t("nav.roles")} <i>13</i></span>
      <span className="lp-nav">{t("nav.pathway")}</span>
      <span className="lp-nav">{t("nav.impact")}</span>
    </div>
  );
}

// Job outlook to 2030 under the Baseline scenario, as the live app shows it with the approved
// forecast 2026-10-22-trend-092120 (WEF Future of Jobs Report 2025, Figure 2.3, adjusted by live signals).
const OUTLOOK = [
  { title: "AI operations specialist", pct: 43.5, label: "growing" },
  { title: "Data analyst", pct: 34.6, label: "growing" },
  { title: "Digital marketing specialist", pct: 30.1, label: "growing" },
  { title: "Customer service representative", pct: -2.8, label: "stable" },
  { title: "Data entry clerk", pct: -31.8, label: "declining", mine: true },
];

function RadarScene() {
  return (
    <div className="lp-stage" aria-hidden="true">
      <div className="lp-window is-live">
        <Side on="radar" />
        <div className="lp-main lp-scene">
          <p className="lp-hello">{t("nav.radar")}</p>
          <small className="muted">{t("hp.radarSub")}</small>
          <ul className="lp-outlook">
            {OUTLOOK.map((o, i) => (
              <li key={o.title} className={o.mine ? "is-mine" : ""} style={{ animationDelay: `${i * 0.12}s` }}>
                <span>{tr(o.title)}{o.mine && <em>{t("radar.yours")}</em>}</span>
                <span className="lp-outlook-bar"><span className={o.label} style={{ width: `${Math.min(100, Math.abs(o.pct) * 2)}%` }} /></span>
                <b className={o.label}>{o.pct > 0 ? "+" : "−"}{Math.abs(o.pct).toFixed(1)}%</b>
              </li>
            ))}
          </ul>
          <small className="lp-scene-src">WEF Future of Jobs Report 2025 · {OUTLOOK_TEXT.growing} / {OUTLOOK_TEXT.declining} · 2025–2030</small>
        </div>
      </div>
      <p className="lp-caption">{t("hp.caption")}</p>
    </div>
  );
}

// Aisyah's own job, task by task: O*NET 30.0 task statements for data entry keyers (43-9021.00),
// labels drafted with AI assistance (backend/data/tasks.json).
const TASKS = [
  { text: "Compile, sort, and verify the accuracy of data before it is entered.", label: "automate" },
  { text: "Compare data with source documents, or re-enter data in verification format to detect errors.", label: "automate" },
  { text: "Locate and correct data entry errors, or report them to supervisors.", label: "assist" },
  { text: "Select materials needed to complete work assignments.", label: "human" },
] as const;

function TasksScene() {
  return (
    <div className="lp-stage" aria-hidden="true">
      <div className="lp-window is-live">
        <Side on="tasks" />
        <div className="lp-main lp-scene">
          <p className="lp-hello">{t("nav.tasks")}</p>
          <small className="muted">{tr("Data entry clerk")} · O*NET 30.0</small>
          <ul className="lp-tasks">
            {TASKS.map((task, i) => (
              <li key={task.text} style={{ animationDelay: `${i * 0.15}s` }}>
                <span>{tr(task.text)}</span>
                <b className={`lp-task-tag ${task.label}`}>{t(`task.${task.label}`)}</b>
              </li>
            ))}
          </ul>
          <small className="lp-scene-src">{t("hp.tasksSrc")}</small>
        </div>
      </div>
      <p className="lp-caption">{t("hp.caption")}</p>
    </div>
  );
}

const SCENES = [
  { key: "home", label: () => t("nav.home"), ms: 11500 },
  { key: "radar", label: () => t("nav.radar"), ms: 7000 },
  { key: "tasks", label: () => t("nav.tasks"), ms: 7000 },
] as const;

// The hero shows three app screens in turn: Today, Future Skills Radar and My job, task by task.
// Picking one holds it; with reduce motion it stays on Today.
export function HeroScenes() {
  const [scene, setScene] = useState(0);
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (held || stillMode()) return;
    const id = window.setTimeout(() => setScene((s) => (s + 1) % SCENES.length), SCENES[scene].ms);
    return () => window.clearTimeout(id);
  }, [scene, held]);
  return (
    <div className="lp-scenes">
      <div className="lp-scene-tabs" role="group" aria-label={t("hp.scenesAria")}>
        {SCENES.map((s, i) => (
          <button key={s.key} aria-pressed={scene === i} onClick={() => { setScene(i); setHeld(true); }}>{s.label()}</button>
        ))}
      </div>
      <div key={scene} className="lp-scene-swap">
        {scene === 0 ? <HeroPreview /> : scene === 1 ? <RadarScene /> : <TasksScene />}
      </div>
    </div>
  );
}

import { ReactNode, RefObject, useEffect, useRef, useState } from "react";
import { LogoMark, Rosette, WalkingGirl } from "../../components/Brand";
import { t, tf, tr, type StringKey } from "../../lib/i18n";
import { OUTLOOK_TEXT } from "../../lib/labels";
import { api } from "../../lib/api";
import "../../styles/landing.css";
import { HeroPreview } from "./HeroPreview";
import { Journey } from "./Journey";

const REPO = "https://github.com/tanhongsheng050204-code/XMUM-HACKATHON";

// The headline with its second half in the accent colour (falls back to plain text).
function TwoTone({ text, em }: { text: string; em: string }) {
  const i = text.indexOf(em);
  return i < 0 ? <>{text}</> : <>{text.slice(0, i)}<em>{em}</em>{text.slice(i + em.length)}</>;
}

// The hero route: a wide Stripe-style ribbon with the career route drawn on it. Figures are copied
// from the three synthetic demo profiles (as HeroPreview does), so the picture matches each demo.
type Persona = "clerk" | "student" | "switcher";
const ROUTES: Record<Persona, { from: string | null; fromWord: string; fromTone: string; to: string; toWord: string; toIndex: string; hours: number;
  stops: { course: string; hours: number; audit: boolean }[] }> = {
  clerk: { from: "Data entry clerk", fromWord: "declining", fromTone: "risk", to: "AI operations specialist", toWord: "growing", toIndex: "+35.0", hours: 11,
    stops: [{ course: "Critical Thinking Skills for the Professional", hours: 9, audit: true }, { course: "ChatGPT Prompt Engineering for Developers", hours: 2, audit: false }] },
  student: { from: null, fromWord: "", fromTone: "", to: "Digital marketing specialist", toWord: "growing", toIndex: "+29.2", hours: 190,
    stops: [{ course: "Google Digital Marketing & E-commerce Professional Certificate", hours: 190, audit: true }] },
  switcher: { from: "Customer service representative", fromWord: "stable", fromTone: "gold", to: "UX / UI designer", toWord: "growing", toIndex: "+47.8", hours: 500,
    stops: [{ course: "Google UX Design Professional Certificate", hours: 200, audit: true }, { course: "The Odin Project: Full Stack JavaScript", hours: 300, audit: false }] },
};
const RIBBON = "M-20,370 C 200,370 300,260 460,260 S 700,310 860,210 S 1120,90 1300,80";
const STOP_AT: [number, number][][] = [[], [[660, 262]], [[460, 260], [860, 210]]];

function RibbonRoute() {
  const [who, setWho] = useState<Persona>("clerk");
  const r = ROUTES[who];
  const at = STOP_AT[r.stops.length];
  const track = useRef<SVGPathElement>(null);
  const cost = (s: { audit: boolean }) => (s.audit ? t("v3.freeAudit") : t("v3.free"));
  const toLine = tf("v3.byYear", { word: OUTLOOK_TEXT[r.toWord], n: r.toIndex });
  return (
    <>
      <div className="lp-ribbon" aria-hidden="true">
        <svg viewBox="0 0 1280 400" preserveAspectRatio="none">
          <path ref={track} className="rb-wide" d={RIBBON} />
          <path className="rb-mid" d="M-20,380 C 220,380 320,250 470,255 S 720,300 870,205 S 1130,95 1300,75" />
          <path className="rb-sun" d="M-20,365 C 190,365 300,270 450,268 S 690,320 850,218 S 1110,100 1300,90" />
          <path key={who} className="rb-line" d={RIBBON} pathLength={1} />
        </svg>
        <span className="rb-dot start" style={{ left: "7%", top: 358 }} />
        <RouteWalker key={who} track={track} stopsX={r.stops.map((_, i) => at[i][0])} />
        <div className="rb-card here" style={{ left: "calc(7% - 10px)", top: 380 }}>
          <small>{t("v3.youAreHere")}</small>
          <b>{r.from ? tr(r.from) : t("v3.yourSkills")} {r.from && <span className={r.fromTone}>{OUTLOOK_TEXT[r.fromWord]}</span>}</b>
        </div>
        {r.stops.map((s, i) => (
          <div key={`${who}-${i}`}>
            <span className="rb-dot" style={{ left: `${(at[i][0] / 1280) * 100}%`, top: at[i][1] }} />
            <div className="rb-card" style={{ left: `calc(${(at[i][0] / 1280) * 100}% - 30px)`, top: at[i][1] + 24, animationDelay: `${0.5 + i * 0.25}s` }}>
              <small>{tf("v3.stop", { n: i + 1 })} · {s.hours} h · {cost(s)}</small>
              <b>{tr(s.course)}</b>
            </div>
          </div>
        ))}
        <div className="rb-card dest" style={{ right: "calc(8% - 10px)", top: 8, animationDelay: ".9s" }}>
          <small>{t("v3.destination")}</small><b>{tr(r.to)}</b><span>{toLine}</span>
        </div>
      </div>
      <ol className="rb-list" aria-label={t("v3.tryRoute")}>
        <li><i />{r.from ? tr(r.from) : t("v3.yourSkills")}</li>
        {r.stops.map((s) => <li key={s.course}><i />{tr(s.course)} · {s.hours} h · {cost(s)}</li>)}
        <li><i /><b>{tr(r.to)}</b>&nbsp;· {toLine}</li>
      </ol>
      <div className="lp-try">
        <div className="segmented" role="radiogroup" aria-label={t("v3.tryRoute")}>
          {(["clerk", "student", "switcher"] as Persona[]).map((k) => (
            <button key={k} role="radio" aria-checked={who === k} onClick={() => setWho(k)}>{t(`v3.${k}` as StringKey)}</button>
          ))}
        </div>
        <strong>{r.stops.length === 1 ? tf("v3.eta1", { h: r.hours }) : tf("v3.eta", { h: r.hours, n: r.stops.length })}</strong>
        <small>{t("v3.demoNote")}</small>
      </div>
    </>
  );
}

// The mascot walks the route: from "You are here", pausing at each course stop, to the destination,
// then starts again. Positions come from the ribbon path in its 1280 × 400 box; the ribbon stretches
// sideways, so x is a percentage and y is scaled by the ribbon's real height. Reduce motion and Lite
// mode keep her standing at "You are here".
const WALK_FROM = 90, WALK_TO = 1150, WALK_MS = 7000, STOP_MS = 700, END_MS = 1600;

function RouteWalker({ track, stopsX }: { track: RefObject<SVGPathElement>; stopsX: number[] }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const path = track.current, el = box.current;
    if (!path || !el) return;
    const total = path.getTotalLength();
    const lengthAt = (x: number) => { let lo = 0, hi = total; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (path.getPointAtLength(m).x < x) lo = m; else hi = m; } return lo; };
    const from = lengthAt(WALK_FROM), to = lengthAt(WALK_TO);
    const stops = stopsX.map(lengthAt);
    const place = (len: number) => {
      const pt = path.getPointAtLength(len), ahead = path.getPointAtLength(Math.min(total, len + 4));
      const h = el.parentElement?.clientHeight ?? 400, w = el.parentElement?.clientWidth ?? 1280;
      const angle = Math.atan2((ahead.y - pt.y) * h / 400, (ahead.x - pt.x) * w / 1280) * 180 / Math.PI;
      el.style.left = `${(pt.x / 1280) * 100}%`;
      el.style.top = `${pt.y * h / 400}px`;
      el.style.transform = `translate(-50%, -100%) rotate(${angle * 0.35}deg)`;
    };
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.lite === "1";
    if (still) { place(from); el.classList.add("is-still"); return; }
    // A timeline of walking legs and pauses: walk to each stop, pause, walk on, rest at the end.
    const legs: { a: number; b: number; ms: number }[] = [];
    let prev = from;
    for (const s of [...stops, to]) { legs.push({ a: prev, b: s, ms: WALK_MS * (s - prev) / (to - from) }); prev = s; }
    let frame = 0, start = performance.now() + 900;  // wait for the route to draw first
    const tick = (now: number) => {
      let t = now - start, len = from, walking = false;
      if (t >= 0) {
        len = to;
        for (const [i, leg] of legs.entries()) {
          if (t < leg.ms) { len = leg.a + (leg.b - leg.a) * (t / leg.ms); walking = true; break; }
          t -= leg.ms;
          if (i < legs.length - 1) { if (t < STOP_MS) { len = leg.b; break; } t -= STOP_MS; }
          else if (t >= END_MS) { start = now; len = from; }
        }
      }
      place(len);
      el.classList.toggle("is-walking", walking);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [track, stopsX.join(",")]);
  return <div ref={box} className="rb-walker"><WalkingGirl /></div>;
}

// Live numbers from the API; if the server is asleep the tiles keep fixed text instead of waiting.
function LiveStats() {
  const [roles, setRoles] = useState<number | null>(null);
  const [date, setDate] = useState<string | null>(null);
  useEffect(() => {
    api.roles().then((r) => setRoles(Array.isArray(r) ? r.length : null)).catch(() => {});
    api.health().then((h) => setDate(h.snapshot_imported?.slice(0, 10) ?? null)).catch(() => {});
  }, []);
  return (
    <div className="lp-stats">
      <div className="lp-stat"><b>{roles ?? "—"}</b><span>{t("v3.statRoles")}</span><small>{t("lp.forecastSource")}{date ? ` · ${tf("lp.updatedDate", { date })}` : ""}</small></div>
      <div className="lp-stat"><b>RM 0</b><span>{t("v3.statCourses")}</span><small>{t("v3.freeAudit")}</small></div>
      <div className="lp-stat"><b>3</b><span>{t("v3.statFutures")}</span><small>{t("v3.statFuturesSub")}</small></div>
      <div className="lp-stat"><b>0</b><span>{t("v3.statCv")}</span><small>{t("v3.statCvSub")}</small></div>
    </div>
  );
}

// Read through t() at render time, so the page follows the chosen language.
const people = () => [
  { key: "clerk", photo: "worker", alt: t("lp.clerkAlt"), who: t("lp.clerkWho"), text: t("lp.clerkText"), cta: t("lp.clerkCta"), big: "11 h", chips: [t("lp.clerkChip1"), t("lp.clerkChip2"), t("lp.clerkChip3")] },
  { key: "student", photo: "student", alt: t("lp.studentAlt"), who: t("lp.studentWho"), text: t("lp.studentText"), cta: t("lp.studentCta"), big: "190 h", chips: [t("card.robust"), t("lead.openToGrads"), t("lp.studentChip3")] },
  { key: "hr", photo: "hr-team", alt: t("lp.hrAlt"), who: t("lp.hrWho"), text: t("lp.hrText"), cta: t("lp.hrCta"), big: "89 / 190", chips: [t("lp.hrChip1"), t("lp.hrChip2"), t("lp.hrChip3")] },
];

const principles = () => [1, 2, 3, 4].map((i) => ({ title: t(`lp.p${i}` as StringKey), text: t(`lp.p${i}Text` as StringKey) }));

const chain = () => [1, 2, 3, 4].map((i) => ({ title: t(`lp.c${i}` as StringKey), by: t(`lp.c${i}By` as StringKey) }));

const faq = () => [1, 2, 3, 4, 5, 6].map((i) => ({ q: t(`lp.q${i}` as StringKey), a: t(`lp.a${i}` as StringKey) }));

export function Landing({ nav, banners, model, prefs, onStart, onDemo, onHr, onSources, onReviewKit }: {
  nav: ReactNode; banners: ReactNode; model: string | null; prefs: ReactNode;
  onStart: () => void; onDemo: (k: string) => void; onHr: () => void; onSources: () => void; onReviewKit: () => void;
}) {
  const openPerson = (key: string) => (key === "hr" ? onHr() : onDemo(key));
  return (
    <div className="site">
      <div className="announce">{t("landing.judge")} <button onClick={() => onDemo("clerk")}>{t("landing.judgeCta")}</button></div>
      {nav}
      {banners}
      <main className="lp">
        <header className="lp-hero">
          <Rosette className="hero-rosette" />
          <p className="pill-tag">{t("landing.tag")}</p>
          <h1><TwoTone text={t("landing.title")} em={t("landing.titleEm")} /></h1>
          <p className="lp-lede">{t("landing.lede")}</p>
          <div className="ctas">
            <button className="btn ink lg" onClick={() => onDemo("clerk")}>{t("landing.demo")}</button>
            <button className="btn quiet lg" onClick={onStart}>{t("landing.mine")}</button>
          </div>
          <RibbonRoute />
          <LiveStats />
          <HeroPreview />
        </header>

        <section className="lp-frame" id="people">
          <h2 className="lp-two-tone"><span>{t("lp.peopleH")}</span> {t("lp.peopleSub")}</h2>
          <div className="lp-people">
            {people().map((p) => (
              <article key={p.key} className="lp-person">
                <div className={`lp-person-art ${p.key}`}>
                  <img src={`/images/people/${p.photo}.webp`} alt={p.alt} width={880} height={748} loading="lazy" decoding="async" />
                  <div className="lp-person-tags" aria-hidden="true">{p.chips.map((c) => <span key={c}>{c}</span>)}</div>
                </div>
                <b className="lp-person-big">{p.big}</b>
                <h3>{p.who}</h3>
                <p>{p.text}</p>
                <button className="link" onClick={() => openPerson(p.key)}>{p.cta} →</button>
              </article>
            ))}
          </div>
          <p className="lp-switch">{t("landing.switcher")} <button className="link" onClick={() => onDemo("switcher")}>{t("landing.switcherCta")}</button></p>
          <p className="lp-switch">{t("landing.centre")} <button className="link" onClick={() => onDemo("class")}>{t("landing.centreCta")}</button></p>
          <p className="lp-credit">{t("lp.credit")}</p>
        </section>

        <section className="lp-frame lp-split">
          <h2 className="lp-two-tone"><span>{t("lp.startH")}</span> {t("lp.startSub")}</h2>
          <div className="lp-redact" aria-hidden="true">
            <div className="lp-doc">
              <p className="jp-label">cv_aisyah.pdf</p>
              <p><mark>████████ ██████</mark> · <mark>████@█████.com</mark> · <mark>01█-███ ████</mark></p>
              <p>{t("lp.cvLine1")}</p>
              <p>{t("lp.cvLine2")}</p>
            </div>
            <span className="lp-arrow">→</span>
            <div className="lp-doc">
              <p className="jp-label">{t("lp.confirm")}</p>
              <div className="chips">
                {[t("lp.sk1"), t("lp.sk2"), t("lp.sk3"), t("lp.sk4")].map((s) => <span key={s} className="chip covered">✓ {s}</span>)}
              </div>
            </div>
          </div>
        </section>

        <section className="lp-frame lp-flush" id="journey">
          <h2 className="lp-two-tone lp-pad"><span>{t("lp.journeyH")}</span> {t("lp.journeySub")}</h2>
          <Journey />
        </section>

        <section className="lp-band" id="trust">
          <Rosette className="lp-band-rosette" />
          <div className="lp-band-inner">
            <div className="lp-band-head">
              <h2>{t("landing.bandTitle")} <em>{t("v3.bandEm")}</em></h2>
              <p>{t("landing.bandText")}</p>
              <button className="btn outline-light" onClick={onSources}>{t("lp.seeSources")}</button>
            </div>
            <div className="lp-principles">
              {principles().map((p) => <div key={p.title}><h3>{p.title}</h3><p>{p.text}</p></div>)}
            </div>
          </div>
          <ol className="lp-chain" aria-label={t("lp.chainAria")}>
            {chain().map((c) => <li key={c.title}><b>{c.title}</b><span>{c.by}</span></li>)}
          </ol>
        </section>

        <section className="lp-faq" id="faq">
          <h2>{t("lp.faq")}</h2>
          {faq().map((f, i) => (
            <details key={f.q} open={i === 0}>
              <summary>{f.q}<span className="lp-plus" aria-hidden="true" /></summary>
              <p>{f.a}</p>
            </details>
          ))}
        </section>

        <section className="lp-closing">
          <h2>{t("landing.closing")}</h2>
          <p>{t("landing.closingText")}</p>
          <div className="ctas">
            <button className="btn ink lg" onClick={() => onDemo("clerk")}>{t("landing.demo")}</button>
            <button className="btn quiet lg" onClick={onStart}>{t("landing.mine")}</button>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <div className="footer-about">
            <span className="brand"><LogoMark size={22} /><span>Laluan</span></span>
            <p className="footer-blurb">{t("landing.tag")}. {t("lp.blurb")}</p>
          </div>
          <div>
            <h3>{t("lp.product")}</h3>
            <ul>
              <li><button className="link" onClick={() => onDemo("clerk")}>{t("lp.workerDemo")}</button></li>
              <li><button className="link" onClick={() => onDemo("student")}>{t("lp.studentDemo")}</button></li>
              <li><button className="link" onClick={() => onDemo("switcher")}>{t("lp.switcherDemo")}</button></li>
              <li><button className="link" onClick={() => onDemo("class")}>{t("lp.classView")}</button></li>
              <li><button className="link" onClick={onHr}>{t("nav.workforce")}</button></li>
            </ul>
          </div>
          <div>
            <h3>{t("lp.resources")}</h3>
            <ul>
              <li><button className="link" onClick={onSources}>{t("nav.sources")}</button></li>
              <li><button className="link" onClick={onReviewKit}>{t("lp.reviewKit")}</button></li>
              <li><a href={`${REPO}/blob/main/docs/PROPOSAL.md`} target="_blank" rel="noreferrer">{t("lp.proposal")}</a></li>
              <li><a href={`${REPO}/blob/main/docs/CODE_TO_EXPLAIN.md`} target="_blank" rel="noreferrer">{t("lp.howItWorks")}</a></li>
            </ul>
          </div>
          <div>
            <h3>{t("lp.project")}</h3>
            <ul>
              <li><a href={REPO} target="_blank" rel="noreferrer">{t("lp.github")}</a></li>
              <li><a href={`${REPO}/blob/main/docs/AI_DECLARATION.md`} target="_blank" rel="noreferrer">{t("lp.aiDecl")}</a></li>
              <li><a href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noreferrer">{t("lp.licence")}</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-base">
          <span>{t("landing.footer")}</span>
          {model && <span>{t("shell.model")}: {model}</span>}
          <span className="footer-prefs">{prefs}</span>
        </div>
      </footer>
    </div>
  );
}

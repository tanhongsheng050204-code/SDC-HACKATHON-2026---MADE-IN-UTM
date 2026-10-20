import { ReactNode } from "react";
import { LogoMark, Rosette } from "../../components/Brand";
import { t } from "../../lib/i18n";
import "../../styles/landing.css";
import { HeroPreview } from "./HeroPreview";
import { Journey } from "./Journey";

const REPO = "https://github.com/tanhongsheng050204-code/XMUM-HACKATHON";

const PEOPLE = [
  { key: "clerk", who: "A clerk whose job is changing", text: "Aisyah is a data-entry clerk whose team just started using an AI tool that reads invoices. She sees which of her skills carry over and a plan for the role she can reach first.", cta: "Open Aisyah's demo", chips: ["Data entry ▼", "Excel ▲", "AI operations"] },
  { key: "student", who: "A student choosing a direction", text: "Wei Jie is a final-year business student who cares about climate change. He compares roles under three futures, keeps the ones that hold up in all of them, and picks free courses first.", cta: "Open the student demo", chips: ["Robust pick", "Free courses", "SDG 12, 13"] },
  { key: "hr", who: "An HR team planning ahead", text: "Upload an anonymous list of roles and skills. See which roles AI puts at risk and the cheapest moves for each group, never a ranking of people.", cta: "Open the workforce view", chips: ["160 people", "Heatmap", "Learning hours"] },
];

const PRINCIPLES = [
  { title: "Estimates, never predictions", text: "Every forecast shows a range across three scenarios and the word “estimate”. No single number stands alone." },
  { title: "Every number has a source", text: "Each role, skill, task and course shows where it came from and when. Old forecasts are kept, so a number can be traced back." },
  { title: "Your CV is never stored", text: "Files are read in memory. Names, emails, phone and IC numbers are removed before any AI sees the text. Only your skills are saved." },
  { title: "The coach only suggests", text: "The AI coach answers from your own results with sources. A suggested change does nothing until you press Apply." },
];

const CHAIN = [
  { title: "CV uploaded", by: "You" },
  { title: "Personal details removed", by: "Before any AI" },
  { title: "Skills matched", by: "Skill dictionary + AI" },
  { title: "You confirm the list", by: "You" },
];

const FAQ = [
  { q: "Is this a real product, or a demo?", a: "It is a working prototype built for the XMUM hackathon. The matching, scenarios, pathways, coach and workforce view all run on real code. The two demo people are synthetic, and the bundled forecast is marked as illustrative until the team replaces it with cited figures." },
  { q: "Where do the forecasts come from?", a: "A baseline forecast per role, adjusted by dated signals: AI research activity from arXiv (or OpenAlex) and skill mentions in job postings. The Sources page lists every snapshot with its date." },
  { q: "Will it tell me to quit my job?", a: "No. Laluan shows estimates under different futures and the skills between you and each role. The decision stays with you, and every screen says so." },
  { q: "Do you keep my CV?", a: "No. The file is read in memory and discarded. We save the skills you confirm, your goals and your course progress, and you can delete all of it from the sidebar at any time." },
  { q: "Can my employer see my results?", a: "Only if you share a Future Card link. The workforce view for HR teams works on anonymous role-and-skills lists and refuses files with names, emails or staff IDs." },
  { q: "Which languages does it support?", a: "English, Bahasa Malaysia and Chinese for the interface. Role, course and task names stay in English, as their sources publish them." },
];

export function Landing({ nav, banners, model, prefs, onStart, onDemo, onHr, onSources }: {
  nav: ReactNode; banners: ReactNode; model: string | null; prefs: ReactNode;
  onStart: () => void; onDemo: (k: string) => void; onHr: () => void; onSources: () => void;
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
          <h1>{t("landing.title")}</h1>
          <p className="lp-lede">{t("landing.lede")}</p>
          <div className="ctas">
            <button className="btn ink lg" onClick={() => onDemo("clerk")}>{t("landing.demo")}</button>
            <button className="btn quiet lg" onClick={onStart}>{t("landing.mine")}</button>
          </div>
          <HeroPreview />
        </header>

        <section className="lp-frame" id="people">
          <h2 className="lp-two-tone"><span>Made for the people AI is changing first.</span> Clerks, service staff, students and the HR teams planning their next move.</h2>
          <div className="lp-people">
            {PEOPLE.map((p) => (
              <article key={p.key} className="lp-person">
                <div className={`lp-person-art ${p.key}`} aria-hidden="true">
                  {p.chips.map((c) => <span key={c}>{c}</span>)}
                </div>
                <h3>{p.who}</h3>
                <p>{p.text}</p>
                <button className="link" onClick={() => openPerson(p.key)}>{p.cta} →</button>
              </article>
            ))}
          </div>
        </section>

        <section className="lp-frame lp-split">
          <h2 className="lp-two-tone"><span>Starts from what you already have.</span> A CV, a few answers, or a list of skills, with your personal details removed first.</h2>
          <div className="lp-redact" aria-hidden="true">
            <div className="lp-doc">
              <p className="jp-label">cv_aisyah.pdf</p>
              <p><mark>████████ ██████</mark> · <mark>████@█████.com</mark> · <mark>01█-███ ████</mark></p>
              <p>Data entry clerk, logistics company, Shah Alam (2017–now)</p>
              <p>Keyed delivery orders and invoices into the company system, kept Excel trackers, scheduled pickups with drivers, answered customer calls.</p>
            </div>
            <span className="lp-arrow">→</span>
            <div className="lp-doc">
              <p className="jp-label">Skills you confirm</p>
              <div className="chips">
                {["Data entry", "Microsoft Excel", "Scheduling", "Communication"].map((s) => <span key={s} className="chip covered">✓ {s}</span>)}
              </div>
            </div>
          </div>
        </section>

        <section className="lp-frame lp-flush" id="journey">
          <h2 className="lp-two-tone lp-pad"><span>One afternoon with Laluan.</span> From your skills to a plan you can start this week, every step with its source.</h2>
          <Journey />
        </section>

        <section className="lp-band" id="trust">
          <Rosette className="lp-band-rosette" />
          <div className="lp-band-inner">
            <div className="lp-band-head">
              <h2>{t("landing.bandTitle")}</h2>
              <p>{t("landing.bandText")}</p>
              <button className="btn outline-light" onClick={onSources}>See where the numbers come from</button>
            </div>
            <div className="lp-principles">
              {PRINCIPLES.map((p) => <div key={p.title}><h3>{p.title}</h3><p>{p.text}</p></div>)}
            </div>
          </div>
          <ol className="lp-chain" aria-label="What happens to your CV">
            {CHAIN.map((c) => <li key={c.title}><b>{c.title}</b><span>{c.by}</span></li>)}
          </ol>
        </section>

        <section className="lp-faq" id="faq">
          <h2>Questions people ask</h2>
          {FAQ.map((f, i) => (
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
            <p className="footer-blurb">{t("landing.tag")}. A prototype for the XMUM hackathon (Domain 1, Future-Ready Workforce), shown with synthetic people.</p>
          </div>
          <div>
            <h3>Product</h3>
            <ul>
              <li><button className="link" onClick={() => onDemo("clerk")}>Worker demo</button></li>
              <li><button className="link" onClick={() => onDemo("student")}>Student demo</button></li>
              <li><button className="link" onClick={onHr}>Workforce view</button></li>
            </ul>
          </div>
          <div>
            <h3>Resources</h3>
            <ul>
              <li><button className="link" onClick={onSources}>{t("nav.sources")}</button></li>
              <li><a href={`${REPO}/blob/main/docs/PROPOSAL.md`} target="_blank" rel="noreferrer">Proposal</a></li>
              <li><a href={`${REPO}/blob/main/docs/CODE_TO_EXPLAIN.md`} target="_blank" rel="noreferrer">How it works</a></li>
            </ul>
          </div>
          <div>
            <h3>Project</h3>
            <ul>
              <li><a href={REPO} target="_blank" rel="noreferrer">Source code on GitHub</a></li>
              <li><a href={`${REPO}/blob/main/docs/AI_DECLARATION.md`} target="_blank" rel="noreferrer">AI declaration</a></li>
              <li><a href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noreferrer">Apache 2.0 licence</a></li>
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

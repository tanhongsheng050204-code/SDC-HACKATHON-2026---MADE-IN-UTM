import { ReactNode } from "react";
import { LogoMark, Rosette } from "../../components/Brand";
import { t, type StringKey } from "../../lib/i18n";
import "../../styles/landing.css";
import { HeroPreview } from "./HeroPreview";
import { FactLine, HeroRoute } from "./HeroRoute";
import { Journey } from "./Journey";

const REPO = "https://github.com/tanhongsheng050204-code/XMUM-HACKATHON";

// Read through t() at render time, so the page follows the chosen language.
const people = () => [
  { key: "clerk", photo: "worker", alt: t("lp.clerkAlt"), who: t("lp.clerkWho"), text: t("lp.clerkText"), cta: t("lp.clerkCta"), chips: [t("lp.clerkChip1"), t("lp.clerkChip2"), t("lp.clerkChip3")] },
  { key: "student", photo: "student", alt: t("lp.studentAlt"), who: t("lp.studentWho"), text: t("lp.studentText"), cta: t("lp.studentCta"), chips: [t("card.robust"), t("lead.openToGrads"), t("lp.studentChip3")] },
  { key: "hr", photo: "hr-team", alt: t("lp.hrAlt"), who: t("lp.hrWho"), text: t("lp.hrText"), cta: t("lp.hrCta"), chips: [t("lp.hrChip1"), t("lp.hrChip2"), t("lp.hrChip3")] },
];

const principles = () => [1, 2, 3, 4].map((i) => ({ title: t(`lp.p${i}` as StringKey), text: t(`lp.p${i}Text` as StringKey) }));

const chain = () => [1, 2, 3, 4].map((i) => ({ title: t(`lp.c${i}` as StringKey), by: t(`lp.c${i}By` as StringKey) }));

const faq = () => [1, 2, 3, 4, 5, 6].map((i) => ({ q: t(`lp.q${i}` as StringKey), a: t(`lp.a${i}` as StringKey) }));

export function Landing({ nav, banners, model, prefs, onStart, onResume, onDemo, onHr, onSources, onReviewKit }: {
  nav: ReactNode; banners: ReactNode; model: string | null; prefs: ReactNode;
  onStart: () => void; onResume?: () => void; onDemo: (k: string) => void; onHr: () => void; onSources: () => void; onReviewKit: () => void;
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
          {onResume ? (
            <button className="pill-tag lp-welcome" onClick={onResume}><span className="lp-facts-dot" aria-hidden="true" />{t("lp.welcomeBack")} <b>{t("lp.resume")} →</b></button>
          ) : <p className="pill-tag">{t("landing.tag")}</p>}
          <h1>{t("landing.title")}</h1>
          <p className="lp-lede">{t("landing.lede")}</p>
          <HeroRoute />
          <div className="ctas">
            <button className="btn ink lg" onClick={() => onDemo("clerk")}>{t("landing.demo")}</button>
            <button className="btn quiet lg" onClick={onStart}>{t("landing.mine")}</button>
          </div>
          <FactLine />
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
              <h2>{t("landing.bandTitle")}</h2>
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

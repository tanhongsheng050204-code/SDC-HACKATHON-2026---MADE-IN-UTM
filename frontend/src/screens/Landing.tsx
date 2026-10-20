import { Rosette } from "../components/Brand";
import { Icon } from "../components/Icon";
import { t } from "../lib/i18n";

export function Landing({ onStart, onDemo, onHr }: { onStart: () => void; onDemo: (k: string) => void; onHr: () => void }) {
  return (
    <main className="landing">
      <header className="lv-hero">
        <Rosette className="hero-rosette" />
        <p className="pill-tag">{t("landing.tag")}</p>
        <h1>{t("landing.title")}</h1>
        <p className="lede">{t("landing.lede")}</p>
        <div className="ctas">
          <button className="btn ink" onClick={() => onDemo("clerk")}>{t("landing.demo")}</button>
          <button className="btn quiet" onClick={onStart}>{t("landing.mine")}</button>
        </div>
        <div className="persona-links">
          <button className="link" onClick={() => onDemo("student")}>{t("landing.student")}</button>
          <button className="link" onClick={onHr}>{t("landing.hr")}</button>
        </div>
      </header>
      <div className="lv-preview" aria-hidden="true">
        <div className="preview-card">
          <div className="preview-head"><span className="preview-title">Future roles for Aisyah, data-entry clerk</span><span className="badge">Example view</span></div>
          <div className="seg-track"><span>Slow</span><span className="on">Baseline</span><span>Accelerated</span></div>
          <ol className="preview-list">
            <li><span>AI operations specialist</span><span className="badge good">Emerging</span></li>
            <li><span>Sustainability and ESG analyst</span><span className="badge good">Growing</span></li>
            <li><span>Data analyst</span><span className="badge good">Growing</span></li>
            <li className="dim"><span>Data entry clerk</span><span className="badge risk">Declining</span></li>
          </ol>
          <div className="preview-note"><span className="dot" /><div><strong>Robust pick</strong><span>Stays in her top five in every scenario.</span></div></div>
        </div>
      </div>
      <section className="lv-section">
        <h2>Made for the people AI is changing first. <span>Clerks, service staff, graduates and the HR teams planning their next move.</span></h2>
        <div className="pillars">
          <div className="pillar"><span className="pillar-icon"><Icon name="radar" /></span><h3>Future Skills Radar</h3><p>Which skills are rising or declining, built from research papers and real job postings, each with its source and date.</p></div>
          <div className="pillar"><span className="pillar-icon"><Icon name="briefcase" /></span><h3>Matches you can check</h3><p>Every rank shows how much comes from your skills, the outlook and the goals you care about.</p></div>
          <div className="pillar"><span className="pillar-icon"><Icon name="route" /></span><h3>A plan you can start this week</h3><p>Ordered free or low-cost courses with hours, each linked to the UN Sustainable Development Goals.</p></div>
        </div>
      </section>
      <section className="lv-section steps-section">
        <h2>{t("landing.howTitle")}</h2>
        <ol className="how-steps">
          <li><strong>{t("landing.how1")}</strong><span>{t("landing.how1b")}</span></li>
          <li><strong>{t("landing.how2")}</strong><span>{t("landing.how2b")}</span></li>
          <li><strong>{t("landing.how3")}</strong><span>{t("landing.how3b")}</span></li>
        </ol>
        <p className="muted privacy-line">{t("landing.privacy")}</p>
      </section>
    </main>
  );
}

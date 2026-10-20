// A still of the app's home screen for the landing hero. Figures are copied from the synthetic
// demo profile (Aisyah) so the picture matches what "Open the demo profile" shows.
import { LogoMark } from "../../components/Brand";

const ROLES = [
  { title: "AI operations specialist", fit: 50, outlook: "▲ Emerging", tone: "good" },
  { title: "Sustainability and ESG analyst", fit: 29, outlook: "▲ Growing", tone: "good" },
  { title: "Data analyst", fit: 24, outlook: "▲ Growing", tone: "good" },
  { title: "Data entry clerk", fit: 88, outlook: "▼ Declining", tone: "risk" },
];

export function HeroPreview() {
  return (
    <div className="lp-stage" aria-hidden="true">
      <div className="lp-window">
        <div className="lp-side">
          <div className="lp-who"><span className="avatar">A</span><span>Aisyah (demo)</span></div>
          <span className="lp-search">Ask the coach <kbd>/</kbd></span>
          <span className="lp-nav is-on">Today</span>
          <span className="lp-nav">Future Skills Radar</span>
          <span className="lp-nav">My job, task by task</span>
          <span className="lp-nav">Future roles <i>13</i></span>
          <span className="lp-nav">Pathway</span>
          <span className="lp-nav">SDG impact</span>
        </div>
        <div className="lp-main">
          <p className="lp-hello">Good morning, Aisyah.</p>
          <div className="lp-ask">Which job should I aim for?</div>
          <div className="lp-kpis">
            <div><small>Top match</small><b>AI operations</b><em className="good">50% fit</em></div>
            <div><small>Robust picks</small><b>3</b><em>every scenario</em></div>
            <div><small>Current role</small><b>−30%</b><em className="risk">▼ Declining</em></div>
            <div><small>Plan</small><b>2 steps</b><em>about 12 h</em></div>
          </div>
          <div className="lp-card">
            <p><b>Not without a plan.</b> Data entry is declining in every scenario to 2030, but four of your six skills
              already count toward AI operations work. The gap is three skills.</p>
            <ol className="lp-roles">
              {ROLES.map((r) => (
                <li key={r.title} className={r.tone === "risk" ? "dim" : ""}>
                  <span>{r.title}</span>
                  <span className="lp-bar"><span style={{ width: `${r.fit}%` }} /></span>
                  <em className={r.tone}>{r.outlook}</em>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="lp-aside">
          <small>Your next steps</small>
          <div className="lp-step">
            <span className="lp-tag"><LogoMark size={16} /> Pathway step 1</span>
            <b>Critical thinking and problem solving</b>
            <span className="lp-meta">Free to audit · about 10 hours <i>Start</i></span>
          </div>
          <div className="lp-step">
            <span className="lp-tag"><LogoMark size={16} /> Coach suggested</span>
            <b>Compare with the Accelerated scenario</b>
            <span className="lp-meta">You decide <i>Apply</i></span>
          </div>
          <div className="lp-step">
            <span className="lp-tag"><LogoMark size={16} /> Future Card</span>
            <b>Share your plan with a counsellor</b>
            <span className="lp-meta">Read-only link and QR</span>
          </div>
        </div>
      </div>
      <p className="lp-caption">An example from the app, using the synthetic demo profile.</p>
    </div>
  );
}

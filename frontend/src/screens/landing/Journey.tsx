import { ReactNode, useState } from "react";

// "One afternoon with Laluan": the main journey as a timeline. Pick a step on the left to see a
// small picture of that screen on the right.
interface Step { time: string; title: string; text: string; panel: ReactNode }

const STEPS: Step[] = [
  {
    time: "14:00", title: "Tell it your skills",
    text: "Upload a CV, paste one, answer a short questionnaire or pick from a list. Names, emails and IC numbers are removed before any AI reads it.",
    panel: (
      <div className="jp-card">
        <p className="jp-label">Skills found in your CV</p>
        <div className="chips">
          {["Data entry", "Microsoft Excel", "Office administration", "Scheduling", "Communication", "Generative AI tools"].map((s) => (
            <span key={s} className="chip covered">✓ {s}</span>
          ))}
        </div>
        <p className="jp-note">Removed before reading: 1 name, 1 email, 1 phone number</p>
      </div>
    ),
  },
  {
    time: "14:05", title: "See which skills are moving",
    text: "The Future Skills Radar shows skills rising or declining, from research papers and job postings, each with its source and date.",
    panel: (
      <div className="jp-card jp-radar" title="Example layout">
        <div><p className="jp-label good">▲ Rising</p><span>AI tool use</span><span>Data analysis</span><span className="mine">Excel <i>Yours</i></span></div>
        <div><p className="jp-label">▬ Steady</p><span>Customer service</span><span>Communication</span></div>
        <div><p className="jp-label risk">▼ Declining</p><span className="mine">Data entry <i>Yours</i></span><span>Filing</span></div>
        <p className="jp-note jp-span">Example layout. Skill trends appear after an admin refreshes the trend data.</p>
      </div>
    ),
  },
  {
    time: "14:10", title: "Check your own job",
    text: "AI changes tasks before it changes jobs. Tick the tasks you actually do and see how much is likely to be automated, assisted, or left to you.",
    panel: (
      <div className="jp-card">
        <div className="split-bar"><span className="split automate" style={{ width: "60%" }} /><span className="split assist" style={{ width: "20%" }} /><span className="split human" style={{ width: "20%" }} /></div>
        <ul className="jp-legend"><li><i className="swatch automate" />60% AI likely to automate</li><li><i className="swatch assist" />20% AI assists you</li><li><i className="swatch human" />20% stays human</li></ul>
        <p className="jp-note">Data entry clerk, all tasks · O*NET 30.0</p>
      </div>
    ),
  },
  {
    time: "14:20", title: "Compare future roles",
    text: "Roles are ranked under slow, baseline and accelerated AI adoption. Every rank shows how much comes from your skills, the outlook and your goals.",
    panel: (
      <div className="jp-card">
        <div className="seg-mini"><span>Slow</span><span className="on">Baseline</span><span>Accelerated</span></div>
        <p className="jp-why"><b>Why this rank?</b> Skill fit 50% × 0.6 = 0.30 · Outlook × 0.4 = 0.23 · Serves SDG 4, 8 +0.05</p>
        <span className="badge gold">Robust pick: top five in every scenario</span>
      </div>
    ),
  },
  {
    time: "14:30", title: "Get a plan you can start",
    text: "Ordered courses for the skills you're missing, with hours and cost. Tick one off and your readiness and rankings update.",
    panel: (
      <div className="jp-card">
        <ol className="jp-plan">
          <li><b>Critical thinking and problem solving</b><span className="badge good">Free to audit</span></li>
          <li><b>ChatGPT Prompt Engineering for Developers</b><span className="badge good">Free</span></li>
        </ol>
        <div className="fit"><div style={{ width: "50%" }} /></div>
        <p className="jp-note">Readiness 50% · about 12 hours left</p>
      </div>
    ),
  },
  {
    time: "14:40", title: "Share it",
    text: "Make a read-only Future Card with a QR code to show a counsellor, an employer or your family. It never shows your full skill list.",
    panel: (
      <div className="jp-card jp-share">
        <div><p className="jp-label">Future Card</p><b>Moving toward AI operations specialist</b><span className="jp-note">Readiness 50% · 2 steps left</span></div>
        <div className="jp-qr" />
      </div>
    ),
  },
];

export function Journey() {
  const [active, setActive] = useState(0);
  const step = STEPS[active];
  return (
    <div className="lp-journey">
      <ol className="lp-times" role="tablist" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <button role="tab" aria-selected={i === active} aria-controls="journey-panel" onClick={() => setActive(i)}>
              <small>{s.time}</small>{s.title}
            </button>
          </li>
        ))}
      </ol>
      <div className="lp-journey-body" id="journey-panel" role="tabpanel">
        <p className="lp-two-tone small"><span>{step.title}.</span> {step.text}</p>
        <div className="lp-dots">{step.panel}</div>
      </div>
    </div>
  );
}

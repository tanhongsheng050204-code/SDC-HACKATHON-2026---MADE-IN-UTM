// Tools for the people who check Laluan's work (docs/EVALUATION.md, REVIEW_LOG.md): a native
// speaker checks the translations, a teammate marks the synthetic CVs without seeing the app's
// answers, and a lecturer or counsellor reviews the demo pathways. Nothing is stored on the
// server: each tab produces text to copy or a file to download, which the team commits.
import { useEffect, useMemo, useState } from "react";
import { api, Matches, Pathway, Skill } from "../lib/api";
import { allStrings } from "../lib/i18n";
import { load, save } from "../lib/storage";

type Tab = "translations" | "cvs" | "pathways";

export function ReviewKit() {
  const [tab, setTab] = useState<Tab>("translations");
  const [reviewer, setReviewer] = useState(() => load("laluan.kit.reviewer") ?? "");
  useEffect(() => save("laluan.kit.reviewer", reviewer), [reviewer]);
  return (
    <section>
      <div className="page-head"><h1>Review kit</h1>
        <p className="muted">For the people who check our work. Your answers stay in this browser until you copy or download them; send them to the team to commit.</p></div>
      <label className="narrow">Your name and role
        <input type="text" value={reviewer} maxLength={80} onChange={(e) => setReviewer(e.target.value)} placeholder="e.g. Nur Aina, native BM speaker" />
      </label>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "translations"} onClick={() => setTab("translations")}>1. Translations</button>
        <button role="tab" aria-selected={tab === "cvs"} onClick={() => setTab("cvs")}>2. Mark the CVs</button>
        <button role="tab" aria-selected={tab === "pathways"} onClick={() => setTab("pathways")}>3. Review the pathways</button>
      </div>
      {tab === "translations" && <Translations reviewer={reviewer} />}
      {tab === "cvs" && <CvMarking reviewer={reviewer} />}
      {tab === "pathways" && <PathwayReview reviewer={reviewer} />}
    </section>
  );
}

function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try { return JSON.parse(load(key) ?? "") as T; } catch { return initial; }
  });
  useEffect(() => save(key, JSON.stringify(value)), [key, value]);
  return [value, setValue] as const;
}

function Output({ text, filename }: { text: string; filename: string }) {
  const [copied, setCopied] = useState(false);
  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="card kit-output">
      <div className="card-row"><h3>Result</h3>
        <div className="actions">
          <button onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); } }}>{copied ? "Copied" : "Copy"}</button>
          <button className="primary" onClick={download}>Download {filename}</button>
        </div>
      </div>
      <pre>{text}</pre>
    </div>
  );
}

// ---------- 1. Translations ----------

type Verdict = { ms?: "ok" | "fix"; zh?: "ok" | "fix"; msFix?: string; zhFix?: string };

function Translations({ reviewer }: { reviewer: string }) {
  const interfaceRows = useMemo(allStrings, []);
  // Survey cards and preference labels live in the reference data, so fetch them to check too.
  const [dataRows, setDataRows] = useState<{ key: string; en: string; ms: string; zh: string }[]>([]);
  useEffect(() => {
    api.surveyBank().then((b) => setDataRows([
      ...b.cards.map((c) => ({ key: c.id, en: c.text.en, ms: c.text.ms, zh: c.text.zh })),
      ...b.dimensions.flatMap((d) => (["plus", "minus"] as const).map((pole) =>
        ({ key: `dim.${d.id}.${pole}`, en: d[pole].en, ms: d[pole].ms, zh: d[pole].zh }))),
    ])).catch(() => undefined);
  }, []);
  const rows = useMemo(() => [...interfaceRows, ...dataRows], [interfaceRows, dataRows]);
  const [lang, setLang] = useState<"ms" | "zh">("ms");
  const [verdicts, setVerdicts] = useStored<Record<string, Verdict>>("laluan.kit.translations", {});
  const set = (key: string, patch: Verdict) => setVerdicts({ ...verdicts, [key]: { ...verdicts[key], ...patch } });
  const done = rows.filter((r) => verdicts[r.key]?.[lang]).length;
  const fixes = rows.filter((r) => verdicts[r.key]?.[lang] === "fix");
  const name = lang === "ms" ? "Bahasa Malaysia" : "Chinese (简体中文)";
  const output = [
    `## ${name} check`, "", `Reviewer: ${reviewer || "______"} · Date: ${new Date().toISOString().slice(0, 10)} · Strings checked: ${done} of ${rows.length}`, "",
    "| Key | English | Current | Suggested |", "|---|---|---|---|",
    ...fixes.map((r) => `| ${r.key} | ${r.en} | ${r[lang]} | ${(lang === "ms" ? verdicts[r.key].msFix : verdicts[r.key].zhFix) || ""} |`),
    fixes.length === 0 ? "| (no changes needed) | | | |" : "",
  ].join("\n");
  return (
    <>
      <p className="muted">Read each line as a user would see it. Mark it OK, or write a better version. Role, course and task names stay in English on purpose.</p>
      <div className="segmented" role="radiogroup" aria-label="Language to check">
        <button role="radio" aria-checked={lang === "ms"} onClick={() => setLang("ms")}>Bahasa Malaysia</button>
        <button role="radio" aria-checked={lang === "zh"} onClick={() => setLang("zh")}>中文</button>
      </div>
      <p><strong>{done} of {rows.length}</strong> checked · {fixes.length} to fix</p>
      <div className="table-wrap card">
        <table className="heatmap kit-table">
          <thead><tr><th>English</th><th>{name}</th><th>OK?</th><th>Better version</th></tr></thead>
          <tbody>
            {rows.filter((r) => r.en).map((r) => {
              const v = verdicts[r.key]?.[lang];
              const fix = lang === "ms" ? verdicts[r.key]?.msFix : verdicts[r.key]?.zhFix;
              return (
                <tr key={r.key}>
                  <td>{r.en}</td>
                  <td lang={lang === "ms" ? "ms" : "zh-Hans"}>{r[lang]}</td>
                  <td className="kit-verdict">
                    <button className={v === "ok" ? "chip covered" : "chip"} aria-pressed={v === "ok"} onClick={() => set(r.key, { [lang]: "ok" })}>OK</button>
                    <button className={v === "fix" ? "chip missing" : "chip"} aria-pressed={v === "fix"} onClick={() => set(r.key, { [lang]: "fix" })}>Fix</button>
                  </td>
                  <td>{v === "fix" && (
                    <input type="text" aria-label={`Better ${name} for: ${r.en}`} value={fix ?? ""}
                      onChange={(e) => set(r.key, lang === "ms" ? { msFix: e.target.value } : { zhFix: e.target.value })} />
                  )}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Output text={output} filename={`translation-check-${lang}.md`} />
    </>
  );
}

// ---------- 2. CV marking ----------

function CvMarking({ reviewer }: { reviewer: string }) {
  const [cvs, setCvs] = useState<{ name: string; text: string }[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [current, setCurrent] = useState(0);
  const [marks, setMarks] = useStored<Record<string, string[]>>("laluan.kit.cvs", {});
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([api.evalCvs(), api.skills()]).then(([c, s]) => { setCvs(c); setSkills(s); })
      .catch(() => setError("Couldn't load the CVs. Check the connection and reload."));
  }, []);
  if (error) return <p className="error" role="alert">{error}</p>;
  if (!cvs.length) return <p className="muted">Loading the CVs…</p>;

  const cv = cvs[current];
  const picked = marks[cv.name] ?? [];
  const toggle = (id: string) => setMarks({ ...marks, [cv.name]: picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id] });
  const byCategory = skills.filter((s) => s.name.toLowerCase().includes(filter.toLowerCase()))
    .reduce<Record<string, Skill[]>>((acc, s) => { (acc[s.category] ??= []).push(s); return acc; }, {});
  const output = JSON.stringify({
    _about: "Skill IDs from data/skills.json that a person sees in each CV. Marked in the review kit without seeing the app's extraction.",
    marked_by: reviewer || null,
    cvs: Object.fromEntries(cvs.map((c) => [c.name, [...(marks[c.name] ?? [])].sort()])),
  }, null, 2);

  return (
    <>
      <p className="muted">Read each CV and tick every skill the person clearly has. You won't see what the app found: that keeps the test fair. Please don't mark the CVs if you wrote the skill dictionary.</p>
      <div className="segmented" role="radiogroup" aria-label="CV">
        {cvs.map((c, i) => (
          <button key={c.name} role="radio" aria-checked={i === current} onClick={() => setCurrent(i)}>
            CV {i + 1}{(marks[c.name]?.length ?? 0) > 0 ? ` (${marks[c.name].length})` : ""}
          </button>
        ))}
      </div>
      <div className="kit-cv">
        <pre className="card kit-cv-text">{cv.text}</pre>
        <div className="card kit-skills">
          <div className="card-row"><h3>Skills you see in CV {current + 1}</h3><span className="badge">{picked.length} ticked</span></div>
          <input type="search" aria-label="Filter skills" placeholder="Filter skills" value={filter} onChange={(e) => setFilter(e.target.value)} />
          {Object.entries(byCategory).map(([category, list]) => (
            <fieldset key={category}><legend>{category === "ai" ? "AI" : category[0].toUpperCase() + category.slice(1)}</legend>
              <div className="chips">
                {list.map((s) => (
                  <button key={s.id} className={picked.includes(s.id) ? "chip covered" : "chip"} aria-pressed={picked.includes(s.id)} onClick={() => toggle(s.id)}>{s.name}</button>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </div>
      <Output text={output} filename="person_marked.json" />
      <p className="source">Next: save this as <code>backend/data/eval/person_marked.json</code> and run <code>python scripts/eval_extraction.py</code> for the recall table in EVALUATION.md.</p>
    </>
  );
}

// ---------- 3. Pathway review ----------

const PERSONAS = [{ key: "clerk", label: "Aisyah (working adult)" }, { key: "student", label: "Wei Jie (graduate)" },
  { key: "switcher", label: "Farid (career switcher)" }];
// The two group views, reviewed from their synthetic samples.
const GROUPS = [{ key: "hr", label: "HR sample company (160 people)" }, { key: "class", label: "Career-centre sample class (40 students)" }];
type Answer = { roles?: string; pathway?: string; comment?: string };

function PathwayReview({ reviewer }: { reviewer: string }) {
  const [data, setData] = useState<Record<string, { story: string; matches: Matches; plan: Pathway | null }>>({});
  const [groups, setGroups] = useState<Record<string, string[]>>({});
  const [answers, setAnswers] = useStored<Record<string, Answer>>("laluan.kit.pathways", {});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const out: typeof data = {};
        for (const p of PERSONAS) {
          const profile = await api.demoProfile(p.key);
          const matches = await api.matches(profile.id, "baseline");
          const plan = matches.roles[0] ? await api.pathway(profile.id, matches.roles[0].role_id) : null;
          out[p.key] = { story: profile.story ?? "", matches, plan };
          api.deleteProfile(profile.id).catch(() => undefined);
        }
        setData(out);
        const hr = await api.workforce(await api.workforceSample(), "baseline");
        const cls = await api.classAnalyse(await api.classSample(), "baseline");
        setGroups({
          hr: hr.moves.slice(0, 3).map((m) => `${m.from_role} → ${m.to_role}: ${m.people} people, about ${m.avg_hours} h each`),
          class: [...cls.best_fit.slice(0, 3).map((r) => `Best fit: ${r.title} (${r.students} students)`),
                  ...cls.top_gaps.slice(0, 3).map((g) => `Gap: ${g.name} (${g.students} students) → ${g.course?.title ?? "no course"}`)],
        });
      } catch { setError("Couldn't load the demo results. Check the connection and reload."); }
    })();
  }, []);
  if (error) return <p className="error" role="alert">{error}</p>;
  if (!Object.keys(data).length) return <p className="muted">Loading the demo results…</p>;

  const set = (key: string, patch: Answer) => setAnswers({ ...answers, [key]: { ...answers[key], ...patch } });
  const output = [
    `Reviewer: ${reviewer || "______"} · Date: ${new Date().toISOString().slice(0, 10)}`, "",
    "| Persona | Top 3 roles shown | Reviewer agrees? | Pathway sensible? | Reviewer comments | What we changed |",
    "|---|---|---|---|---|---|",
    ...PERSONAS.map((p) => {
      const d = data[p.key]; const a = answers[p.key] ?? {};
      return `| ${p.label} | ${d.matches.roles.slice(0, 3).map((r) => r.title).join(", ")} | ${a.roles ?? ""} | ${a.pathway ?? ""} | ${(a.comment ?? "").replace(/\n/g, " ")} | |`;
    }),
    ...GROUPS.map((g) => {
      const a = answers[g.key] ?? {};
      return `| ${g.label} | ${(groups[g.key] ?? []).slice(0, 2).join("; ")} | ${a.roles ?? ""} | ${a.pathway ?? ""} | ${(a.comment ?? "").replace(/\n/g, " ")} | |`;
    }),
  ].join("\n");

  return (
    <>
      <p className="muted">For a lecturer or career counsellor. These are the app's real results for the three synthetic demo people and the two sample groups, under the baseline scenario. Would you give this advice?</p>
      {PERSONAS.map((p) => {
        const d = data[p.key]; const a = answers[p.key] ?? {};
        return (
          <div key={p.key} className="card kit-persona">
            <h2>{p.label}</h2>
            <p className="muted">{d.story}</p>
            <div className="two-col">
              <div>
                <h3>Top roles</h3>
                <ol>{d.matches.roles.slice(0, 5).map((r) => <li key={r.role_id}>{r.title}: {Math.round(r.fit * 100)}% skill fit, outlook {r.outlook.baseline.index > 0 ? "+" : ""}{r.outlook.baseline.index}% to {d.matches.signal_source.horizon_year}</li>)}</ol>
              </div>
              <div>
                <h3>Plan for {d.matches.roles[0]?.title}</h3>
                {d.plan && d.plan.steps.length > 0 ? (
                  <ol>{d.plan.steps.map((s) => <li key={s.step}>{s.course.title} ({s.course.provider}), about {s.course.hours} h, for {s.skills.map((k) => k.name).join(", ")}</li>)}</ol>
                ) : <p className="muted">No courses needed.</p>}
              </div>
            </div>
            <Question label="Do you agree with the top 3 roles?" value={a.roles} onChange={(v) => set(p.key, { roles: v })} />
            <Question label="Is the pathway sensible for this person?" value={a.pathway} onChange={(v) => set(p.key, { pathway: v })} />
            <label>Comments: what would you change?
              <textarea rows={3} value={a.comment ?? ""} onChange={(e) => set(p.key, { comment: e.target.value })} />
            </label>
          </div>
        );
      })}
      {GROUPS.map((g) => {
        const a = answers[g.key] ?? {};
        return (
          <div key={g.key} className="card kit-persona">
            <h2>{g.label}</h2>
            <ul>{(groups[g.key] ?? []).map((line) => <li key={line}>{line}</li>)}</ul>
            <Question label="Do you agree with these results?" value={a.roles} onChange={(v) => set(g.key, { roles: v })} />
            <Question label="Would they help this group decide on reskilling?" value={a.pathway} onChange={(v) => set(g.key, { pathway: v })} />
            <label>Comments: what would you change?
              <textarea rows={3} value={a.comment ?? ""} onChange={(e) => set(g.key, { comment: e.target.value })} />
            </label>
          </div>
        );
      })}
      <Output text={output} filename="pathway-review.md" />
      <p className="source">Next: paste this into section 2 of <code>docs/EVALUATION.md</code> and fill in "What we changed".</p>
    </>
  );
}

function Question({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  return (
    <fieldset className="kit-question"><legend>{label}</legend>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {["Yes", "Partly", "No"].map((o) => <button key={o} role="radio" aria-checked={value === o} onClick={() => onChange(o)}>{o}</button>)}
      </div>
    </fieldset>
  );
}

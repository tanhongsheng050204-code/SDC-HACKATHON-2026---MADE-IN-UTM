import { EntryRequirements, qualificationText } from "../components/EntryRequirements";
import { ApplicationTracker } from "../components/ApplicationTracker";
import { SwitchCost } from "../components/SwitchCost";
import { Helpful } from "../components/Helpful";
import { useEffect, useState, type ReactNode } from "react";
import { ShareCard } from "../components/ShareCard";
import { PayLine } from "../components/PayLine";
import { ExposureBand } from "../components/Exposure";
import { ForecastHistory } from "../components/ForecastHistory";
import { InterviewPractice } from "../components/InterviewPractice";
import { IdentityStatement, Programmes } from "../components/MalaysiaPanels";
import { JobPostings } from "../components/JobPostings";
import { Openings } from "../components/Openings";
import { RoleCase } from "../components/RoleCase";
import { SdgReasons } from "../components/Sdgs";
import { Sheet } from "../components/Sheet";
import { SignalXray } from "../components/SignalXray";
import { EvidenceList } from "../components/SkillEvidence";
import { Tabs } from "../components/Tabs";
import { Icon } from "../components/Icon";
import { DecisionCard } from "../components/PlanGuard";
import { api, DayInJob, Profile, RoleCase as RoleCaseData, RoleMatch, RoleTasks, Scenario } from "../lib/api";
import { onetUrl, percent } from "../lib/format";
import { getLang, pick, t, tf, tr, type StringKey } from "../lib/i18n";
import { OUTLOOK_TEXT, SCENARIOS } from "../lib/labels";
import type { RoleTab } from "../lib/route";

type Source = "fit" | "outlook" | "pay" | "entry" | "rank";
const VERDICT: Record<string, StringKey> = { growing: "rp.vGrow", emerging: "rp.vNew", stable: "rp.vSteady", declining: "rp.vDecl" };
const TONE: Record<string, string> = { growing: "good", emerging: "good", stable: "gold", declining: "risk" };
const ARROW: Record<string, string> = { growing: "▲", emerging: "▲", stable: "■", declining: "▼" };
const TASK_TAG: Record<string, StringKey> = { human: "rp.tagPeople", assist: "rp.tagHelps", automate: "rp.tagDoes" };
const signedPct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(Math.round(n))}%`;
const rm = (n: number) => `RM ${n.toLocaleString("en-MY")}`;
const bare = (label: string) => label.replace(/^[^\p{L}]+/u, "");  // "▲ Growing" → "Growing": the tile shows its own arrow

// One role: a verdict and four fact tiles answer "is this for me?", one main button says what to do
// next, and four tabs hold the detail. Every number's source and the rank's maths open in a side
// sheet. The tab is kept in the address (?tab=).
export function RoleDetail({ profile, role, scenario, adoption, tab, onTab, onImpact, onTree, onProfile, onRole, onFlash, onBack }: {
  profile: Profile; role: RoleMatch; scenario: Scenario; adoption?: number; tab: RoleTab; onTab: (t: RoleTab) => void;
  onImpact: () => void; onTree: () => void; onProfile: (p: Profile) => void; onRole: (r: RoleMatch) => void;
  onFlash: (message: string) => void; onBack: () => void;
}) {
  const [xray, setXray] = useState<Scenario | null>(null);
  const [roleCase, setRoleCase] = useState<RoleCaseData | null>(null);
  const [day, setDay] = useState<DayInJob | null>(null);
  const [tasks, setTasks] = useState<RoleTasks | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.day(role.role_id).then(setDay).catch(() => setDay(null)); }, [role.role_id]);
  useEffect(() => { api.tasks(role.role_id).then(setTasks).catch(() => setTasks(null)); }, [role.role_id]);
  useEffect(() => { api.roleCase(profile.id, role.role_id).then(setRoleCase).catch(() => setRoleCase(null)); }, [profile.id, role.role_id, profile.skills]);
  const tabs: { id: RoleTab; label: string }[] = [
    { id: "overview", label: t("rtab.overview") }, { id: "fit", label: t("rtab.fit") },
    { id: "market", label: t("rtab.market") }, { id: "practise", label: t("rtab.practise") },
  ];

  const now = role.outlook[scenario];
  const labels = SCENARIOS.map((s) => role.outlook[s.id]?.label);
  const sameEverywhere = labels.every((l) => l === now.label);
  const total = role.covered.length + role.missing.length;
  const core = role.missing.filter((s) => s.weight === 3).length;
  const horizon = role.estimate_range.horizon_year;
  const isTarget = profile.target_role_id === role.role_id;
  const req = role.requirements;

  async function setTarget(next: string | null) {
    setBusy(true);
    try { onProfile(await api.setTarget(profile.id, next)); }
    catch { onFlash(t("target.failed")); }
    finally { setBusy(false); }
  }
  // "+ I have this": the skill goes on the profile and the role is matched again, so fit moves at once.
  async function haveSkill(id: string, name: string) {
    setBusy(true);
    try {
      const p = await api.updateProfile({ ...profile, skills: [...profile.skills, id] });
      onProfile(p);
      const m = await api.matches(p.id, scenario, role.estimate_range.year, adoption);
      const again = m.roles.find((r) => r.role_id === role.role_id);
      if (again) onRole(again);
      onFlash(tf("rp.added", { skill: tr(name) }));
    } catch { onFlash(t("rp.addFailed")); }
    finally { setBusy(false); }
  }

  const reasons: { ok: boolean; text: string }[] = [];
  if (labels.every((l) => l === "growing" || l === "emerging")) reasons.push({ ok: true, text: t("rp.cAllGrow") });
  else if (now.label === "declining") reasons.push({ ok: false, text: tf("rp.cShrinks", { year: horizon }) });
  if (role.missing.length === 0) reasons.push({ ok: true, text: t("rp.cAll") });
  else if (core > 0) reasons.push({ ok: false, text: tf("rp.cCore", { n: core }) });
  if (role.why.entry_points > 0) reasons.push({ ok: true, text: t("rp.cGrads") });
  if (role.why.preference_points > 0) reasons.push({ ok: true, text: t("rp.cEnjoy") });
  if (role.plan_hours) reasons.push({ ok: true, text: tf("rp.cPlan", { h: Math.round(role.plan_hours) }) });
  if (req?.needs_licence) reasons.push({ ok: false, text: t("rp.licence") });

  const sheets: Record<Source, { title: string; body: ReactNode }> = {
    fit: { title: t("rp.fit"), body: (
      <>
        <p>{tf("rp.ofSkills", { n: role.covered.length, total })} · {percent(role.fit)}% {t("k.fit")}</p>
        <p className="source">{t("rd.skillsSource")}{role.skills_source.onet_code
          ? <>{t("rd.onetChecked")} <a href={onetUrl(role.skills_source.onet_code)} target="_blank" rel="noreferrer">{role.skills_source.onet_code}</a></>
          : ` ${t("rd.noOnet")}`}.</p>
      </>
    ) },
    outlook: { title: tf("rp.outlook", { year: horizon }), body: (
      <>
        <ul className="role-bars-list">{SCENARIOS.map((s) => <li key={s.id}>{s.label}: <strong>{signedPct(role.outlook[s.id].index)}</strong> · {OUTLOOK_TEXT[role.outlook[s.id].label]}</li>)}</ul>
        <p className="source">{tf("rd.outlookSource", { id: role.citation.snapshot_id, date: role.citation.imported })}{role.citation.note && ` · ${role.citation.note}`}</p>
      </>
    ) },
    pay: { title: t("rp.pay"), body: role.pay && (
      <>
        <PayLine pay={role.pay} change={role.pay_change_rm} />
        <p className="source"><a href={role.pay.source_url} target="_blank" rel="noreferrer">{role.pay.source}</a>, {role.pay.table}</p>
      </>
    ) },
    entry: { title: t("rp.entry"), body: req && <EntryRequirements req={req} /> },
    rank: { title: t("rp.rankTitle"), body: (
      <>
        <p>{tf("rp.rankIntro", { rank: role.rank, score: role.why.score.toFixed(2) })}</p>
        <ul className="role-math">
          <li><span>{tf("rd.fitPart", { n: percent(role.why.fit) })}</span><strong>{role.why.fit_points.toFixed(2)}</strong></li>
          <li><span>{t("rd.outlookPart")}</span><strong>{role.why.outlook_points.toFixed(2)}</strong></li>
          {role.why.entry_points > 0 && <li><span>{t("lead.openToGrads")}</span><strong>+{role.why.entry_points.toFixed(2)}</strong></li>}
          {role.why.preference_points > 0 && <li><span>{t("rd.prefPart")}{role.why.matched_preferences.length > 0 && ` (${role.why.matched_preferences.map((m) => pick(m.labels, m.label)).join(", ")})`}</span><strong>+{role.why.preference_points.toFixed(2)}</strong></li>}
          <li><span>{t("rp.score")}</span><strong>{role.why.score.toFixed(2)}</strong></li>
        </ul>
        <p className="source">{tf("rd.outlookSource", { id: role.citation.snapshot_id, date: role.citation.imported })}{role.citation.note && ` · ${role.citation.note}`}</p>
      </>
    ) },
  };
  const info = (s: Source, label: string) => (
    <button className="role-i" aria-label={`${t("rp.source")}: ${label}`} onClick={() => setSource(s)}>i</button>
  );
  const maxBar = Math.max(1, ...SCENARIOS.map((s) => Math.abs(role.outlook[s.id].index)));

  return (
    <section className="role-page">
      <button className="link back-link" onClick={onBack}>← {t("nav.roles")}</button>
      <div className="role-hero">
        <div>
          <h1>{tr(role.title)}</h1>
          <p className="muted">{tr(role.summary)}</p>
          {role.being_checked && <p className="badge" title={t("card.newRoleHelp")}>{t("card.newRole")}</p>}
          {VERDICT[now.label] && (
            <p className={`role-verdict ${TONE[now.label]}`}>{tf(VERDICT[now.label], { n: role.covered.length, total })}</p>
          )}
        </div>
        <div className="role-actions">
          {isTarget ? (
            <>
              {role.missing.length > 0 && <button className="primary" onClick={onTree}>{t("a.build")}</button>}
              <span className="role-dest"><Icon name="target" /> {t("target.yours")}
                <button className="link" disabled={busy} onClick={() => setTarget(null)}>{t("target.clear")}</button></span>
            </>
          ) : (
            <>
              <button className="primary" disabled={busy} onClick={() => setTarget(role.role_id)}>
                <Icon name="target" /> {profile.target_role_id ? t("target.switch") : t("target.make")}</button>
              {role.missing.length > 0 && <button className="link" onClick={onTree}>{t("a.build")}</button>}
            </>
          )}
        </div>
      </div>

      <div className="role-tiles">
        <div className="role-tile">
          <span className="role-tile-k">{t("rp.fit")} {info("fit", t("rp.fit"))}</span>
          <div className="role-ring">
            <svg viewBox="0 0 36 36" aria-hidden="true"><circle className="track" cx="18" cy="18" r="15" />
              <circle className="fill" cx="18" cy="18" r="15" strokeDasharray={`${(role.fit * 94.25).toFixed(1)} 94.25`} /></svg>
            <span><strong className="role-tile-v">{percent(role.fit)}%</strong><span className="role-tile-s">{tf("rp.ofSkills", { n: role.covered.length, total })}</span></span>
          </div>
        </div>
        <div className={`role-tile ${TONE[now.label] ?? ""}`}>
          <span className="role-tile-k">{tf("rp.outlook", { year: horizon })} {info("outlook", tf("rp.outlook", { year: horizon }))}</span>
          <strong className="role-tile-v">{ARROW[now.label] ?? ""} {signedPct(now.index)}</strong>
          <span className="role-tile-s">{tf(sameEverywhere ? "rp.allSpeeds" : "rp.expected", { label: bare(OUTLOOK_TEXT[now.label]) })}</span>
        </div>
        {role.pay && (
          <div className="role-tile">
            <span className="role-tile-k">{t("rp.pay")} {info("pay", t("rp.pay"))}</span>
            <strong className="role-tile-v">{rm(role.pay.median_rm)}</strong>
            <span className="role-tile-s">{t("rp.payMonth")}</span>
          </div>
        )}
        {req && (
          <div className={`role-tile${req.needs_licence ? " risk" : ""}`}>
            <span className="role-tile-k">{t("rp.entry")} {info("entry", t("rp.entry"))}</span>
            <strong className="role-tile-v small">{req.needs_licence && req.licence ? tr(req.licence.name) : qualificationText(req, true)}</strong>
            <span className="role-tile-s">{req.needs_licence ? t("rp.licence") : t("rp.noLicence")}</span>
          </div>
        )}
      </div>

      <div className="role-reasons">
        {reasons.map((r) => <span key={r.text} className={`role-reason ${r.ok ? "ok" : "warn"}`}>{r.ok ? "✓" : "△"} {r.text}</span>)}
        <button className="link" onClick={() => setSource("rank")}>{tf("rp.rank", { n: role.rank })}</button>
      </div>
      {isTarget && <DecisionCard profile={profile} />}

      <Tabs id="role" label={tr(role.title)} tabs={tabs} value={tab} onChange={onTab}>
        {tab === "overview" && (
          <>
            <div className="role-grid">
              <section className="card role-card" aria-labelledby="onjob-h">
                <h2 id="onjob-h">{t("rp.onJob")}</h2>
                {tasks && tasks.tasks.length > 0 ? (
                  <ul className="role-tasks">
                    {tasks.tasks.map((x) => (
                      <li key={x.id}><span>{tr(x.short || x.text)}</span><span className={`role-tag ${x.label}`}>{t(TASK_TAG[x.label])}</span></li>
                    ))}
                  </ul>
                ) : day && <p>{day.text[getLang()] || day.text.en}</p>}
                {day && tasks && tasks.tasks.length > 0 && (
                  <details className="role-more"><summary>{t("day.title")}</summary>
                    <p>{day.text[getLang()] || day.text.en}</p>
                    <p className="source">{day.basis === "job_ads"
                      ? t("day.ads").replace("{name}", day.reviewed_by ?? "—").replace("{date}", day.drafted)
                      : t("day.data")}</p>
                  </details>
                )}
              </section>
              <section className="card role-card" aria-labelledby="outlook-h">
                <h2 id="outlook-h">{tf("rp.outlook", { year: horizon })}</h2>
                <p className="role-out"><strong className={TONE[now.label] ?? ""}>{ARROW[now.label] ?? ""} {signedPct(now.index)}</strong>
                  <span className="muted">{now.index < 0 ? t("rp.fewer") : t("rp.more")}</span></p>
                <ul className="role-bars">
                  {SCENARIOS.map((s) => {
                    const o = role.outlook[s.id];
                    const name = s.id === scenario && adoption !== undefined ? `${t("adopt.label")} ${adoption}×` : s.label;
                    return (
                      <li key={s.id} className={s.id === scenario ? "current" : ""}>
                        <span>{name}</span>
                        <span className={`role-bar ${o.index < 0 ? "neg" : ""}`}><i style={{ width: `${(Math.abs(o.index) / maxBar) * 100}%` }} /></span>
                        <span>{signedPct(o.index)}</span>
                      </li>
                    );
                  })}
                </ul>
                <button className="link" onClick={() => setXray(scenario)}>{t("rp.drives")} →</button>
                <details className="role-more"><summary>{t("rp.history")}</summary>
                  <ForecastHistory roleId={role.role_id} scenario={scenario} /></details>
              </section>
            </div>
            {roleCase && <RoleCase data={roleCase} />}
          </>
        )}

        {tab === "fit" && (
          <>
            <section className="card role-card" aria-labelledby="have-h">
              <h2 id="have-h">{tf("rp.haveN", { n: role.covered.length, total })}</h2>
              <div className="role-progress" aria-hidden="true"><i style={{ width: `${total ? (role.covered.length / total) * 100 : 0}%` }} /></div>
              <div className="role-grid">
                <div className="role-skillcol">
                  <h3>{t("rp.have")}</h3>
                  <div className="chips">
                    {role.carry_over.filter((c) => !role.covered.some((s) => s.skill_id === c.skill_id)).map((s) => <span key={`c-${s.skill_id}`} className="chip covered">↪ {tr(s.name)}</span>)}
                    {role.covered.map((s) => <span key={s.skill_id} className="chip covered">✓ {tr(s.name)}{s.added_from_ads && <span title={t("ev.added")}> ⁺</span>}</span>)}
                  </div>
                </div>
                <div className="role-skillcol">
                  <h3>{t("rp.toLearn")}</h3>
                  <ul className="role-need">
                    {role.missing.map((s) => (
                      <li key={s.skill_id} className="chip missing" title={s.added_from_ads ? t("ev.added") : undefined}>
                        <span>{tr(s.name)}{s.weight === 3 && <span className="role-core"> {t("rd.core")}</span>}{s.added_from_ads && " ⁺"}</span>
                        <button className="role-have" disabled={busy} aria-label={tf("rp.iHaveAria", { skill: tr(s.name) })}
                          onClick={() => haveSkill(s.skill_id, s.name)}>{t("rp.iHave")}</button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              {role.missing.length === 0 ? (
                <div className="empty-state">
                  <p><strong>{t("rd.allSkills")}</strong> {t("rd.allSkillsNext")}</p>
                  <div className="actions">
                    <button onClick={onBack}>{t("rd.stretch")}</button>
                    <button onClick={onImpact}>{t("a.impact")}</button>
                  </div>
                </div>
              ) : (
                <div className="actions">
                  <button className="primary" onClick={onTree}>{t("a.build")}</button>
                  <button className="link" onClick={onImpact}>{t("a.impact")}</button>
                </div>
              )}
            </section>
            <SwitchCost profile={profile} role={role} />
            <details className="card role-fold">
              <summary>{t("rp.sources")}</summary>
              <p className="source">{t("rd.skillsSource")}{role.skills_source.onet_code
                ? <>{t("rd.onetChecked")} <a href={onetUrl(role.skills_source.onet_code)} target="_blank" rel="noreferrer">{role.skills_source.onet_code}</a>{role.skills_source.onet_note && ` (${role.skills_source.onet_note.replace(/\.$/, "")})`}</>
                : ` ${t("rd.noOnet")}`}.</p>
              {role.evidence && (
                <EvidenceList evidence={role.evidence}
                  names={Object.fromEntries([...role.covered, ...role.missing].map((s) => [s.skill_id, s.name]))}
                  added={new Set([...role.covered, ...role.missing].filter((s) => s.added_from_ads).map((s) => s.skill_id))} />
              )}
              <SdgReasons sdgs={role.sdgs} title={t("sdg.roleTitle")} />
            </details>
          </>
        )}

        {tab === "market" && (
          <div className="role-rows">
            <Row title="rp.openings" hint="rp.openingsHint" open><Openings roleId={role.role_id} roleTitle={tr(role.title)} profileId={profile.id} /></Row>
            <Row title="rp.ads" hint="rp.adsHint"><JobPostings roleId={role.role_id} title={tr(role.title)} /></Row>
            <Row title="rp.courses" hint="rp.coursesHint"><Programmes roleId={role.role_id} /></Row>
            <Row title="rp.track" hint="rp.trackHint"><ApplicationTracker profileId={profile.id} roleId={role.role_id} /></Row>
            <Row title="rp.exposure" hint="rp.exposureHint"><ExposureBand roleId={role.role_id} /></Row>
          </div>
        )}

        {tab === "practise" && (
          <div className="role-rows">
            <Row title="rp.pitch" hint="rp.pitchHint" open><IdentityStatement profileId={profile.id} roleId={role.role_id} /></Row>
            <Row title="rp.interview" hint="rp.interviewHint"><InterviewPractice profileId={profile.id} roleId={role.role_id} /></Row>
            <Row title="rp.share" hint="rp.shareHint"><ShareCard profile={profile} roleId={role.role_id} /></Row>
          </div>
        )}
      </Tabs>
      <Helpful target="role_advice" subject={role.role_id} />

      {source && sheets[source].body && <Sheet title={sheets[source].title} onClose={() => setSource(null)}>{sheets[source].body}</Sheet>}
      {xray && <SignalXray roleId={role.role_id} scenario={xray} year={role.estimate_range.year}
        adoption={xray === scenario ? adoption : undefined} onClose={() => setXray(null)} />}
    </section>
  );
}

/** One line with its title and a short hint; the panel opens in place below it. */
function Row({ title, hint, open = false, children }: { title: StringKey; hint: StringKey; open?: boolean; children: ReactNode }) {
  return (
    <details className="role-row" open={open}>
      <summary><strong>{t(title)}</strong><span className="muted">{t(hint)}</span></summary>
      <div className="role-row-body">{children}</div>
    </details>
  );
}

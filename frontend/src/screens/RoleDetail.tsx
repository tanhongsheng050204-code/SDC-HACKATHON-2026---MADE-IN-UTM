import { useEffect, useState } from "react";
import { ShareCard } from "../components/ShareCard";
import { PayLine } from "../components/PayLine";
import { RoleCase } from "../components/RoleCase";
import { SignalXray } from "../components/SignalXray";
import { EvidenceList } from "../components/SkillEvidence";
import { SdgReasons } from "../components/Sdgs";
import { ForecastHistory } from "../components/ForecastHistory";
import { api, DayInJob, Profile, RoleCase as RoleCaseData, RoleMatch, Scenario } from "../lib/api";
import { jobLinks, onetUrl, percent } from "../lib/format";
import { getLang, pick, t, tf, tr } from "../lib/i18n";
import { OUTLOOK_TEXT, SCENARIOS } from "../lib/labels";

export function RoleDetail({ profile, role, scenario, adoption, onImpact, onTree, onProfile, onBack }: {
  profile: Profile; role: RoleMatch; scenario: Scenario; adoption?: number;
  onImpact: () => void; onTree: () => void; onProfile: (p: Profile) => void; onBack: () => void;
}) {
  const [error] = useState<string | null>(null);
  const [xray, setXray] = useState<Scenario | null>(null);
  const [roleCase, setRoleCase] = useState<RoleCaseData | null>(null);
  const [day, setDay] = useState<DayInJob | null>(null);
  useEffect(() => { api.day(role.role_id).then(setDay).catch(() => setDay(null)); }, [role.role_id]);
  useEffect(() => { api.roleCase(profile.id, role.role_id).then(setRoleCase).catch(() => setRoleCase(null)); }, [profile.id, role.role_id, profile.skills]);

  return (
    <section>
      <button className="link back-link" onClick={onBack}>← {t("nav.roles")}</button>
      <div className="page-head"><h1>{tr(role.title)}</h1><p className="muted">{tr(role.summary)}</p></div>

      {day && (
        <section className="card day-in-job" aria-labelledby="day-title">
          <h2 id="day-title">{t("day.title")}</h2>
          <p>{day.text[getLang()] || day.text.en}</p>
          <p className="source">{day.basis === "job_ads"
            ? t("day.ads").replace("{name}", day.reviewed_by ?? "—").replace("{date}", day.drafted)
            : t("day.data")}</p>
        </section>
      )}

      <details className="card why" open>
        <summary>{tf("rd.why", { n: role.why.score.toFixed(2) })}</summary>
        <ul>
          <li>{tf("rd.fitPart", { n: percent(role.why.fit) })} = <strong>{role.why.fit_points.toFixed(2)}</strong></li>
          <li>{t("rd.outlookPart")} = <strong>{role.why.outlook_points.toFixed(2)}</strong></li>
          {role.why.entry_points > 0 && <li>{t("lead.openToGrads")}: <strong>+{role.why.entry_points.toFixed(2)}</strong></li>}
          {role.why.preference_points > 0 && <li>{t("rd.prefPart")}: <strong>+{role.why.preference_points.toFixed(2)}</strong>{role.why.matched_preferences.length > 0 && ` (${role.why.matched_preferences.map((m) => pick(m.labels, m.label)).join(", ")})`}</li>}
        </ul>
        <p className="source">{tf("rd.outlookSource", { id: role.citation.snapshot_id, date: role.citation.imported })}{role.citation.note && ` · ${role.citation.note}`}</p>
      </details>

      <table className="outlooks">
        <caption>{tf("rd.caption", { s: t(`sc.${scenario}`) })}</caption>
        <tbody>{SCENARIOS.map((s) => {
          const o = role.outlook[s.id];
          return <tr key={s.id}><th scope="row">{s.id === scenario && adoption !== undefined ? `${t("adopt.label")} ${adoption}×` : s.label}</th><td className={`outlook ${o.label}`}>{OUTLOOK_TEXT[o.label]}</td>
            <td><button className="link xray-link" onClick={() => setXray(s.id)} aria-label={`${t("xray.title")}: ${s.label}`}>{o.index > 0 ? "+" : ""}{o.index}% 🔍</button></td></tr>;
        })}</tbody>
      </table>

      <p className="source">{t("xray.hint")}</p>
      <ForecastHistory roleId={role.role_id} scenario={scenario} />
      <PayLine pay={role.pay} change={role.pay_change_rm} />
      {xray && <SignalXray roleId={role.role_id} scenario={xray} year={role.estimate_range.year}
        adoption={xray === scenario ? adoption : undefined} onClose={() => setXray(null)} />}
      <div className="job-links"><span className="muted">{t("rd.jobs")}</span>
        {jobLinks(role.title).map((l) => <a key={l.label} href={l.url} target="_blank" rel="noreferrer">{l.label} ↗</a>)}
      </div>

      {roleCase && <RoleCase data={roleCase} />}

      <div className="two-col">
        {role.carry_over.length > 0 && (
          <div className="carry-block"><h2>{t("lead.bring")}</h2><div className="chips">{role.carry_over.map((s) => <span key={s.skill_id} className="chip covered">↪ {tr(s.name)}</span>)}</div></div>
        )}
        <div><h2>{t("rd.have")}</h2><div className="chips">{role.covered.map((s) => <span key={s.skill_id} className="chip covered">✓ {tr(s.name)}{s.added_from_ads && " ⁺"}</span>)}</div></div>
        <div><h2>{t("rd.need")}</h2><div className="chips">{role.missing.map((s) => <span key={s.skill_id} className="chip missing" title={s.added_from_ads ? t("ev.added") : undefined}>{tr(s.name)}{s.weight === 3 ? ` ${t("rd.core")}` : ""}{s.added_from_ads && " ⁺"}</span>)}</div></div>
      </div>
      <p className="source">{t("rd.skillsSource")}{role.skills_source.onet_code
        ? <>{t("rd.onetChecked")} <a href={onetUrl(role.skills_source.onet_code)} target="_blank" rel="noreferrer">{role.skills_source.onet_code}</a>{role.skills_source.onet_note && ` (${role.skills_source.onet_note.replace(/\.$/, "")})`}</>
        : ` ${t("rd.noOnet")}`}.</p>
      {role.evidence && (
        <EvidenceList evidence={role.evidence}
          names={Object.fromEntries([...role.covered, ...role.missing].map((s) => [s.skill_id, s.name]))}
          added={new Set([...role.covered, ...role.missing].filter((s) => s.added_from_ads).map((s) => s.skill_id))} />
      )}

      <SdgReasons sdgs={role.sdgs} title={t("sdg.roleTitle")} />

      {role.missing.length === 0 && (
        <div className="empty-state">
          <p><strong>{t("rd.allSkills")}</strong> {t("rd.allSkillsNext")}</p>
          <div className="actions">
            <button onClick={onBack}>{t("rd.stretch")}</button>
            <button onClick={onImpact}>{t("a.impact")}</button>
          </div>
        </div>
      )}
      {role.missing.length > 0 && (
        <div className="actions">
          <button className="primary" onClick={onTree}>{t("a.build")}</button>
          <button onClick={onImpact}>{t("a.impact")}</button>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <ShareCard profile={profile} roleId={role.role_id} />
    </section>
  );
}

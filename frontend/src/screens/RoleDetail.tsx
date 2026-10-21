import { useEffect, useState } from "react";
import { ShareCard } from "../components/ShareCard";
import { PayLine } from "../components/PayLine";
import { ExposureBand, ExposureLine } from "../components/Exposure";
import { InterviewPractice } from "../components/InterviewPractice";
import { IdentityStatement, Programmes } from "../components/MalaysiaPanels";
import { Openings } from "../components/Openings";
import { RoleCase } from "../components/RoleCase";
import { TargetButton } from "../components/TargetButton";
import { SignalXray } from "../components/SignalXray";
import { EvidenceList } from "../components/SkillEvidence";
import { Tabs } from "../components/Tabs";
import { api, DayInJob, Profile, RoleCase as RoleCaseData, RoleMatch, Scenario } from "../lib/api";
import { onetUrl, percent } from "../lib/format";
import { getLang, pick, t } from "../lib/i18n";
import { OUTLOOK_TEXT, SCENARIOS } from "../lib/labels";
import type { RoleTab } from "../lib/route";

// One role in four tabs (overview, fit and plan, market, practise and share), with the target
// button and the main action pinned above them. The tab is kept in the address (?tab=).
export function RoleDetail({ profile, role, scenario, adoption, tab, onTab, onImpact, onTree, onProfile, onBack }: {
  profile: Profile; role: RoleMatch; scenario: Scenario; adoption?: number; tab: RoleTab; onTab: (t: RoleTab) => void;
  onImpact: () => void; onTree: () => void; onProfile: (p: Profile) => void; onBack: () => void;
}) {
  const [xray, setXray] = useState<Scenario | null>(null);
  const [roleCase, setRoleCase] = useState<RoleCaseData | null>(null);
  const [day, setDay] = useState<DayInJob | null>(null);
  useEffect(() => { api.day(role.role_id).then(setDay).catch(() => setDay(null)); }, [role.role_id]);
  useEffect(() => { api.roleCase(profile.id, role.role_id).then(setRoleCase).catch(() => setRoleCase(null)); }, [profile.id, role.role_id, profile.skills]);
  const tabs: { id: RoleTab; label: string }[] = [
    { id: "overview", label: t("rtab.overview") }, { id: "fit", label: t("rtab.fit") },
    { id: "market", label: t("rtab.market") }, { id: "practise", label: t("rtab.practise") },
  ];

  return (
    <section>
      <button className="link back-link" onClick={onBack}>← {t("nav.roles")}</button>
      <div className="page-head role-head">
        <div><h1>{role.title}</h1><p className="muted">{role.summary}</p></div>
        <div className="role-actions">
          <TargetButton profile={profile} roleId={role.role_id} onProfile={onProfile} />
          {role.missing.length > 0 && <button className="btn" onClick={onTree}>{t("a.build")}</button>}
        </div>
      </div>
      <p className="role-summary">
        <strong>{percent(role.fit)}%</strong> {t("k.fit")} · <span className={`outlook ${role.outlook[scenario].label}`}>{OUTLOOK_TEXT[role.outlook[scenario].label]}</span>{" "}
        {role.outlook[scenario].index > 0 ? "+" : ""}{role.outlook[scenario].index}% · {role.missing.length} {t("role.toLearn")}
      </p>

      <Tabs id="role" label={role.title} tabs={tabs} value={tab} onChange={onTab}>
        {tab === "overview" && (
          <>
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
              <summary>{t("why.title")} {role.why.score.toFixed(2)}</summary>
              <ul>
                <li>{t("why.fit")} {percent(role.why.fit)}% × 0.6 = <strong>{role.why.fit_points.toFixed(2)}</strong></li>
                <li>{t("why.outlook")} × 0.4 = <strong>{role.why.outlook_points.toFixed(2)}</strong></li>
                {role.why.entry_points > 0 && <li>{t("lead.openToGrads")}: <strong>+{role.why.entry_points.toFixed(2)}</strong></li>}
                {role.why.preference_points > 0 && <li>{t("why.prefs")}: <strong>+{role.why.preference_points.toFixed(2)}</strong>{role.why.matched_preferences.length > 0 && ` (${role.why.matched_preferences.map((m) => pick(m.labels, m.label)).join(", ")})`}</li>}
              </ul>
              <p className="source">{t("why.source")} {role.citation.snapshot_id}, {role.citation.imported}{role.citation.note && ` · ${role.citation.note}`}</p>
            </details>
            <div className="table-wrap">
              <table className="outlooks">
                <caption>{t("role.outlookCaption")}</caption>
                <tbody>{SCENARIOS.map((s) => {
                  const o = role.outlook[s.id];
                  const name = s.id === scenario && adoption !== undefined ? `${t("adopt.label")} ${adoption}×` : t(`sc.${s.id}`);
                  return <tr key={s.id} aria-current={s.id === scenario ? "true" : undefined}><th scope="row">{name}</th><td className={`outlook ${o.label}`}>{OUTLOOK_TEXT[o.label]}</td>
                    <td><button className="link xray-link" onClick={() => setXray(s.id)} aria-label={`${t("xray.title")}: ${name}`}>{o.index > 0 ? "+" : ""}{o.index}% <span aria-hidden="true">🔍</span></button></td></tr>;
                })}</tbody>
              </table>
            </div>
            <p className="source">{t("xray.hint")}</p>
            <ExposureLine roleId={role.role_id} onOpen={() => onTab("market")} />
            <PayLine pay={role.pay} change={role.pay_change_rm} />
            {roleCase && <RoleCase data={roleCase} />}
          </>
        )}

        {tab === "fit" && (
          <>
            <div className="two-col">
              {role.carry_over.length > 0 && (
                <div className="carry-block"><h2>{t("lead.bring")}</h2><div className="chips">{role.carry_over.map((s) => <span key={s.skill_id} className="chip covered">↪ {s.name}</span>)}</div></div>
              )}
              <div><h2>{t("role.have")}</h2><div className="chips">{role.covered.map((s) => <span key={s.skill_id} className="chip covered">✓ {s.name}{s.added_from_ads && <span title={t("ev.added")}> ⁺</span>}</span>)}</div></div>
              <div><h2>{t("role.need")}</h2><div className="chips">{role.missing.map((s) => <span key={s.skill_id} className="chip missing" title={s.added_from_ads ? t("ev.added") : undefined}>{s.name}{s.weight === 3 ? ` (${t("role.core")})` : ""}{s.added_from_ads && " ⁺"}</span>)}</div></div>
            </div>
            <p className="source">{t("role.skillsSource")}{role.skills_source.onet_code
              ? <>, {t("role.checkedOnet")} <a href={onetUrl(role.skills_source.onet_code)} target="_blank" rel="noreferrer">{role.skills_source.onet_code}</a>{role.skills_source.onet_note && ` (${role.skills_source.onet_note.replace(/\.$/, "")})`}</>
              : ` ${t("role.noOnet")}`}.</p>
            {role.evidence && (
              <EvidenceList evidence={role.evidence}
                names={Object.fromEntries([...role.covered, ...role.missing].map((s) => [s.skill_id, s.name]))}
                added={new Set([...role.covered, ...role.missing].filter((s) => s.added_from_ads).map((s) => s.skill_id))} />
            )}
            {role.missing.length === 0 ? (
              <div className="empty-state">
                <p><strong>{t("role.allSkills")}</strong> {t("role.allSkillsBody")}</p>
                <div className="actions">
                  <button onClick={onBack}>{t("role.stretch")}</button>
                  <button onClick={onImpact}>{t("a.impact")}</button>
                </div>
              </div>
            ) : (
              <div className="actions">
                <button className="primary" onClick={onTree}>{t("a.build")}</button>
                <button onClick={onImpact}>{t("a.impact")}</button>
              </div>
            )}
          </>
        )}

        {tab === "market" && (
          <>
            <Openings roleId={role.role_id} title={role.title} />
            <Programmes roleId={role.role_id} />
            <div className="card"><ExposureBand roleId={role.role_id} /></div>
          </>
        )}

        {tab === "practise" && (
          <>
            <IdentityStatement profileId={profile.id} roleId={role.role_id} />
            <InterviewPractice profileId={profile.id} roleId={role.role_id} />
            <ShareCard profile={profile} roleId={role.role_id} />
          </>
        )}
      </Tabs>

      {xray && <SignalXray roleId={role.role_id} scenario={xray} year={role.estimate_range.year}
        adoption={xray === scenario ? adoption : undefined} onClose={() => setXray(null)} />}
    </section>
  );
}

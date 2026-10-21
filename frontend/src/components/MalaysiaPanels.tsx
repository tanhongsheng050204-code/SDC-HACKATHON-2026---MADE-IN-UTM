import { useEffect, useState } from "react";
import { api, Identity, MalaysiaAiUse, Programmes as ProgrammesData } from "../lib/api";
import { getLang, t } from "../lib/i18n";
import { AiBadge } from "./AiBadge";

// What people in Malaysia use AI for, compared with the world (Anthropic Economic Index).
export function MalaysiaAiUseCard() {
  const [data, setData] = useState<MalaysiaAiUse | null>(null);
  useEffect(() => { api.malaysiaAiUse().then(setData).catch(() => setData(null)); }, []);
  if (!data) return null;
  return (
    <div className="card mys-ai">
      <h3>{t("mys.title")}</h3>
      <p className="muted">{t("mys.sub")}{data.usage_index !== null && ` ${t("mys.index")} ${data.usage_index}× ${t("mys.indexNote")}`}</p>
      <ul className="mys-list">
        {data.requests.map((r) => (
          <li key={r.name}>
            <span>{r.name}</span>
            <span className="bar" aria-hidden="true"><span style={{ width: `${Math.min(100, r.mys_pct * 3)}%` }} /></span>
            <strong>{r.mys_pct}%</strong>
            <small className="muted">{t("exp.world")} {r.global_pct ?? "–"}%</small>
          </li>
        ))}
      </ul>
      <p className="source">{data.source}, {data.month} · <a href={data.url} target="_blank" rel="noreferrer">{t("mys.data")}</a> ({data.licence}). {t("mys.foot")}</p>
    </div>
  );
}

// Malaysian public programmes for a role: links only, with no claim of endorsement.
export function Programmes({ roleId }: { roleId: string }) {
  const [data, setData] = useState<ProgrammesData | null>(null);
  useEffect(() => { api.programmes(roleId).then(setData).catch(() => setData(null)); }, [roleId]);
  if (!data) return null;
  const entry = data.mycol.entry;
  return (
    <div className="card programmes">
      <h2>{t("prog.title")}</h2>
      <ul className="plain-list">
        <li>
          {entry ? (
            <><span className={`badge ${entry.match === "listed" ? "good" : ""}`}>{entry.match === "listed" ? t("prog.listed") : t("prog.related")}</span>{" "}
              <a href={data.mycol.report_url} target="_blank" rel="noreferrer">{data.mycol.name}</a>: {t("prog.titles")} {entry.titles.join(", ")} ({t("prog.page")} {entry.page}).</>
          ) : (<>{t("prog.notListed")} <a href={data.mycol.url} target="_blank" rel="noreferrer">{data.mycol.name}</a>.</>)}
          <small className="source"> {data.mycol.about}</small>
        </li>
        <li><a href={data.jelajah_ai.url} target="_blank" rel="noreferrer">{data.jelajah_ai.name} ↗</a> {data.jelajah_ai.about}</li>
        <li><a href={data.mymahir.url} target="_blank" rel="noreferrer">{data.mymahir.name} ↗</a> {data.mymahir.about}</li>
      </ul>
      <p className="source">{t("prog.foot")} {data.mycol.checked}.</p>
    </div>
  );
}

// Career identity statement: who you are for this role, from the skills you already have.
export function IdentityStatement({ profileId, roleId }: { profileId: string; roleId: string }) {
  const [data, setData] = useState<Identity | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setData(null); setCopied(false);
    api.identity(profileId, roleId, getLang()).then(setData).catch(() => setData(null));
  }, [profileId, roleId]);
  if (!data) return null;
  async function copy() {
    try { await navigator.clipboard.writeText(data!.statement); setCopied(true); } catch { setCopied(false); }
  }
  return (
    <div className="card identity">
      <div className="row-between"><h2>{t("id.title")}</h2><AiBadge mode={data.mode} grounded={false} /></div>
      <blockquote>{data.statement}</blockquote>
      <div className="actions"><button className="btn quiet sm" onClick={copy}>{copied ? t("id.copied") : t("id.copy")}</button></div>
      <p className="source">{t("id.foot")}</p>
    </div>
  );
}

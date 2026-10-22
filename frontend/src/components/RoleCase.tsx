import type { RoleCase as RoleCaseData } from "../lib/api";
import { t, tv } from "../lib/i18n";

// "Why this could work" vs "What could go wrong": two honest columns, each point with its source.
export function RoleCase({ data }: { data: RoleCaseData }) {
  return (
    <div className="role-case">
      <div className="card case-col pro">
        <h2>{t("case.pros")}</h2>
        {data.pros.length === 0 ? <p className="muted">{t("case.noPros")}</p> : (
          <ul>{data.pros.map((p) => <li key={p.text}><span>{tv(`rc.${p.key}`, p.vars, p.text)}</span><small className="source">{tv(`rcs.${p.source_key}`, p.vars, p.source)}</small></li>)}</ul>
        )}
      </div>
      <div className="card case-col con">
        <h2>{t("case.cons")}</h2>
        {data.cons.length === 0 ? <p className="muted">{t("case.noCons")}</p> : (
          <ul>{data.cons.map((p) => <li key={p.text}><span>{tv(`rc.${p.key}`, p.vars, p.text)}</span><small className="source">{tv(`rcs.${p.source_key}`, p.vars, p.source)}</small></li>)}</ul>
        )}
      </div>
    </div>
  );
}

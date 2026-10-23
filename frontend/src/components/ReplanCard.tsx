import { useEffect, useState } from "react";
import { api, Profile, Replan, RoleMatch } from "../lib/api";
import { shortDate } from "../lib/format";
import { t, tf, tr } from "../lib/i18n";
import { KEYS, load, save } from "../lib/storage";
import { UpdateRow } from "./UpdateRow";

// Automatic re-planning: when a newer forecast re-ranks this person's roles, Today says what moved
// and, if a different role is now the best fit, offers it. Nothing is switched for them.
// As a row, it is one line in Today's Updates and the card opens in a side panel.
export function ReplanCard({ profile, roles, onOpenRole, row = false }: {
  profile: Profile; roles: RoleMatch[]; onOpenRole: (r: RoleMatch) => void; row?: boolean;
}) {
  const [data, setData] = useState<Replan | null>(null);
  const [seen, setSeen] = useState(() => load(KEYS.replanSeen + profile.id));
  useEffect(() => {
    let live = true;
    setSeen(load(KEYS.replanSeen + profile.id));
    api.replan(profile.id).then((r) => { if (live) setData(r); }).catch(() => { if (live) setData(null); });
    return () => { live = false; };
  }, [profile.id, profile.target_role_id]);

  if (!data?.changed || seen === data.to_snapshot.id) return null;
  const d = data.destination;
  const suggestion = data.new_top ? roles.find((r) => r.role_id === data.new_top!.role_id) : undefined;
  function gotIt() { save(KEYS.replanSeen + profile.id, data!.to_snapshot.id); setSeen(data!.to_snapshot.id); }
  const card = (
    <div className="card replan-card" role="status">
      <span className="eyebrow">{t("replan.title")}</span>
      <p>{tf("replan.intro", { date: shortDate(data.to_snapshot.imported) })}</p>
      {data.moves.length > 0 && (
        <ul>{data.moves.slice(0, 4).map((m) => (
          <li key={m.role_id}><strong>{tr(m.title)}</strong> #{m.before} → #{m.after} {m.after < m.before ? "▲" : "▼"}</li>
        ))}</ul>
      )}
      {d && d.rank_before !== d.rank_after && <p>{tf("replan.dest", { role: tr(d.title), before: d.rank_before, after: d.rank_after })}</p>}
      {suggestion && <p>{tf("replan.top", { role: tr(suggestion.title) })}</p>}
      <div className="actions">
        {suggestion && <button className="btn ink" onClick={() => onOpenRole(suggestion)}>{tf("replan.open", { role: tr(suggestion.title) })}</button>}
        <button className="btn quiet" onClick={gotIt}>{t("changes.gotIt")}</button>
      </div>
      <small className="muted">{t("replan.note")}</small>
    </div>
  );
  if (!row) return card;
  return <UpdateRow icon="🔀" text={t("upd.replan")} action={t("upd.view")} title={t("replan.title")}>{() => card}</UpdateRow>;
}

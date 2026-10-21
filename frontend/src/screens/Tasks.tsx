import { useEffect, useState } from "react";
import { api, Profile, RoleOption, RoleTasks, TaskLabel } from "../lib/api";
import { onetUrl, percent } from "../lib/format";
import { t } from "../lib/i18n";
import { TASK_LABEL } from "../lib/labels";
import { KEYS, load, save } from "../lib/storage";

const ORDER: TaskLabel[] = ["automate", "assist", "human"];

export function Tasks({ profile, onNext }: { profile: Profile; onNext: () => void }) {
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [roleId, setRoleId] = useState(profile.current_role_id ?? "");
  const [done, setDone] = useState<string[]>(() => {
    try { return JSON.parse(load(KEYS.tasksDone, "session") ?? "[]"); } catch { return []; }
  });
  const [data, setData] = useState<RoleTasks | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { api.roles().then(setRoles).catch(() => setError(t("tasks.rolesFailed"))); }, []);
  useEffect(() => {
    if (!roleId) return;
    api.tasks(roleId, done).then((d) => { setData(d); setError(null); }).catch(() => setError(t("tasks.failed")));
    save(KEYS.tasksDone, JSON.stringify(done), "session");
  }, [roleId, done]);

  const ids = new Set(data?.tasks.map((x) => x.id));
  const ticked = done.filter((d) => ids.has(d));
  const toggle = (id: string, on: boolean) => setDone(on ? [...done, id] : done.filter((d) => d !== id));

  return (
    <section>
      <div className="page-head"><h1>{t("h.tasks")}</h1>
        <p className="muted">{t("tasks.sub")}</p></div>
      <label className="narrow">Job
        <select value={roleId} onChange={(e) => { setRoleId(e.target.value); setDone([]); }}>
          <option value="">{t("tasks.choose")}</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
        </select>
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      {!roleId && <div className="empty-state"><p>{t("tasks.empty")}</p></div>}
      {data && data.tasks.length === 0 && <div className="banner">{data.onet_note ?? t("tasks.none")}</div>}
      {data && data.tasks.length > 0 && (
        <>
          <div className="task-split card" aria-label={t("tasks.share")}>
            <div className="split-bar" aria-hidden="true">
              {ORDER.map((l) => <span key={l} className={`split ${l}`} style={{ width: `${data.shares[l] * 100}%` }} />)}
            </div>
            <ul className="split-legend">
              {ORDER.map((l) => (
                <li key={l}><span className={`swatch ${l}`} aria-hidden="true" /><strong>{percent(data.shares[l])}%</strong> {TASK_LABEL[l].text}</li>
              ))}
            </ul>
            <p className="muted">{ticked.length
              ? `${t("tasks.basedTicked")} ${data.counted}.`
              : `${t("tasks.basedAll")} ${data.counted}. ${t("tasks.tickYours")}`}</p>
          </div>
          <ul className="task-list">
            {data.tasks.map((task) => (
              <li key={task.id} className="card">
                <label className="check">
                  <input type="checkbox" checked={done.includes(task.id)} onChange={(e) => toggle(task.id, e.target.checked)} />
                  <span>{task.text}</span>
                </label>
                <div className="card-row">
                  <span className={`badge ${TASK_LABEL[task.label].tone}`} title={TASK_LABEL[task.label].help}>{TASK_LABEL[task.label].text}</span>
                  <span className="muted">{task.reason}</span>
                  {task.observed && (
                    <small className="task-observed">{t("task.observed")} {Math.round(task.observed.automation_pct)}% {t("task.auto")} · {Math.round(task.observed.augmentation_pct)}% {t("task.aug")}</small>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {data.tasks.some((x) => x.observed) && (
            <p className="source">{t("task.observedFoot")} <a href={data.observed_source.url} target="_blank" rel="noreferrer">{data.observed_source.name}</a>, {data.observed_source.month} ({data.observed_source.licence}).</p>
          )}
          <p className="source">Tasks: {data.source}{data.onet_code && <>, occupation <a href={onetUrl(data.onet_code)} target="_blank" rel="noreferrer">{data.onet_code}</a></>}
            {data.onet_note && ` · ${data.onet_note}`} · Labels are judgements drafted with AI assistance, not predictions; checked by our team so far: {data.reviewed} of {data.tasks.length}.</p>
          <button className="primary" onClick={onNext}>{t("a.moveInto")}</button>
        </>
      )}
    </section>
  );
}

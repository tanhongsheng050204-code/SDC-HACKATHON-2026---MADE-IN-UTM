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

  useEffect(() => { api.roles().then(setRoles).catch(() => setError("Couldn't load the role list.")); }, []);
  useEffect(() => {
    if (!roleId) return;
    api.tasks(roleId, done).then((d) => { setData(d); setError(null); }).catch(() => setError("Couldn't load the tasks for this job."));
    save(KEYS.tasksDone, JSON.stringify(done), "session");
  }, [roleId, done]);

  const ids = new Set(data?.tasks.map((x) => x.id));
  const ticked = done.filter((d) => ids.has(d));
  const toggle = (id: string, on: boolean) => setDone(on ? [...done, id] : done.filter((d) => d !== id));

  return (
    <section>
      <div className="page-head"><h1>{t("h.tasks")}</h1>
        <p className="muted">AI rarely replaces a whole job at once: it changes tasks. Tick the tasks you actually do to see how much of your work AI is likely to automate, assist with, or leave to you.</p></div>
      <label className="narrow">Job
        <select value={roleId} onChange={(e) => { setRoleId(e.target.value); setDone([]); }}>
          <option value="">Choose a job</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
        </select>
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      {!roleId && <div className="empty-state"><p>Pick your current or most recent job to start.</p></div>}
      {data && data.tasks.length === 0 && <div className="banner">{data.onet_note ?? "No task data for this job yet."}</div>}
      {data && data.tasks.length > 0 && (
        <>
          <div className="task-split card" aria-label="Share of your tasks">
            <div className="split-bar" aria-hidden="true">
              {ORDER.map((l) => <span key={l} className={`split ${l}`} style={{ width: `${data.shares[l] * 100}%` }} />)}
            </div>
            <ul className="split-legend">
              {ORDER.map((l) => (
                <li key={l}><span className={`swatch ${l}`} aria-hidden="true" /><strong>{percent(data.shares[l])}%</strong> {TASK_LABEL[l].text}</li>
              ))}
            </ul>
            <p className="muted">{ticked.length
              ? `Based on the ${data.counted} ${data.counted === 1 ? "task" : "tasks"} you ticked.`
              : `Based on all ${data.counted} tasks. Tick yours to make it personal.`}</p>
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
                </div>
              </li>
            ))}
          </ul>
          <p className="source">Tasks: {data.source}{data.onet_code && <>, occupation <a href={onetUrl(data.onet_code)} target="_blank" rel="noreferrer">{data.onet_code}</a></>}
            {data.onet_note && ` · ${data.onet_note}`} · Labels are judgements drafted with AI assistance, not predictions; checked by our team so far: {data.reviewed} of {data.tasks.length}.</p>
          <button className="primary" onClick={onNext}>{t("a.moveInto")}</button>
        </>
      )}
    </section>
  );
}

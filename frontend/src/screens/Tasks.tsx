import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { api, Profile, RoleOption, RoleTasks, TaskLabel } from "../lib/api";
import { onetUrl } from "../lib/format";
import { t, tf, tr, type StringKey } from "../lib/i18n";
import { KEYS, load, save } from "../lib/storage";

type Task = RoleTasks["tasks"][number];

const ORDER: TaskLabel[] = ["automate", "assist", "human"];
const COL: Record<TaskLabel, StringKey> = { automate: "tasks.colAutomate", assist: "tasks.colAssist", human: "tasks.colHuman" };
const COL_HELP: Record<TaskLabel, StringKey> = { automate: "task.automateHelp", assist: "task.assistHelp", human: "task.humanHelp" };
// Small pictures beside each column name, so the three groups read apart without the words.
const COL_ICON: Record<TaskLabel, string> = {
  automate: "M5 8h14v11H5zM12 4v4M9 13h.01M15 13h.01M9.5 16.5h5",
  assist: "M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4zM5 20h14",
  human: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0",
};

const short = (task: Task) => tr(task.short || task.text);

// The verdict reads the share of tasks AI is likely to automate: 40%+ is a big part, 20%+ is some.
function verdict(automate: number): StringKey {
  return automate >= 0.4 ? "tasks.vBig" : automate >= 0.2 ? "tasks.vSome" : "tasks.vMost";
}

export function Tasks({ profile, onNext, onPathway, onAsk }: {
  profile: Profile; onNext: () => void; onPathway: () => void; onAsk: (question: string) => void;
}) {
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [roleId, setRoleId] = useState(profile.current_role_id ?? "");
  const [done, setDone] = useState<string[]>(() => {
    try { return JSON.parse(load(KEYS.tasksDone, "session") ?? "[]"); } catch { return []; }
  });
  const [data, setData] = useState<RoleTasks | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<string | null>(null);
  const [sorting, setSorting] = useState(false);
  const [how, setHow] = useState(false);

  useEffect(() => { api.roles().then(setRoles).catch(() => setError(t("tasks.rolesFailed"))); }, []);
  useEffect(() => {
    if (!roleId) return;
    api.tasks(roleId, done).then((d) => { setData(d); setError(null); }).catch(() => setError(t("tasks.loadFailed")));
    save(KEYS.tasksDone, JSON.stringify(done), "session");
  }, [roleId, done]);

  const tasks = data?.tasks ?? [];
  const ids = new Set(tasks.map((x) => x.id));
  const ticked = done.filter((d) => ids.has(d));
  const mine = ticked.length > 0;
  const isMine = (id: string) => !mine || ticked.includes(id);
  const toggle = (id: string) => {
    // With nothing ticked every task counts (all show ticked), so the first click unticks one.
    const base = mine ? ticked : tasks.map((x) => x.id);
    const next = base.includes(id) ? base.filter((d) => d !== id) : [...base, id];
    setDone(next.length === tasks.length ? [] : next);
  };
  const toggleOpen = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const jumpTo = (id: string) => {
    document.getElementById(`task-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    setFlash(id); setTimeout(() => setFlash((f) => (f === id ? null : f)), 1200);
  };

  const counted = tasks.filter((x) => isMine(x.id));
  const automated = counted.filter((x) => x.label === "automate").length;
  const human = tasks.find((x) => x.label === "human" && isMine(x.id));
  const roleTitle = roles.find((r) => r.id === roleId)?.title;

  return (
    <section className="tasks-page">
      <div className="page-head"><h1>{t("h.tasks")}</h1></div>
      <JobPicker roles={roles} roleId={roleId} title={roleTitle} onPick={(id) => { setRoleId(id); setDone([]); setOpen(new Set()); }} />
      {error && <p className="error" role="alert">{error}</p>}
      {!roleId && <div className="empty-state"><p>{t("tasks.pick")}</p></div>}
      {data && tasks.length === 0 && <div className="banner">{data.onet_note ?? t("tasks.none")}</div>}
      {data && tasks.length > 0 && (
        <>
          <div className="tasks-verdict" aria-live="polite">
            {mine && <span className="tasks-mine">{counted.length === 1 ? t("tasks.mineOne") : tf("tasks.mine", { n: counted.length })}</span>}
            <h2>{t(verdict(data.shares.automate))}</h2>
            <p className="muted">{tf(mine ? "tasks.vSubMine" : "tasks.vSub", { a: automated, n: counted.length })}</p>
          </div>
          <div className="task-squares" role="group" aria-label={t("tasks.squares")}>
            {ORDER.flatMap((l) => tasks.filter((x) => x.label === l)).map((x) => (
              <button key={x.id} className={`task-sq ${x.label}${isMine(x.id) ? "" : " off"}`} title={short(x)}
                aria-label={`${short(x)}: ${t(COL[x.label])}`} onClick={() => jumpTo(x.id)} />
            ))}
          </div>
          <div className="tasks-actions">
            <button className="primary" onClick={() => setSorting(true)}>{t("tasks.makeMine")} <span className="tasks-min">· {t("tasks.oneMin")}</span></button>
            {mine && <button className="link" onClick={() => setDone([])}>{t("tasks.reset")}</button>}
            <button className="link" onClick={() => setHow(true)}>{t("tasks.how")}</button>
          </div>

          <div className="task-cols">
            {ORDER.map((l) => {
              const group = tasks.filter((x) => x.label === l);
              return (
                <div key={l} className={`task-col ${l}`}>
                  <div className="task-col-head">
                    <h3><svg className="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={COL_ICON[l]} /></svg>{t(COL[l])}</h3>
                    <span className="task-col-pct">{Math.round(data.shares[l] * 100)}%</span>
                  </div>
                  <p className="task-col-sub">{t(COL_HELP[l])}</p>
                  {group.map((x) => (
                    <div key={x.id} id={`task-${x.id}`} className={`task-chip${isMine(x.id) ? "" : " off"}${flash === x.id ? " flash" : ""}`}>
                      <div className="task-chip-row">
                        <button className="task-tick" aria-pressed={isMine(x.id)} onClick={() => toggle(x.id)}
                          aria-label={tf("tasks.iDo", { task: short(x) })}><Icon name="check" /></button>
                        <span className="task-chip-title" title={x.short_reason && tr(x.short_reason)}>{short(x)}</span>
                        <button className="link task-why" aria-expanded={open.has(x.id)} aria-controls={`why-${x.id}`}
                          onClick={() => toggleOpen(x.id)}>{open.has(x.id) ? t("tasks.hide") : t("tasks.why")}</button>
                      </div>
                      {open.has(x.id) && (
                        <div className="task-detail" id={`why-${x.id}`}>
                          <p>{tr(x.reason)}</p>
                          {x.observed && (
                            <p>{t("task.observed")} {Math.round(x.observed.automation_pct)}% {t("task.auto")} · {Math.round(x.observed.augmentation_pct)}% {t("task.aug")}</p>
                          )}
                          <p className="task-onet">{t("tasks.onetTask")} “{tr(x.text)}”</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          <div className="tasks-next">
            <h3>{t("tasks.nextTitle")}</h3>
            <div className="tasks-next-grid">
              <button onClick={onPathway}><strong>{t("tasks.nextLearn")}</strong><span>{t("tasks.nextLearnSub")}</span></button>
              <button onClick={onNext}><strong>{t("tasks.nextRoles")}</strong>
                <span>{human ? tf("tasks.nextRolesSub", { task: short(human) }) : t("tasks.nextRolesAny")}</span></button>
              <button onClick={() => onAsk(t("tasks.nextCoachQ"))}><strong>{t("tasks.nextCoach")}</strong><span>“{t("tasks.nextCoachQ")}”</span></button>
            </div>
          </div>

          {sorting && <CardSort tasks={tasks} onClose={() => setSorting(false)}
            onDone={(yes) => { setSorting(false); setDone(yes.length === tasks.length ? [] : yes); }} />}
          {how && (
            <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && setHow(false)}>
              <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="how-title">
                <h2 id="how-title">{t("tasks.how")}</h2>
                <ul className="tasks-how">
                  <li>{t("tasks.source")}: {data.source}{data.onet_code && <>, {t("tasks.occupation")} <a href={onetUrl(data.onet_code)} target="_blank" rel="noreferrer">{data.onet_code}</a></>}{data.onet_note && ` · ${data.onet_note}`}</li>
                  <li>{tf("tasks.labelsNote", { n: data.reviewed, total: tasks.length })}</li>
                  {tasks.some((x) => x.observed) && (
                    <li>{t("task.observedFoot")} <a href={data.observed_source.url} target="_blank" rel="noreferrer">{data.observed_source.name}</a>, {data.observed_source.month} ({data.observed_source.licence}).</li>
                  )}
                </ul>
                <div className="dialog-actions"><button autoFocus onClick={() => setHow(false)}>{t("tasks.close")}</button></div>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function JobPicker({ roles, roleId, title, onPick }: { roles: RoleOption[]; roleId: string; title?: string; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(!roleId);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !roleId) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open, roleId]);
  const found = roles.filter((r) => tr(r.title).toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="job-line" ref={box}>
      <span>{t("tasks.yourJob")}</span>
      {roleId && (
        <button className="job-btn" aria-expanded={open} aria-label={`${t("tasks.changeJob")}: ${tr(title)}`} onClick={() => { setOpen(!open); setQ(""); }}>
          {tr(title) || "…"}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </button>
      )}
      {open && (
        <div className={roleId ? "job-pop" : "job-pop inline"} onKeyDown={(e) => e.key === "Escape" && roleId && setOpen(false)}>
          <input autoFocus={!!roleId} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("tasks.search")} aria-label={t("tasks.search")} />
          <ul>
            {found.map((r) => (
              <li key={r.id}><button className={r.id === roleId ? "current" : ""} onClick={() => { onPick(r.id); setOpen(false); }}>{tr(r.title)}</button></li>
            ))}
            {found.length === 0 && <li className="muted">{tf("tasks.noMatch", { q })}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

// "Make it about me": one task at a time, Yes / Sometimes / No. Sometimes counts as a task you do.
function CardSort({ tasks, onDone, onClose }: { tasks: Task[]; onDone: (yes: string[]) => void; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [yes, setYes] = useState<string[]>([]);
  const answer = (does: boolean) => {
    const next = does ? [...yes, tasks[i].id] : yes;
    if (i + 1 >= tasks.length) { onDone(next.length ? next : tasks.map((x) => x.id)); return; }
    setYes(next); setI(i + 1);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") answer(true);
      else if (e.key === "ArrowDown") answer(true);
      else if (e.key === "ArrowLeft") answer(false);
      else if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  });
  const task = tasks[i];

  return (
    <div className="dialog-backdrop">
      <div className="dialog card-sort" role="dialog" aria-modal="true" aria-labelledby="sort-q">
        <div className="card-sort-top">
          <span>{tf("tasks.sortCount", { i: i + 1, n: tasks.length })}</span>
          <span className="card-sort-dots" aria-hidden="true">{tasks.map((x, k) => <i key={x.id} className={k < i ? "done" : ""} />)}</span>
          <button className="link" onClick={onClose}>{t("tasks.sortStop")}</button>
        </div>
        <div className="card-sort-card" aria-live="polite">
          <span className="eyebrow" id="sort-q">{t("tasks.sortQ")}</span>
          <strong>{short(task)}</strong>
          <span className="muted">{tr(task.text)}</span>
        </div>
        <div className="card-sort-answers">
          <button onClick={() => answer(false)}>{t("tasks.sortNo")}<kbd>←</kbd></button>
          <button onClick={() => answer(true)}>{t("tasks.sortSome")}<kbd>↓</kbd></button>
          <button className="primary" autoFocus onClick={() => answer(true)}>{t("tasks.sortYes")}<kbd>→</kbd></button>
        </div>
      </div>
    </div>
  );
}

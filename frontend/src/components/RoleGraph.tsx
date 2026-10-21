import { useEffect, useRef, useState } from "react";
import { api, EmergingCard, Matches, Profile, RoleMatch, Scenario, SkillRef } from "../lib/api";
import { getLang, t } from "../lib/i18n";
import { OUTLOOK_TEXT, OUTLOOK_TONE } from "../lib/labels";

// Future roles as a map, for comparing options at a glance. The ring is your top roles by rank;
// distance is the skill gap (closer = fewer new skills); colour is the outlook; each arrow names the
// skills you would still need. Clicking a role shows its details beside the map. From there, "Where
// can it lead?" opens a path read left to right: you, the role, then the roles it leads to (and any
// approved emerging role it is the stepping stone for); each option can be followed a step further.
const DIRECT = 6;          // roles on the ring
const NEXT = 3;            // next roles shown for an opened role
const LINK_MIN_SKILLS = 2; // a next role must share at least this many of its missing skills with the role before it
const NODE_W = 172, NODE_H = 72, YOU_R = 58;
const COL = 340, ROW = 96; // path view: distance between columns, and between stacked options
const GLIDE_MS = 450;      // nodes glide to a new distance when the skills or scenario change

type Node = {
  key: string; x: number; y: number; depth: number; parent: Node | null; via: SkillRef[];
  role: RoleMatch | null;           // a ranked role
  prediction: EmergingCard | null;  // or an approved emerging role, shown only in the path view
};

const asSkill = (s: { skill_id: string; name: string }): SkillRef => ({ ...s, weight: 1, sdgs: [] });
const short = (text: string, n: number) => (text.length > n ? text.slice(0, n - 1) + "…" : text);
const titleOf = (n: Node) => n.role?.title ?? (n.prediction ? n.prediction.title[getLang()] || n.prediction.title.en : "");

// Up to two lines: the two most important skills, then how many more. Phones get the count only.
function skillLines(missing: SkillRef[], compact: boolean, prefix = ""): string[] {
  if (missing.length === 0) return [t("graph.ready")];
  if (compact) return [prefix + t("graph.count").replace("{n}", String(missing.length))];
  const top = [...missing].sort((a, b) => b.weight - a.weight).slice(0, 2).map((s) => short(s.name, 16));
  if (missing.length > 2) top[1] = `${top[1]} +${missing.length - 2}`;
  top[0] = prefix + top[0];
  return top;
}

function twoLines(title: string, line = 22): [string, string] {
  if (title.length <= line - 2) return [title, ""];
  const words = title.split(" ");
  let best = 1, gap = Infinity;
  for (let i = 1; i < words.length; i++) {
    const d = Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length);
    if (d < gap) { gap = d; best = i; }
  }
  return [short(words.slice(0, best).join(" "), line), short(words.slice(best).join(" "), line)];
}

const skillsOf = (r: RoleMatch) => new Set([...r.covered, ...r.missing].map((s) => s.skill_id));

// Roles that `from` leads to: they build on `from`'s skills (share at least LINK_MIN_SKILLS of what
// they need), pay no less (DOSM group median) and are not declining, so each step is a step up.
// The arrow carries what is left to learn after `from`.
function nextRoles(from: RoleMatch, candidates: RoleMatch[], scenario: Scenario) {
  const have = skillsOf(from);
  return candidates
    .map((to) => {
      const shared = to.missing.filter((s) => have.has(s.skill_id)).length;
      return { to, shared, via: to.missing.filter((s) => !have.has(s.skill_id)) };
    })
    .filter((c) => c.shared >= LINK_MIN_SKILLS && c.via.length < c.to.missing.length && c.to.pay.median_rm >= from.pay.median_rm
      && c.to.outlook[scenario].label !== "declining")
    .sort((a, b) => a.via.length - b.via.length || a.to.rank - b.to.rank)
    .slice(0, NEXT);
}

// Where the line from (x1, y1) towards a node box centred at (x2, y2) meets the box's edge.
function toBox(x1: number, y1: number, x2: number, y2: number, pad = 4) {
  const dx = x2 - x1, dy = y2 - y1;
  const k = Math.min((NODE_W / 2 + pad) / Math.abs(dx || 1e-9), (NODE_H / 2 + pad) / Math.abs(dy || 1e-9));
  return { x: x2 - dx * k, y: y2 - dy * k };
}

// `scale` enlarges the text on phones, where the whole map is drawn smaller.
function Pill({ x, y, lines, className, scale = 1 }: { x: number; y: number; lines: string[]; className: string; scale?: number }) {
  const lh = 14 * scale;
  const w = Math.max(...lines.map((l) => l.length)) * 6.2 * scale + 14, h = lines.length * lh + 8;
  return (
    <g className={className}>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={8} />
      {lines.map((l, i) => <text key={i} x={x} y={y - h / 2 + 4 + lh * (i + 0.85)} textAnchor="middle">{l}</text>)}
    </g>
  );
}

function useCompact() {
  const query = "(max-width: 760px)";
  const [compact, setCompact] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const m = window.matchMedia?.(query);
    if (!m) return;
    const on = () => setCompact(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return compact;
}

// Moves each node smoothly from where it was to where it should be. Positions are SVG attributes,
// which CSS cannot animate, so this steps them per frame.
function useGlide(targets: Record<string, { x: number; y: number }>) {
  const [shown, setShown] = useState(targets);
  const from = useRef(targets);
  const signature = JSON.stringify(targets);
  useEffect(() => {
    const start = performance.now(), begin = { ...from.current };
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const step = (now: number) => {
      const k = reduce ? 1 : Math.min(1, (now - start) / GLIDE_MS), e = 1 - (1 - k) ** 3;
      const next: Record<string, { x: number; y: number }> = {};
      for (const [key, p] of Object.entries(targets)) {
        const b = begin[key] ?? p;
        next[key] = { x: b.x + (p.x - b.x) * e, y: b.y + (p.y - b.y) * e };
      }
      from.current = next;
      setShown(next);
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [signature]);  // eslint-disable-line react-hooks/exhaustive-deps
  return (key: string) => shown[key] ?? targets[key];
}

export function RoleGraph({ data, profile, scenario, onOpen }: {
  data: Matches; profile: Profile; scenario: Scenario; onOpen: (r: RoleMatch) => void;
}) {
  const compact = useCompact();
  const [picked, setPicked] = useState<string | null>(null);  // ring role whose details are shown
  const [path, setPath] = useState<string[]>([]);             // path view: opened node keys, from the centre out
  const [hover, setHover] = useState<string | null>(null);
  const [cards, setCards] = useState<EmergingCard[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { api.emerging(profile.id).then((r) => setCards(r.roles)).catch(() => setCards([])); }, [profile.id]);
  // In the path view the newest step is on the right: bring it into view.
  useEffect(() => { scroller.current?.scrollTo({ left: scroller.current.scrollWidth, behavior: "smooth" }); }, [path.join("|")]);

  const all = data.roles.filter((r) => !r.is_current_role);
  // The ring keeps the top roles without any "What if" skills, so it never reshuffles while you
  // try skills; it is the ranking for the chosen scenario and year.
  const baseRank = (r: RoleMatch) => r.rank_without_extra ?? r.rank;
  const direct = [...all].sort((a, b) => baseRank(a) - baseRank(b)).slice(0, DIRECT);
  const movedUp = all.filter((r) => r.rank <= DIRECT && !direct.includes(r));

  const ring: Node[] = direct.map((role, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / direct.length;
    const r = 160 + (1 - role.fit) * 90;  // distance is the skill gap: a better fit sits closer to you
    // Wide on laptops; tall on phones, so the ring keeps readable text on a narrow screen.
    const [sx, sy] = compact ? [0.62, 1.45] : [1.38, 0.92];
    return { key: role.role_id, role, prediction: null, depth: 0, parent: null, via: role.missing,
      x: r * sx * Math.cos(angle), y: r * sy * Math.sin(angle) };
  });

  // Path view. A role can appear again further out: reached through another role, it is a different
  // step with a smaller gap. Roles already on the path are left out, so a path never loops.
  const openPath: Node[] = [];
  let options: Node[] = [];
  let opened = ring.find((n) => n.key === path[0]) ?? null;
  while (opened) {
    const from: Node = opened;
    openPath.push(from);
    options = [];
    if (from.role) {
      const onPath = new Set(openPath.map((n) => n.role?.role_id));
      options = nextRoles(from.role, all.filter((r) => !onPath.has(r.role_id)), scenario).map((c) => ({
        key: `${from.key}>${c.to.role_id}`, role: c.to, prediction: null, depth: from.depth + 1, parent: from, via: c.via, x: 0, y: 0 }));
      const have = skillsOf(from.role);
      options.push(...cards.filter((c) => c.stepping_stone.role_id === from.role!.role_id).map((c) => ({
        key: `${from.key}>em:${c.capability_id}`, role: null, prediction: c, depth: from.depth + 1, parent: from,
        via: c.to_learn.filter((s) => !have.has(s.skill_id)).map(asSkill), x: 0, y: 0 })));
    }
    opened = options.find((k) => k.key === path[from.depth + 1]) ?? null;
  }
  const last = openPath[openPath.length - 1] ?? null;
  if (last) {
    openPath.forEach((n, i) => { n.x = (i + 1) * COL; n.y = 0; });
    options.forEach((n, i) => { n.x = (openPath.length + 1) * COL; n.y = (i - (options.length - 1) / 2) * ROW; });
  }
  const nodes = last ? [...openPath, ...options] : ring;
  const at = useGlide(Object.fromEntries(nodes.map((n) => [n.key, { x: n.x, y: n.y }])));
  const pos = (n: Node | null) => (n ? at(n.key) : { x: 0, y: 0 });

  // The view box fits what is shown, so the map never overflows its card.
  const pad = 20;
  const xs = [-YOU_R, YOU_R, ...nodes.flatMap((n) => [n.x - NODE_W / 2, n.x + NODE_W / 2])];
  const ys = [-YOU_R, YOU_R, ...nodes.flatMap((n) => [n.y - NODE_H / 2, n.y + NODE_H / 2])];
  const minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad;
  const vw = Math.max(...xs) + pad - minX, vh = Math.max(...ys) + pad - minY;

  function click(n: Node) {
    if (!last) { setPicked(picked === n.key ? null : n.key); return; }
    // An option goes a step further; a role on the path steps back to it; the last one closes it.
    const upTo = openPath.slice(0, n.depth).map((p) => p.key);
    if (n === last) setPath(upTo); else setPath([...upTo, n.key]);
  }
  const selected = last ?? ring.find((n) => n.key === picked) ?? null;
  const dim = (n: Node) => (hover !== null ? hover !== n.key && !openPath.includes(n)
    : !last && picked !== null && picked !== n.key);
  const you = data.current_role?.title
    ?? (profile.audience === "graduate" ? t("graph.student") : profile.audience === "switcher" ? t("graph.switcher") : t("graph.you"));

  return (
    <div className="graph-layout">
      <figure className={`card role-graph${compact ? " compact" : ""}`}>
        <p className="muted graph-hint">{t(last ? "graph.hintPath" : "graph.hint")}</p>
        <div className="graph-scroll" ref={scroller}>
          {/* The path view keeps its text readable and scrolls sideways when it is wider than the card */}
          <svg viewBox={`${minX} ${minY} ${vw} ${vh}`} role="group" aria-labelledby="graph-title graph-desc"
            style={last ? { minWidth: vw * 0.8 } : undefined}>
            <title id="graph-title">{t("graph.title")}</title>
            <desc id="graph-desc">{t("graph.desc")}</desc>
            <defs>
              <marker id="graph-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" className="graph-arrowhead" />
              </marker>
              <marker id="graph-arrow-link" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" className="graph-arrowhead link" />
              </marker>
            </defs>

            {nodes.map((n) => {
              const p = pos(n), f = pos(n.parent);
              const len = Math.hypot(p.x, p.y) || 1;
              const start = n.parent ? toBox(p.x, p.y, f.x, f.y) : { x: (p.x * YOU_R) / len, y: (p.y * YOU_R) / len };
              const end = toBox(f.x, f.y, p.x, p.y);
              return <line key={`e-${n.key}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y}
                className={`graph-edge${n.parent ? " link" : ""}${dim(n) ? " dim" : ""}`} markerEnd={`url(#${n.parent ? "graph-arrow-link" : "graph-arrow"})`} />;
            })}

            {/* Skill labels after the lines, so no line crosses one */}
            {nodes.map((n) => {
              const p = pos(n), f = pos(n.parent);
              const a = n.parent ? toBox(p.x, p.y, f.x, f.y, 0) : { x: 0, y: 0 }, b = toBox(f.x, f.y, p.x, p.y, 0);
              const lift = n.parent ? 0 : YOU_R;
              const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
              // Phones (tall ring): a straight up/down arrow passes between the side roles, so its
              // label sits out near its own role instead.
              const upright = compact && !n.parent && Math.abs(p.x) < Math.abs(p.y) * 0.3;
              const k = (lift + (len - lift) * (upright ? 0.8 : compact && !n.parent ? 0.42 : 0.5)) / len;
              return <Pill key={`p-${n.key}`} x={a.x + (b.x - a.x) * k} y={a.y + (b.y - a.y) * k} scale={compact ? 1.5 : 1}
                lines={skillLines(n.via, compact, n.parent ? "+ " : "")} className={`graph-pill${n.parent ? " link" : ""}${dim(n) ? " dim" : ""}`} />;
            })}

            <g className="graph-you" onClick={() => { setPath([]); setPicked(null); }}>
              <circle cx={0} cy={0} r={YOU_R} />
              <text x={0} y={-6} textAnchor="middle" className="graph-you-name">{short(profile.display_name || t("graph.you"), 16)}</text>
              <text x={0} y={12} textAnchor="middle">{short(you, 20)}</text>
              <text x={0} y={28} textAnchor="middle" className="graph-small">{t("graph.skills").replace("{n}", String(profile.skills.length))}</text>
            </g>

            {nodes.map((n) => <GraphNode key={n.key} node={n} at={pos(n)} scenario={scenario} compact={compact}
              state={`${n === selected ? " open" : ""}${dim(n) ? " dim" : ""}`}
              onHover={(on) => setHover(on ? n.key : null)} onClick={() => click(n)} />)}
          </svg>
        </div>
        <figcaption className="graph-key">
          <span><i className="key-line" /> {t("graph.keyEdge")}</span>
          <span><i className="key-dash" /> {t("graph.keyLink")}</span>
          <span className="source">{t("graph.keyPay")}</span>
        </figcaption>
      </figure>

      <aside className="card graph-panel" aria-live="polite">
        {movedUp.length > 0 && !last && (
          <p className="badge gold graph-moved">{movedUp.map((r) => t("graph.moveUp").replace("{role}", r.title).replace("{rank}", String(r.rank))).join(" ")}</p>
        )}
        {!selected && <HowTo />}
        {selected && !last && selected.role && (
          <RoleDetails role={selected.role} scenario={scenario}
            onLead={() => { setPath([selected.key]); setPicked(selected.key); }} onOpen={() => onOpen(selected.role!)} />
        )}
        {last && (
          <PathDetails steps={openPath} hasNext={options.length > 0} onOpen={onOpen}
            onBack={() => setPath([])} />
        )}
      </aside>
    </div>
  );
}

function GraphNode({ node, at, scenario, compact, state, onHover, onClick }: {
  node: Node; at: { x: number; y: number }; scenario: Scenario; compact: boolean; state: string;
  onHover: (on: boolean) => void; onClick: () => void;
}) {
  const { x, y } = at;
  const [l1, l2] = twoLines(titleOf(node), compact ? 15 : 22);
  const role = node.role;
  const o = role?.outlook[scenario];
  const tone = role ? OUTLOOK_TONE[o!.label] || "plain" : "prediction";
  const match = role ? t("graph.match").replace("{n}", String(Math.round(role.fit * 100))) : t("graph.prediction");
  const top = y - NODE_H / 2;
  const label = role
    ? `${role.title}. ${match}. ${OUTLOOK_TEXT[o!.label]}. ${t("graph.needs")}: ${node.via.map((s) => s.name).join(", ") || t("graph.ready")}`
    : `${titleOf(node)}, ${t("graph.prediction")}. ${t("graph.needs")}: ${node.via.map((s) => s.name).join(", ") || t("graph.ready")}`;
  return (
    <g className={`graph-node tone-${tone}${state}`} tabIndex={0} role="button" aria-label={label}
      onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}
      onClick={onClick} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}>
      <rect x={x - NODE_W / 2} y={top} width={NODE_W} height={NODE_H} rx={12} />
      {/* Phones: bigger text, no pay line (it is in the panel) */}
      <text x={x} y={top + (compact ? (l2 ? 22 : 32) : (l2 ? 18 : 24))} textAnchor="middle" className="graph-title">{l1}</text>
      {l2 && <text x={x} y={top + (compact ? 43 : 33)} textAnchor="middle" className="graph-title">{l2}</text>}
      <text x={x} y={top + (compact ? 64 : 50)} textAnchor="middle" className="graph-match">{match}</text>
      {!compact && role && (
        <text x={x} y={top + 64} textAnchor="middle" className="graph-small">
          {OUTLOOK_TEXT[o!.label]} {o!.index > 0 ? "+" : ""}{o!.index}% · RM{role.pay.median_rm.toLocaleString("en-MY")}
        </text>
      )}
    </g>
  );
}

function HowTo() {
  return (
    <div className="graph-howto">
      <h3>{t("graph.howTitle")}</h3>
      <ul>
        <li>{t("graph.howDistance")}</li>
        <li>{t("graph.howArrow")}</li>
        <li><span className="key-swatch good" /> {t("graph.howGood")}</li>
        <li><span className="key-swatch plain" /> {t("graph.howStable")}</li>
        <li><span className="key-swatch risk" /> {t("graph.howRisk")}</li>
        <li>{t("graph.howClick")}</li>
      </ul>
    </div>
  );
}

function RoleDetails({ role, scenario, onLead, onOpen }: { role: RoleMatch; scenario: Scenario; onLead: () => void; onOpen: () => void }) {
  const o = role.outlook[scenario];
  return (
    <div className="graph-details">
      <h3>{role.title}</h3>
      <p><strong>{t("graph.match").replace("{n}", String(Math.round(role.fit * 100)))}</strong> · {OUTLOOK_TEXT[o.label]} {o.index > 0 ? "+" : ""}{o.index}%</p>
      <p className="muted">{t("pay.median")} RM{role.pay.median_rm.toLocaleString("en-MY")} ({role.pay.group})</p>
      <span className="kpi-label">{t("graph.toLearn")} ({role.missing.length})</span>
      {role.missing.length
        ? <div className="chips">{[...role.missing].sort((a, b) => b.weight - a.weight).map((s) => <span key={s.skill_id} className="chip missing">{s.name}{s.weight === 3 ? " (core)" : ""}</span>)}</div>
        : <p>{t("graph.ready")}</p>}
      {role.covered.length > 0 && <>
        <span className="kpi-label">{t("graph.have")} ({role.covered.length})</span>
        <div className="chips">{role.covered.map((s) => <span key={s.skill_id} className="chip covered">✓ {s.name}</span>)}</div>
      </>}
      <div className="actions">
        <button className="primary" onClick={onLead}>{t("graph.lead")}</button>
        <button onClick={onOpen}>{t("graph.openRole").replace("{role}", role.title)}</button>
      </div>
    </div>
  );
}

function PathDetails({ steps, hasNext, onOpen, onBack }: {
  steps: Node[]; hasNext: boolean; onOpen: (r: RoleMatch) => void; onBack: () => void;
}) {
  const last = steps[steps.length - 1];
  return (
    <div className="graph-details">
      <p className="graph-path"><strong>{t("graph.you")}</strong>{steps.map((s) => <span key={s.key}> → {titleOf(s)}</span>)}</p>
      <ol className="graph-steps">
        {steps.map((s) => (
          <li key={s.key}>
            <strong>{titleOf(s)}</strong>{s.prediction && <> <span className="badge gold">{t("graph.prediction")}</span></>}: {s.via.length
              ? `${s.parent ? t("graph.thenAdd") : t("graph.learn")} ${s.via.map((v) => v.name).join(", ")}`
              : t("graph.ready")}
          </li>
        ))}
      </ol>
      {last.prediction && <p className="muted">{pickText(last.prediction.summary)} {t("graph.predictionNote")}</p>}
      {!hasNext && !last.prediction && <p className="muted">{t("graph.noNext")}</p>}
      <div className="actions">
        {last.role && <button className="primary" onClick={() => onOpen(last.role!)}>{t("graph.openRole").replace("{role}", last.role.title)}</button>}
        {last.prediction && <button className="primary" onClick={() => document.getElementById("emerging-title")?.scrollIntoView({ behavior: "smooth" })}>{t("graph.seeEmerging")}</button>}
        <button className="link" onClick={onBack}>{t("graph.back")}</button>
      </div>
    </div>
  );
}

const pickText = (x: { en: string; ms: string; zh: string }) => x[getLang()] || x.en;

import { useEffect, useRef, useState } from "react";
import { Matches, Profile, RoleMatch, Scenario, SkillRef } from "../lib/api";
import { t } from "../lib/i18n";
import { OUTLOOK_TEXT, OUTLOOK_TONE } from "../lib/labels";

// The ranked roles as a map that grows where the person looks. At first: you in the middle and
// only your closest roles around you, each arrow labelled with the skills you would still need.
// Clicking a role opens the next roles it leads to, labelled with what you would add after it;
// clicking one of those goes a step further. Once a role is opened the map turns into a path read
// left to right (you, the opened roles, then the next options), so it stays small however far it goes.
const DIRECT = 6;          // roles linked straight to you
const NEXT = 3;            // next roles shown when a role is opened
const LINK_MIN_SKILLS = 2; // a next role must share at least this many of its missing skills with the role before it
const NODE_W = 168, NODE_H = 60, YOU_R = 58;
const COL = 340, ROW = 96; // path view: distance between columns, and between stacked options

type Node = { key: string; role: RoleMatch; x: number; y: number; depth: number; parent: Node | null; via: SkillRef[] };

function short(text: string, n: number) { return text.length > n ? text.slice(0, n - 1) + "…" : text; }

// Up to two lines: the two most important skills, then how many more.
function skillLines(missing: SkillRef[], prefix = ""): string[] {
  if (missing.length === 0) return [t("graph.ready")];
  const top = [...missing].sort((a, b) => b.weight - a.weight).slice(0, 2).map((s) => short(s.name, 16));
  if (missing.length > 2) top[1] = `${top[1]} +${missing.length - 2}`;
  top[0] = prefix + top[0];
  return top;
}

function twoLines(title: string): [string, string] {
  if (title.length <= 20) return [title, ""];
  const words = title.split(" ");
  let best = 1, gap = Infinity;
  for (let i = 1; i < words.length; i++) {
    const d = Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length);
    if (d < gap) { gap = d; best = i; }
  }
  return [short(words.slice(0, best).join(" "), 22), short(words.slice(best).join(" "), 22)];
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

function Pill({ x, y, lines, className }: { x: number; y: number; lines: string[]; className: string }) {
  const w = Math.max(...lines.map((l) => l.length)) * 6.2 + 14, h = lines.length * 14 + 8;
  return (
    <g className={className}>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={8} />
      {lines.map((l, i) => <text key={i} x={x} y={y - h / 2 + 16 + i * 14} textAnchor="middle">{l}</text>)}
    </g>
  );
}

export function RoleGraph({ data, profile, scenario, onOpen }: {
  data: Matches; profile: Profile; scenario: Scenario; onOpen: (r: RoleMatch) => void;
}) {
  const [path, setPath] = useState<string[]>([]);  // the opened roles, from the centre outwards
  const [hover, setHover] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // In the path view the newest step is on the right: bring it into view.
  useEffect(() => { scroller.current?.scrollTo({ left: scroller.current.scrollWidth, behavior: "smooth" }); }, [path.join(">")]);
  const all = data.roles.filter((r) => !r.is_current_role);
  const direct = all.slice(0, DIRECT);

  // The ring, then the next roles of each opened role along the path. A role can appear again
  // further out: reached through another role, it is a different step with a smaller gap. Roles
  // already on the open path are left out, so a path never loops.
  const ring: Node[] = direct.map((role, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / direct.length;
    const r = 160 + (1 - role.fit) * 90;  // a better fit sits closer to you
    return { key: role.role_id, role, depth: 0, parent: null, via: role.missing, x: r * 1.38 * Math.cos(angle), y: r * 0.92 * Math.sin(angle) };
  });
  const openPath: Node[] = [];
  let opened = ring.find((n) => n.role.role_id === path[0]) ?? null;
  let options: Node[] = [];
  while (opened) {
    const from: Node = opened;
    openPath.push(from);
    const onPath = new Set(openPath.map((n) => n.role.role_id));
    const next = nextRoles(from.role, all.filter((r) => !onPath.has(r.role_id)), scenario);
    options = next.map((c) => ({ key: `${from.key}>${c.to.role_id}`, role: c.to, depth: from.depth + 1, parent: from, via: c.via, x: 0, y: 0 }));
    opened = options.find((k) => k.role.role_id === path[from.depth + 1]) ?? null;
  }
  const selected = openPath[openPath.length - 1] ?? null;
  // Path view: you, then each opened role in a row, then the next options stacked in the last column.
  if (selected) {
    openPath.forEach((n, i) => { n.x = (i + 1) * COL; n.y = 0; });
    options.forEach((n, i) => { n.x = (openPath.length + 1) * COL; n.y = (i - (options.length - 1) / 2) * ROW; });
  }
  const nodes = selected ? [...openPath, ...options] : ring;
  const isOpen = (n: Node) => openPath.includes(n);

  // The view box grows with the opened path, so the map never overflows its card.
  const pad = 20;
  const xs = [-YOU_R, YOU_R, ...nodes.flatMap((n) => [n.x - NODE_W / 2, n.x + NODE_W / 2])];
  const ys = [-YOU_R, YOU_R, ...nodes.flatMap((n) => [n.y - NODE_H / 2, n.y + NODE_H / 2])];
  const minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad;
  const vw = Math.max(...xs) + pad - minX, vh = Math.max(...ys) + pad - minY;

  // An option goes a step further; a role on the path steps back to it; the last one closes.
  function toggle(n: Node) {
    const upTo = openPath.slice(0, n.depth).map((p) => p.role.role_id);
    setPath(n === selected ? upTo : [...upTo, n.role.role_id]);
  }
  // Hovering lights one role and fades the others (except the open path).
  const dim = (n: Node) => hover !== null && hover !== n.key && !isOpen(n);
  const you = data.current_role?.title
    ?? (profile.audience === "graduate" ? t("graph.student") : profile.audience === "switcher" ? t("graph.switcher") : t("graph.you"));
  const hasNext = options.length > 0;

  return (
    <figure className="card role-graph">
      <p className="muted graph-hint">{t(selected ? "graph.hintPath" : "graph.hint")}</p>
      <div className="graph-scroll" ref={scroller}>
      {/* The path view keeps its text readable and scrolls sideways when it is wider than the card */}
      <svg viewBox={`${minX} ${minY} ${vw} ${vh}`} role="group" aria-labelledby="graph-title graph-desc"
        style={selected ? { minWidth: vw * 0.8 } : undefined}>
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
          const fx = n.parent?.x ?? 0, fy = n.parent?.y ?? 0;
          const len = Math.hypot(n.x, n.y);
          const start = n.parent ? toBox(n.x, n.y, fx, fy) : { x: (n.x * YOU_R) / len, y: (n.y * YOU_R) / len };
          const end = toBox(fx, fy, n.x, n.y);
          return <line key={`e-${n.key}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y}
            className={`graph-edge${n.parent ? " link" : ""}${dim(n) ? " dim" : ""}`} markerEnd={`url(#${n.parent ? "graph-arrow-link" : "graph-arrow"})`} />;
        })}

        {/* Skill labels after the lines, so no line crosses one */}
        {nodes.map((n) => {
          const fx = n.parent?.x ?? 0, fy = n.parent?.y ?? 0;
          const a = n.parent ? toBox(n.x, n.y, fx, fy, 0) : { x: 0, y: 0 }, b = toBox(fx, fy, n.x, n.y, 0);
          const lift = n.parent ? 0 : YOU_R;
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          const f = (lift + (len - lift) * 0.5) / len;
          return <Pill key={`p-${n.key}`} x={a.x + (b.x - a.x) * f} y={a.y + (b.y - a.y) * f}
            lines={skillLines(n.via, n.parent ? "+ " : "")} className={`graph-pill${n.parent ? " link" : ""}${dim(n) ? " dim" : ""}`} />;
        })}

        <g className="graph-you" onClick={() => setPath([])}>
          <circle cx={0} cy={0} r={YOU_R} />
          <text x={0} y={-6} textAnchor="middle" className="graph-you-name">{short(profile.display_name || t("graph.you"), 16)}</text>
          <text x={0} y={12} textAnchor="middle">{short(you, 20)}</text>
          <text x={0} y={28} textAnchor="middle" className="graph-small">{t("graph.skills").replace("{n}", String(profile.skills.length))}</text>
        </g>

        {nodes.map((n) => {
          const { role, x, y } = n;
          const [l1, l2] = twoLines(role.title);
          const o = role.outlook[scenario];
          const open = isOpen(n);
          return (
            <g key={n.key}
              className={`graph-node tone-${OUTLOOK_TONE[o.label] || "plain"}${open ? " open" : ""}${dim(n) ? " dim" : ""}`}
              tabIndex={0} role="button" aria-expanded={open}
              aria-label={`${role.title}, #${role.rank}, ${OUTLOOK_TEXT[o.label]}. ${t("graph.needs")}: ${n.via.map((s) => s.name).join(", ") || t("graph.ready")}`}
              onMouseEnter={() => setHover(n.key)} onMouseLeave={() => setHover(null)}
              onClick={() => toggle(n)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(n); } }}>
              <rect x={x - NODE_W / 2} y={y - NODE_H / 2} width={NODE_W} height={NODE_H} rx={12} />
              <text x={x - NODE_W / 2 + 10} y={y - NODE_H / 2 + 17} className="graph-rank">#{role.rank}</text>
              <text x={x + NODE_W / 2 - 12} y={y - NODE_H / 2 + 18} textAnchor="middle" className="graph-toggle">{open ? "−" : "+"}</text>
              <text x={x + 4} y={y - (l2 ? 9 : 2)} textAnchor="middle" className="graph-title">{l1}</text>
              {l2 && <text x={x + 4} y={y + 6} textAnchor="middle" className="graph-title">{l2}</text>}
              <text x={x} y={y + NODE_H / 2 - 8} textAnchor="middle" className="graph-small">
                {OUTLOOK_TEXT[o.label]} {o.index > 0 ? "+" : ""}{o.index}% · RM{role.pay.median_rm.toLocaleString("en-MY")}
              </text>
            </g>
          );
        })}
      </svg>
      </div>

      {selected && (
        <div className="graph-detail" role="status">
          <p className="graph-path"><strong>{t("graph.you")}</strong>{openPath.map((s) => <span key={s.key}> → {s.role.title}</span>)}</p>
          <ol className="graph-steps">
            {openPath.map((s) => (
              <li key={s.key}>
                <strong>{s.role.title}</strong>: {s.via.length
                  ? `${s.parent ? t("graph.thenAdd") : t("graph.learn")} ${s.via.map((v) => v.name).join(", ")}`
                  : t("graph.ready")}
              </li>
            ))}
          </ol>
          {!hasNext && <p className="muted">{t("graph.noNext")}</p>}
          <div className="actions">
            <button className="primary" onClick={() => onOpen(selected.role)}>{t("graph.openRole").replace("{role}", selected.role.title)}</button>
            <button className="link" onClick={() => setPath([])}>{t("graph.reset")}</button>
          </div>
        </div>
      )}
      <figcaption className="graph-key">
        <span><i className="key-line" /> {t("graph.keyEdge")}</span>
        <span><i className="key-dash" /> {t("graph.keyLink")}</span>
        <span>{t("graph.keyDistance")}</span>
        <span className="source">{t("graph.keyPay")}</span>
      </figcaption>
    </figure>
  );
}

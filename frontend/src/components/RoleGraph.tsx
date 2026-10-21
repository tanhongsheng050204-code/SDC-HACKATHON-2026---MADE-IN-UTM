import { useState } from "react";
import { Matches, Profile, RoleMatch, Scenario, SkillRef } from "../lib/api";
import { t } from "../lib/i18n";
import { OUTLOOK_TEXT, OUTLOOK_TONE } from "../lib/labels";

// The ranked roles as a map: you in the middle, each role a node, each edge the skills you would
// still need. Roles that need fewer new skills sit closer. A dashed edge between two roles marks a
// stepping stone: the nearer role already uses a good part of what the further one needs.
const W = 900, H = 620, CX = W / 2, CY = H / 2;
const NODE_W = 168, NODE_H = 60;
const MAX_ROLES = 8;
const MAX_LINKS = 3;
const YOU_R = 58;
const LINK_MIN_SKILLS = 2, LINK_MIN_SHARE = 0.25;

type Placed = { role: RoleMatch; x: number; y: number };

// Up to two lines: the two most important skills, then how many more.
function skillLines(missing: SkillRef[]): string[] {
  if (missing.length === 0) return [t("graph.ready")];
  const top = [...missing].sort((a, b) => b.weight - a.weight).slice(0, 2).map((s) => short(s.name, 16));
  if (missing.length > 2) top[1] = `${top[1]} +${missing.length - 2}`;
  return top;
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

function short(text: string, n: number) { return text.length > n ? text.slice(0, n - 1) + "…" : text; }

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

// A -> B when B's missing skills are mostly skills A's job already uses, and A is the nearer move.
function steppingStones(placed: Placed[]) {
  const links: { from: Placed; to: Placed; via: SkillRef[]; share: number }[] = [];
  for (const to of placed) {
    let best: (typeof links)[number] | null = null;
    for (const from of placed) {
      if (from === to || from.role.missing.length >= to.role.missing.length || to.role.missing.length === 0) continue;
      const fromSkills = new Set([...from.role.covered, ...from.role.missing].map((s) => s.skill_id));
      const shared = to.role.missing.filter((s) => fromSkills.has(s.skill_id)).length;
      const share = shared / to.role.missing.length;
      if (shared >= LINK_MIN_SKILLS && share >= LINK_MIN_SHARE && (!best || share > best.share)) {
        best = { from, to, via: to.role.missing.filter((s) => !fromSkills.has(s.skill_id)), share };
      }
    }
    if (best) links.push(best);
  }
  // One link out of each role, so every linked pair can sit side by side on the ring.
  const used = new Set<string>();
  return links.sort((a, b) => b.share - a.share).filter((l) => {
    if (used.has(l.from.role.role_id)) return false;
    used.add(l.from.role.role_id);
    return true;
  }).slice(0, MAX_LINKS);
}

// Rank order around the ring, except that a stepping stone's target comes right after it.
function ringOrder(items: Placed[], links: { from: Placed; to: Placed }[]) {
  const out: Placed[] = [];
  const add = (p: Placed) => {
    if (out.includes(p)) return;
    out.push(p);
    for (const l of links) if (l.from === p) add(l.to);
  };
  for (const p of items) if (!links.some((l) => l.to === p && !out.includes(l.from))) add(p);
  for (const p of items) add(p);
  return out;
}

export function RoleGraph({ data, profile, scenario, onOpen }: {
  data: Matches; profile: Profile; scenario: Scenario; onOpen: (r: RoleMatch) => void;
}) {
  const [focus, setFocus] = useState<string | null>(null);
  const roles = data.roles.filter((r) => !r.is_current_role).slice(0, MAX_ROLES);
  const items: Placed[] = roles.map((role) => ({ role, x: CX, y: CY }));
  const links = steppingStones(items);
  const placed = ringOrder(items, links);
  placed.forEach((p, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / placed.length;
    const r = 165 + (1 - p.role.fit) * 115;  // a better fit sits closer to you
    p.x = CX + r * 1.38 * Math.cos(angle);
    p.y = CY + r * 0.92 * Math.sin(angle);
  });
  const you = data.current_role?.title
    ?? (profile.audience === "graduate" ? t("graph.student") : profile.audience === "switcher" ? t("graph.switcher") : t("graph.you"));
  const dim = (id: string) => focus !== null && focus !== id;

  return (
    <figure className="card role-graph">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="graph-title graph-desc">
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

        {placed.map(({ role, x, y }) => {
          const end = toBox(CX, CY, x, y);
          const len = Math.hypot(x - CX, y - CY);
          const sx = CX + ((x - CX) * YOU_R) / len, sy = CY + ((y - CY) * YOU_R) / len;
          return (
            <g key={`e-${role.role_id}`} className={`graph-edge${dim(role.role_id) ? " dim" : ""}`}>
              <line x1={sx} y1={sy} x2={end.x} y2={end.y} markerEnd="url(#graph-arrow)" />
            </g>
          );
        })}

        {links.map(({ from, to, via }) => {
          const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
          const qx = CX + (mx - CX) * 1.45, qy = CY + (my - CY) * 1.45;  // bow outwards, away from you
          const a = toBox(qx, qy, from.x, from.y), b = toBox(qx, qy, to.x, to.y);
          const lines = via.length ? skillLines(via).map((l, i) => (i === 0 ? `+ ${l}` : l)) : [t("graph.sameSkills")];
          const dimmed = focus && focus !== from.role.role_id && focus !== to.role.role_id;
          return (
            <g key={`l-${from.role.role_id}-${to.role.role_id}`} className={`graph-link${dimmed ? " dim" : ""}`}>
              <path d={`M${a.x},${a.y} Q${qx},${qy} ${b.x},${b.y}`} markerEnd="url(#graph-arrow-link)" />
              <Pill x={(a.x + 2 * qx + b.x) / 4} y={(a.y + 2 * qy + b.y) / 4} lines={lines} className="graph-pill link" />
            </g>
          );
        })}

        {/* Skill labels last among the lines, so no line crosses one */}
        {placed.map(({ role, x, y }) => {
          const end = toBox(CX, CY, x, y, 0);
          const len = Math.hypot(end.x - CX, end.y - CY);
          const f = (YOU_R + (len - YOU_R) * 0.5) / len;
          return <Pill key={`p-${role.role_id}`} x={CX + (end.x - CX) * f} y={CY + (end.y - CY) * f} lines={skillLines(role.missing)}
            className={`graph-pill${dim(role.role_id) ? " dim" : ""}`} />;
        })}

        <g className="graph-you">
          <circle cx={CX} cy={CY} r={58} />
          <text x={CX} y={CY - 6} textAnchor="middle" className="graph-you-name">{short(profile.display_name || t("graph.you"), 16)}</text>
          <text x={CX} y={CY + 12} textAnchor="middle">{short(you, 20)}</text>
          <text x={CX} y={CY + 28} textAnchor="middle" className="graph-small">{t("graph.skills").replace("{n}", String(profile.skills.length))}</text>
        </g>

        {placed.map(({ role, x, y }) => {
          const [l1, l2] = twoLines(role.title);
          const o = role.outlook[scenario];
          return (
            <g key={role.role_id} className={`graph-node tone-${OUTLOOK_TONE[o.label] || "plain"}${dim(role.role_id) ? " dim" : ""}`}
              tabIndex={0} role="button" aria-label={`${role.title}, #${role.rank}, ${OUTLOOK_TEXT[o.label]}. ${t("graph.needs")}: ${role.missing.map((s) => s.name).join(", ") || t("graph.ready")}`}
              onMouseEnter={() => setFocus(role.role_id)} onMouseLeave={() => setFocus(null)}
              onFocus={() => setFocus(role.role_id)} onBlur={() => setFocus(null)}
              onClick={() => onOpen(role)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(role); } }}>
              <rect x={x - NODE_W / 2} y={y - NODE_H / 2} width={NODE_W} height={NODE_H} rx={12} />
              <text x={x - NODE_W / 2 + 10} y={y - NODE_H / 2 + 17} className="graph-rank">#{role.rank}</text>
              <text x={x + 6} y={y - (l2 ? 9 : 2)} textAnchor="middle" className="graph-title">{l1}</text>
              {l2 && <text x={x + 6} y={y + 6} textAnchor="middle" className="graph-title">{l2}</text>}
              <text x={x} y={y + NODE_H / 2 - 8} textAnchor="middle" className="graph-small">
                {OUTLOOK_TEXT[o.label]} {o.index > 0 ? "+" : ""}{o.index}% · RM{role.pay.median_rm.toLocaleString("en-MY")}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="graph-key">
        <span><i className="key-line" /> {t("graph.keyEdge")}</span>
        <span><i className="key-dash" /> {t("graph.keyLink")}</span>
        <span>{t("graph.keyDistance")}</span>
        <span className="source">{t("graph.keyPay")}</span>
      </figcaption>
    </figure>
  );
}

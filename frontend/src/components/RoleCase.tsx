import type { RoleCase as RoleCaseData } from "../lib/api";

// "Why this could work" vs "What could go wrong": two honest columns, each point with its source.
export function RoleCase({ data }: { data: RoleCaseData }) {
  return (
    <div className="role-case">
      <div className="card case-col pro">
        <h2>Why this could work for you</h2>
        {data.pros.length === 0 ? <p className="muted">Nothing stands out in its favour for your profile yet.</p> : (
          <ul>{data.pros.map((p) => <li key={p.text}><span>{p.text}</span><small className="source">{p.source}</small></li>)}</ul>
        )}
      </div>
      <div className="card case-col con">
        <h2>What could go wrong</h2>
        {data.cons.length === 0 ? <p className="muted">No warning signs in our data for this role.</p> : (
          <ul>{data.cons.map((p) => <li key={p.text}><span>{p.text}</span><small className="source">{p.source}</small></li>)}</ul>
        )}
      </div>
    </div>
  );
}

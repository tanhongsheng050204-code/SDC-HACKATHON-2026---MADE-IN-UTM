const BASE = import.meta.env.VITE_API_URL ?? "";

export type Scenario = "slow" | "baseline" | "accelerated";

export interface Skill { id: string; name: string; category: string }
export interface Sdg { number: number; name: string; colour: string; target?: string; reason?: string }
export interface SkillRef { skill_id: string; name: string; weight: number; sdgs: number[] }
export interface RoleOption { id: string; title: string }
export interface Profile {
  id: string; display_name: string | null; current_role_id: string | null;
  skills: string[]; interests: number[]; experience_years: number | null; completed_courses: string[]; story?: string;
}
export interface RoleMatch {
  role_id: string; title: string; family: string; summary: string;
  rank: number; rank_change_vs_baseline: number; score: number; fit: number;
  why: { fit: number; score: number; fit_points: number; outlook_points: number; sdg_points: number; matched_sdgs: number[] };
  estimate_range: { low: number; high: number; horizon_year: number; year: number };
  citation: { snapshot_id: string; imported: string; note: string | null };
  outlook: Record<Scenario, { index: number; label: string }>;
  robust_pick: boolean; at_risk: boolean; is_current_role: boolean;
  covered: SkillRef[]; missing: SkillRef[]; sdgs: Sdg[];
}
export interface SignalSource {
  snapshot_id: string; source: string; source_url: string; published: string;
  imported: string; horizon_year: number; illustrative: boolean;
}
export interface Matches {
  scenario: { id: Scenario; label: string; description: string }; signal_source: SignalSource; roles: RoleMatch[];
  year: number; year_range: [number, number];
}
export interface SkillTrend {
  skill_id: string; name: string; trend: number | null; label: "rising" | "steady" | "declining" | "no_data";
  sources: string[]; mine: boolean;
}
export interface Radar {
  snapshot_id: string; imported: string; source: string; illustrative: boolean;
  inputs: { source: string; url: string; retrieved: string }[];
  capability_momentum: { id: string; name: string; momentum: number | null }[];
  skills: SkillTrend[];
  roles: { role_id: string; title: string; index: number; label: string }[];
}
export interface RefreshStatus { state: "idle" | "running" | "done" | "failed"; steps: string[]; snapshot_id: string | null; error: string | null }
export interface Workforce {
  scenario: { id: Scenario; label: string; description: string };
  employees: number; at_risk: number; total_hours: number;
  roles: { role_id: string; title: string; headcount: number; at_risk: boolean; avg_fit: number;
    outlook: Record<Scenario, { index: number; label: string }> }[];
  moves: { from_role: string; to_role: string; to_role_id: string; people: number; avg_hours: number; avg_fit_now: number; sdgs: Sdg[] }[];
  sdg_contribution: (Sdg & { people: number })[];
  problems: string[];
  signal_source: { snapshot_id: string; imported: string; illustrative: boolean };
}
export type TaskLabel = "automate" | "assist" | "human";
export interface RoleTasks {
  role_id: string; onet_code: string | null; onet_note: string | null;
  source: string; source_url: string; labels_note: string;
  tasks: { id: string; text: string; label: TaskLabel; reason: string; reviewed_by: string | null }[];
  counted: number; shares: Record<TaskLabel, number>; reviewed: number;
}
export interface ChatTurn { next_question: string; is_complete: boolean; skills_found: string[]; interests: number[] }
export interface Course { id: string; title: string; provider: string; url: string; hours: number; level: string; cost: string }
export interface Pathway {
  role_id: string; fit: number; readiness: number; total_hours: number; hours_left: number; summary: string; summary_mode: string;
  steps: { step: number; skills: { skill_id: string; name: string }[]; course: Course; why: string; done: boolean }[];
  grounding: { sentences: number; supported: number; unsupported: number[]; all_supported: boolean } | null;
  uncovered_skills: string[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return response.status === 204 ? (undefined as T) : response.json();
}

export const api = {
  health: () => request<{ status: string; llm_model: string; snapshot_imported: string }>("/health"),
  skills: () => request<Skill[]>("/skills"),
  sdgs: () => request<Sdg[]>("/sdgs"),
  roles: () => request<RoleOption[]>("/roles"),
  extract: (text: string) =>
    request<{ skills: string[]; unmatched: string[]; mode: string }>("/intake/extract", {
      method: "POST", body: JSON.stringify({ text }),
    }),
  createProfile: (body: Omit<Profile, "id" | "completed_courses" | "story">) =>
    request<Profile>("/profiles", { method: "POST", body: JSON.stringify(body) }),
  demoProfile: (key: string) => request<Profile>(`/profiles/demo/${key}`, { method: "POST" }),
  getProfile: (id: string) => request<Profile>(`/profiles/${id}`),
  deleteProfile: (id: string) => request<void>(`/profiles/${id}`, { method: "DELETE" }),
  matches: (id: string, scenario: Scenario, year?: number) =>
    request<Matches>(`/profiles/${id}/matches?scenario=${scenario}${year ? `&year=${year}` : ""}`),
  complete: (id: string, courseId: string, done: boolean) =>
    request<Profile>(`/profiles/${id}/complete`, { method: "POST", body: JSON.stringify({ course_id: courseId, done }) }),
  turn: (messages: { role: "user" | "assistant"; content: string }[]) =>
    request<ChatTurn>("/intake/turn", { method: "POST", body: JSON.stringify({ messages }) }),
  upload: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(`${BASE}/api/intake/upload`, { method: "POST", body: form });
    const body = await response.json();
    if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Upload failed");
    return body as { skills: string[]; unmatched: string[]; mode: string; characters: number };
  },
  workforceSample: async () => (await fetch(`${BASE}/api/workforce/sample`)).text(),
  workforce: async (csv: string, scenario: Scenario) => {
    const response = await fetch(`${BASE}/api/workforce/analyse`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv, scenario }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Couldn't read that file");
    return body as Workforce;
  },
  radar: (id: string) => request<Radar>(`/radar?profile_id=${id}`),
  refreshStart: (token: string, force: boolean) =>
    request<RefreshStatus>(`/signals/refresh?force=${force}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": token } }),
  refreshStatus: (token: string) =>
    request<RefreshStatus>("/signals/refresh", { headers: { "Content-Type": "application/json", "X-Admin-Token": token } }),
  tasks: (roleId: string, done: string[] = []) =>
    request<RoleTasks>(`/roles/${encodeURIComponent(roleId)}/tasks${done.length ? `?done=${encodeURIComponent(done.join(","))}` : ""}`),
  pathway: (id: string, role: string) => request<Pathway>(`/profiles/${id}/pathway?role=${encodeURIComponent(role)}`),
};

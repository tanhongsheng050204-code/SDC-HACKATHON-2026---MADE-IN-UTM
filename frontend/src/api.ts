const BASE = import.meta.env.VITE_API_URL ?? "";

export type Scenario = "slow" | "baseline" | "accelerated";

export interface Skill { id: string; name: string; category: string }
export interface Sdg { number: number; name: string; colour: string; target?: string; reason?: string }
export interface SkillRef { skill_id: string; name: string; weight: number; sdgs: number[] }
export interface RoleOption { id: string; title: string }
export interface Profile {
  id: string; display_name: string | null; current_role_id: string | null;
  skills: string[]; interests: number[]; experience_years: number | null; story?: string;
}
export interface RoleMatch {
  role_id: string; title: string; family: string; summary: string;
  rank: number; rank_change_vs_baseline: number; score: number; fit: number;
  why: { fit: number; score: number; fit_points: number; outlook_points: number; sdg_points: number; matched_sdgs: number[] };
  estimate_range: { low: number; high: number; horizon_year: number };
  citation: { snapshot_id: string; imported: string; note: string | null };
  outlook: Record<Scenario, { index: number; label: string }>;
  robust_pick: boolean; at_risk: boolean; is_current_role: boolean;
  covered: SkillRef[]; missing: SkillRef[]; sdgs: Sdg[];
}
export interface SignalSource {
  snapshot_id: string; source: string; source_url: string; published: string;
  imported: string; horizon_year: number; illustrative: boolean;
}
export interface Matches { scenario: { id: Scenario; label: string; description: string }; signal_source: SignalSource; roles: RoleMatch[] }
export interface Course { id: string; title: string; provider: string; url: string; hours: number; level: string; cost: string }
export interface Pathway {
  role_id: string; fit: number; total_hours: number; summary: string; summary_mode: string;
  steps: { step: number; skills: { skill_id: string; name: string }[]; course: Course; why: string }[];
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
  createProfile: (body: Omit<Profile, "id">) =>
    request<Profile>("/profiles", { method: "POST", body: JSON.stringify(body) }),
  demoProfile: (key: string) => request<Profile>(`/profiles/demo/${key}`, { method: "POST" }),
  getProfile: (id: string) => request<Profile>(`/profiles/${id}`),
  deleteProfile: (id: string) => request<void>(`/profiles/${id}`, { method: "DELETE" }),
  matches: (id: string, scenario: Scenario) => request<Matches>(`/profiles/${id}/matches?scenario=${scenario}`),
  pathway: (id: string, role: string) => request<Pathway>(`/profiles/${id}/pathway?role=${encodeURIComponent(role)}`),
};

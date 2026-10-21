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
  skills_source: { onet_code: string | null; onet_note: string | null };
  outlook: Record<Scenario, { index: number; label: string }>;
  robust_pick: boolean; at_risk: boolean; is_current_role: boolean;
  covered: SkillRef[]; missing: SkillRef[]; sdgs: Sdg[];
}
export interface SignalSource {
  snapshot_id: string; source: string; source_url: string; published: string;
  imported: string; horizon_year: number; illustrative: boolean;
}
export interface Snapshot extends SignalSource { signal_count: number; reviewed_by?: string | null; inputs?: { source: string; url: string; retrieved: string }[] }
export interface RoleInfo {
  id: string; title: string; summary: string;
  skills: { skill_id: string; weight: number }[];
  sdgs: Sdg[]; skill_sdgs: Record<string, Sdg[]>;
  malaysia: MalaysiaPay | null;
}
export interface MalaysiaPay {
  group: string; label: string; median_rm: number; mean_rm: number; employees_thousands: number; employees_change_pct: number | null;
  year: number; trend_from: number; source: string; source_url: string; licence: string; retrieved: string; note: string;
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
export interface ExploreRow { role_id: string; title: string; rank: number; rank_before: number; fit: number; fit_before: number; score: number; index: number; label: string }
export interface Explore {
  adoption: number; preset: Scenario | null; year: number;
  added_skills: { skill_id: string; name: string }[];
  ranking: ExploreRow[];
  tipping: {
    range: [number, number]; current_role: string | null;
    current_changes: { adoption: number; from: string; to: string }[];
    top_changes: { adoption: number; from: string; to: string }[];
    always_top5: string[];
    series: { adoption: number; current_index: number | null; top: string }[];
  };
  assumption: string; source: { snapshot_id: string; imported: string };
}
export interface CasePoint { text: string; source: string }
export interface Insight {
  xray: {
    role_id: string; scenario: Scenario; year: number;
    steps: { label: string; value: number; detail: string }[];
    result: { index: number; label: string; bands: string };
    ranking_points: { normalised: number; points: number; detail: string };
    source: { snapshot_id: string; imported: string; url: string };
  };
  pros: CasePoint[]; cons: CasePoint[];
  pay_jump: { from_group: string; from_rm: number; to_group: string; to_rm: number; difference_rm: number; year: number; note: string } | null;
}
export interface PendingPreview {
  snapshot_id: string; imported: string; live_snapshot_id: string;
  inputs: { source: string; url: string; retrieved: string }[];
  roles: { role_id: string; title: string; before: number | null; after: number; label_before: string | null; label_after: string; change: number | null }[];
  skills: Record<"rising" | "steady" | "declining" | "no_data", number>;
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
export interface FutureCard {
  card_id: string; created_at: string; display_name: string | null;
  role: { role_id: string; title: string; summary: string };
  readiness: number; outlook: { index: number; label: string };
  estimate_range: { low: number; high: number; horizon_year: number; year: number };
  robust_pick: boolean; next_skills: string[]; steps: number; hours: number; first_step: string | null;
  sdgs: Sdg[]; source: { snapshot_id: string; imported: string; note: string | null };
}
export interface CoachProposal { kind: "scenario" | "interest"; value: string | number; label: string }
export interface CoachReply {
  answer: string; mode: string; sources: { id: string; text: string }[]; guard?: { safe: boolean; category: string | null };
  grounding: { sentences: number; supported: number; unsupported: number[]; all_supported: boolean } | null;
  proposal: CoachProposal | null; suggestions: string[];
}
export interface ChatTurn { next_question: string; is_complete: boolean; skills_found: string[]; interests: number[] }
export interface Course {
  id: string; title: string; provider: string; url: string; hours: number; level: string; cost: string; checked: string | null;
  price_rm?: number | null; price_note?: string; price_checked?: string;
  hrd_corp?: "claimable" | "check" | "not_needed"; hrd_note?: string;
}
export interface Pathway {
  role_id: string; fit: number; readiness: number; total_hours: number; hours_left: number; summary: string; summary_mode: string;
  steps: { step: number; skills: { skill_id: string; name: string }[]; course: Course; why: string; done: boolean }[];
  grounding: { sentences: number; supported: number; unsupported: number[]; all_supported: boolean } | null;
  uncovered_skills: string[];
}

// The hosted API sleeps when idle (free plan) and takes up to a minute to wake. While it does,
// requests fail to connect or get 502/503/504, so we retry for a while and let the shell show
// a "waking up" notice instead of an error.
const WAKE_STATUSES = new Set([502, 503, 504]);
const WAKE_LIMIT_MS = 75_000;
type WakeListener = (waking: boolean) => void;
const wakeListeners = new Set<WakeListener>();
export function onServerWaking(listener: WakeListener) {
  wakeListeners.add(listener);
  return () => { wakeListeners.delete(listener); };
}
const setWaking = (waking: boolean) => wakeListeners.forEach((l) => l(waking));

async function fetchAwake(url: string, init?: RequestInit): Promise<Response> {
  const started = Date.now();
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, init);
      if (!WAKE_STATUSES.has(response.status) || Date.now() - started > WAKE_LIMIT_MS) {
        if (attempt > 0) setWaking(false);
        return response;
      }
    } catch (e) {
      if (Date.now() - started > WAKE_LIMIT_MS) { setWaking(false); throw e; }
    }
    setWaking(true);
    await new Promise((r) => setTimeout(r, Math.min(2000 + attempt * 1000, 6000)));
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchAwake(`${BASE}/api${path}`, {
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
  role: (id: string) => request<RoleInfo>(`/roles/${encodeURIComponent(id)}`),
  snapshots: () => request<Snapshot[]>("/signals"),
  explore: (id: string, adoption: number, add: string[], year?: number) =>
    request<Explore>(`/profiles/${id}/explore?adoption=${adoption}${add.length ? `&add=${encodeURIComponent(add.join(","))}` : ""}${year ? `&year=${year}` : ""}`),
  insight: (id: string, roleId: string, scenario: Scenario, year?: number) =>
    request<Insight>(`/profiles/${id}/roles/${encodeURIComponent(roleId)}/insight?scenario=${scenario}${year ? `&year=${year}` : ""}`),
  evalCvs: () => request<{ name: string; text: string }[]>("/eval/cvs"),
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
  turn: (messages: { role: "user" | "assistant"; content: string }[], language = "en") =>
    request<ChatTurn>("/intake/turn", { method: "POST", body: JSON.stringify({ messages, language }) }),
  upload: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const response = await fetchAwake(`${BASE}/api/intake/upload`, { method: "POST", body: form });
    const body = await response.json();
    if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Upload failed");
    return body as { skills: string[]; unmatched: string[]; mode: string; characters: number };
  },
  workforceSample: async () => (await fetchAwake(`${BASE}/api/workforce/sample`)).text(),
  workforce: async (csv: string, scenario: Scenario) => {
    const response = await fetchAwake(`${BASE}/api/workforce/analyse`, {
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
  pending: (token: string) =>
    request<{ snapshot_id: string; imported: string }[]>("/signals/pending", { headers: { "Content-Type": "application/json", "X-Admin-Token": token } }),
  pendingPreview: (token: string, id: string) =>
    request<PendingPreview>(`/signals/pending/${encodeURIComponent(id)}`, { headers: { "Content-Type": "application/json", "X-Admin-Token": token } }),
  decide: (token: string, id: string, decision: "approve" | "reject", reviewer: string, reason?: string) =>
    request<{ snapshot_id: string; state: string }>(`/signals/pending/${encodeURIComponent(id)}/${decision}`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": token },
      body: JSON.stringify({ reviewer, reason: reason || null }),
    }),
  tasks: (roleId: string, done: string[] = []) =>
    request<RoleTasks>(`/roles/${encodeURIComponent(roleId)}/tasks${done.length ? `?done=${encodeURIComponent(done.join(","))}` : ""}`),
  updateProfile: (p: Profile) =>
    request<Profile>(`/profiles/${p.id}`, { method: "PUT", body: JSON.stringify({
      display_name: p.display_name, current_role_id: p.current_role_id, skills: p.skills,
      interests: p.interests, experience_years: p.experience_years }) }),
  coach: (profileId: string, question: string, scenario: Scenario, roleId?: string) =>
    request<CoachReply>("/coach", { method: "POST", body: JSON.stringify({ profile_id: profileId, question, scenario, role_id: roleId ?? null }) }),
  createCard: (id: string, roleId: string) =>
    request<{ card_id: string }>(`/profiles/${id}/cards`, { method: "POST", body: JSON.stringify({ role_id: roleId }) }),
  card: (cardId: string) => request<FutureCard>(`/cards/${encodeURIComponent(cardId)}`),
  pathway: (id: string, role: string) => request<Pathway>(`/profiles/${id}/pathway?role=${encodeURIComponent(role)}`),
};

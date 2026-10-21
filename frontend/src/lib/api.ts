import { freshToken, refreshToken, signOut } from "./auth";

const BASE = import.meta.env.VITE_API_URL ?? "";

export type Scenario = "slow" | "baseline" | "accelerated";
export interface Pay { group: string; median_rm: number; mean_rm: number; year: number; source: string; table: string; source_url: string }
export interface PrefMatch { dim: string; label: string; labels?: Record<string, string> }
export type Audience = "worker" | "graduate" | "switcher";

export interface Skill { id: string; name: string; category: string }
/** The scrubbed CV text that would go to a language model, and how many details were removed. */
export interface SendPreview { text: string; removed: Partial<Record<"NAME" | "EMAIL" | "PHONE" | "IC" | "DOB" | "AGE" | "ADDRESS" | "ORG", number>>; characters: number }
export interface Sdg { number: number; name: string; colour: string; target?: string; reason?: string; reasons?: Texts }
export interface SkillRef { skill_id: string; name: string; weight: number; sdgs: number[]; added_from_ads?: boolean }
export interface RoleOption { id: string; title: string }
export interface Profile {
  id: string; display_name: string | null; current_role_id: string | null;
  skills: string[]; experience_years: number | null; completed_courses: string[]; story?: string;
  audience?: Audience | null; user_id?: string | null; is_demo?: boolean; preferences?: Record<string, number>; skill_levels?: Record<string, number>;
}
export interface Citation { url: string; title: string; employer: string; kind: "job_ad" | "web"; grounded: boolean; quote: string }
export interface SkillEvidence { status: "confirmed" | "single" | "none"; sources: number; job_ads: number; citations: Citation[] }
export interface RoleEvidence {
  searched: string; widened: boolean; reviewed_by: string | null; reviewed_at: string | null;
  skills: Record<string, SkillEvidence>;
}
export interface EvidencePage { url: string; title: string; employer: string; kind: "job_ad" | "web"; grounded: boolean; quotes: { skill_id: string | null; skill_name: string; quote: string }[] }
export interface EvidencePending { id: string; role_id: string; title: string; searched: string; widened: boolean; job_ads: number; pages: number; added: string[]; added_names: string[] }
export interface EvidenceDetail {
  id: string; role_id: string; title: string; searched: string; widened: boolean; sources: EvidencePage[];
  summary: { skills: Record<string, SkillEvidence>; added: { skill_id: string; job_ads: number }[]; not_in_catalogue: { name: string; count: number }[] };
  skill_names: Record<string, string>; role_skills: string[];
}
export type Texts = { en: string; ms: string; zh: string };
export interface DayInJob { role_id: string; text: Texts; basis: "data" | "job_ads"; drafted: string; reviewed_by: string | null }
export interface DayPending { id: string; kind: "day"; role_id: string; title: string; drafted: string; basis: "data" | "job_ads" }
export interface DayDetail extends DayPending { text: Texts; current: Texts | null; facts: { from_malaysian_job_ads?: string[] } }
export interface EmergingSource { url: string; title: string; kind: "job_ad" | "web"; grounded: boolean; quote: string; employer?: string }
export interface EmergingCard {
  capability_id: string; capability_name: string; momentum: number | null; snapshot_id: string; searched: string;
  title: Texts; summary: Texts; sources: EmergingSource[]; reviewed_by: string | null; reviewed_at: string | null;
  carry_over: { skill_id: string; name: string }[]; to_learn: { skill_id: string; name: string }[];
  stepping_stone: { role_id: string; title: string; reason: Texts };
  sdg: (Sdg & { reason: Texts }) | null;
}
export interface EmergingPending { id: string; kind: "emerging"; subject: string; title: string; capability_name: string; momentum: number | null; searched: string; sources: number }
export interface EmergingDetail {
  id: string; kind: "emerging"; subject: string; capability_name: string; momentum: number | null; searched: string;
  title: Texts; summary: Texts; skills: string[]; stepping_stone: string; stepping_stone_title: string; stepping_reason: Texts;
  sdg: { number: number; reason: Texts } | null; sources: EmergingSource[]; skill_names: Record<string, string>;
}
export interface EvidenceStatus { state: "idle" | "running" | "done" | "stopped" | "failed"; steps: string[]; saved: string[]; failed: string[]; error: string | null; stopping?: boolean }
export interface RoleMatch {
  role_id: string; title: string; family: string; summary: string;
  evidence: RoleEvidence | null;
  rank: number; rank_change_vs_baseline: number; score: number; fit: number;
  plan_hours?: number; long_shot?: boolean; stepping_stone?: { role_id: string; title: string } | null;
  carry_over: { skill_id: string; name: string }[];
  rank_without_extra?: number;
  pay: Pay; pay_change_rm: number | null;
  why: { fit: number; score: number; fit_points: number; outlook_points: number; preference_points: number; entry_points: number;
    matched_preferences: PrefMatch[] };
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
}
export interface Matches {
  scenario: { id: Scenario; label: string; description: string }; signal_source: SignalSource; roles: RoleMatch[];
  year: number; year_range: [number, number]; also_like: AlsoLike[];
  current_role: (Pick<RoleMatch, "role_id" | "title" | "summary" | "fit" | "outlook" | "at_risk"> & { is_current_role: true }) | null;
  shortest_route?: string | null;
}
export type TrendLabel = "rising" | "steady" | "declining" | "no_data";
export interface ForecastBand { change_pct: number; low_pct: number; high_pct: number; label: TrendLabel; sure: boolean }
export interface SkillForecast {
  horizon_year: number; history: { period: string; share_pct: number }[];
  growth_per_year: number | null; ai_per_year: number; emerging: boolean;
  scenarios: Record<Scenario, ForecastBand>;
}
export interface SkillTrend {
  skill_id: string; name: string; trend: number | null; label: TrendLabel;
  sources: string[]; mine: boolean; forecast?: SkillForecast;
}
export interface ForecastMeta {
  method: string; horizon_year: number;
  history: Partial<Record<"jobs" | "research" | "dosm", { source: string; retrieved: string; periods: [string, string] }>>;
  backtest: { held_out_quarters: number; skills_checked: number; clear_trends: number; direction_right: number;
    always_rising_right: number; model_error: number; no_change_error: number } | null;
}
export interface Radar {
  snapshot_id: string; imported: string; source: string; illustrative: boolean;
  inputs: { source: string; url: string; retrieved: string }[];
  capability_momentum: { id: string; name: string; momentum: number | null }[];
  skills: SkillTrend[];
  roles: { role_id: string; title: string; index: number; label: string;
    scenarios: Record<Scenario, { index: number; label: string }>;
    malaysia: (ForecastBand & { horizon_year: number; history: { period: string; share_pct: number }[] }) | null }[];
  forecast: ForecastMeta | null;
}
export interface PendingPreview {
  snapshot_id: string; imported: string; live_snapshot_id: string;
  inputs: { source: string; url: string; retrieved: string }[];
  roles: { role_id: string; title: string; before: number | null; after: number; label_before: string | null; label_after: string; change: number | null }[];
  skills: Record<"rising" | "steady" | "declining" | "no_data", number>;
}
export interface RefreshStatus { state: "idle" | "running" | "done" | "failed"; steps: string[]; snapshot_id: string | null; error: string | null }
export interface InPlace { role_id: string; title: string; people: number; avg_hours: number; fees_each_rm: number; staff_time_rm: number; ai_skills: string[] }
export interface Workforce {
  scenario: { id: Scenario; label: string; description: string };
  employees: number; at_risk: number; total_hours: number;
  budget: { total_rm: number; claimable_rm: number; ask_provider_rm: number; unpriced_courses: string[];
    people_with_fees: number; staff_time_rm: number; pay_year: number };
  roles: { role_id: string; title: string; headcount: number; at_risk: boolean; avg_fit: number;
    outlook: Record<Scenario, { index: number; label: string }> }[];
  moves: { from_role: string; to_role: string; to_role_id: string; people: number; avg_hours: number; avg_fit_now: number; fees_each_rm: number; sdgs: Sdg[] }[];
  in_place: InPlace[]; get_ahead: InPlace[];
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
  pay: Pay; pay_change_rm: number | null;
  proven?: { name: string; level: number; level_name: string }[];
}
export interface CoachProposal { kind: "scenario"; value: string; label: string }
export interface CasePoint { text: string; source: string; key?: string; vars?: Record<string, unknown>; source_key?: string }
export interface RoleCase { role_id: string; pros: CasePoint[]; cons: CasePoint[] }
export interface CoachReply {
  answer: string; mode: string; sources: { id: string; text: string }[];
  grounding: { sentences: number; supported: number; unsupported: number[]; all_supported: boolean } | null;
  proposal: CoachProposal | null; suggestions: string[];
}
export interface ChatTurn { next_question: string; is_complete: boolean; skills_found: string[] }
export interface Course {
  id: string; title: string; provider: string; url: string; hours: number; level: string; cost: string; checked: string | null;
  price_rm?: number | null; price_note?: string; price_checked?: string;
  hrd_corp?: "claimable" | "check" | "not_needed"; hrd_note?: string;
}
export interface TreeNode {
  skill_id: string; name: string; level: number; from_cv: boolean; unlocked: boolean;
  prereqs: string[]; depth: number; in_role: boolean;
  course: { id: string; title: string; url: string; hours: number; cost: string } | null;
  step: number | null; course_done: boolean;
  evidence?: SkillEvidence | null; added_from_ads?: boolean;
}
export interface SkillTree {
  role: { role_id: string; title: string }; nodes: TreeNode[];
  readiness: number; hours_left: number; total_steps: number;
}
export interface CheckStart {
  check_id: string; skill_id: string; level: number; level_name: string;
  questions: { prompt: string; options: string[] }[];
}
export interface CheckResult {
  passed: boolean; correct: number; level: number; level_name: string; answers: number[];
  explanations: string[]; course: { id: string; title: string; url: string } | null;
  sdgs?: Sdg[];  // on a pass: how the proven skill serves the goals
}

export interface SurveyCard { id: string; text: Record<string, string>; role_ids: string[] }
export interface WorkDimension { id: string; plus: Record<string, string>; minus: Record<string, string> }
export type ScaleAnswer = "strongly_disagree" | "disagree" | "neutral" | "agree" | "strongly_agree";
export interface SurveyAnswer { card_id: string; answer: ScaleAnswer | "other"; note?: string; dims?: Record<string, number> }
export interface AlsoLike {
  role_id: string; title: string; rank: number; fit: number; preference_match: number;
  matched_preferences: PrefMatch[];
}
export interface SurveyResult { preferences: Record<string, number>; summary: string[]; also_like: AlsoLike[] }

type Count = number | "fewer than 3";
export interface Programme { id: string; name: Texts; skills: string[] }
export interface ClassResult {
  scenario: { id: Scenario; label: string; description: string };
  students: Count; programmes: { name: string; students: Count }[];
  by_programme: { name: string; students: number; best_fit: { role_id: string; title: string; students: Count }[];
    top_gaps: { skill_id: string; name: string; students: Count; course: { title: string; url: string } | null }[] }[];
  best_fit: { role_id: string; title: string; students: Count; outlook: Record<Scenario, { index: number; label: string }> }[];
  top_gaps: { skill_id: string; name: string; students: Count; course: { id: string; title: string; url: string } | null }[];
  courses: { course: { id: string; title: string; provider: string; url: string; hours: number; cost: string }; students_helped: Count; hours: number }[];
  sdg_contribution: (Sdg & { students: Count })[];
  problems: string[];
}

export interface Xray {
  role_id: string; title: string; scenario: Scenario; year: number; adoption: number; final: number; label: string;
  steps: { label: string; value: number; running_total: number; source: string; cap: string | null; key?: string; vars?: Record<string, unknown> }[];
}

export interface AiAssisted {
  role_id: string; title: string; readiness: number;
  ai_skills: { skill_id: string; name: string; why: string; have: boolean }[];
  tasks: { id: string; text: string; label: TaskLabel; change: "check" | "faster" | "yours" }[];
  task_shares: Record<TaskLabel, number>;
  steps: Pathway["steps"]; total_hours: number; hours_left: number;
  leads_to: { capability_id: string; title: Texts }[];
  reviewed_by: string | null;
}

export interface RoleHistory {
  role_id: string; scenario: Scenario;
  points: { snapshot_id: string; imported: string; source: string; illustrative: boolean; reviewed_by: string | null;
    horizon_year: number; index: number; label: string }[];
}

export interface Tipping {
  current_role: { role_id: string; title: string; declining_at: number | null; declining_below: boolean; label_now: string } | null;
  overtakes: { role_id: string; title: string; overtakes_role_id: string; overtakes_title: string; at: number; direction: "above" | "below" }[];
  range: [number, number]; step: number;
}

export interface Pathway {
  role_id: string; fit: number; readiness: number; total_hours: number; hours_left: number; summary: string; summary_mode: string;
  steps: { step: number; skills: { skill_id: string; name: string }[]; course: Course; why: string; why_key?: string; done: boolean }[];
  summary_template?: { key: string; vars: Record<string, unknown> };
  grounding: { sentences: number; supported: number; unsupported: number[]; all_supported: boolean } | null;
  uncovered_skills: string[];
}

// The hosted API can sleep when idle (Render's free plan) and take up to a minute to wake. While it does,
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

// A login that expired (or was revoked) gets a 401: sign out and tell the shell, but keep the
// profile ID in this browser so nothing is lost.
type ExpiredListener = () => void;
const expiredListeners = new Set<ExpiredListener>();
export function onAuthExpired(listener: ExpiredListener) {
  expiredListeners.add(listener);
  return () => { expiredListeners.delete(listener); };
}

function withToken(init: RequestInit | undefined, token: string | null): RequestInit | undefined {
  if (!token) return init;
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return { ...init, headers };
}

async function fetchAwake(url: string, original?: RequestInit): Promise<Response> {
  const started = Date.now();
  let token = await freshToken();
  let init = withToken(original, token);
  let refreshed = false;
  for (let attempt = 0; ; attempt++) {
    try {
      let response = await fetch(url, init);
      if (response.status === 401 && token && !refreshed) {
        // Refused login: refresh once and retry before deciding the session is really over.
        refreshed = true;
        token = await refreshToken().catch(() => null);
        if (token) { init = withToken(original, token); response = await fetch(url, init); }
      }
      if (response.status === 401 && refreshed) {
        await signOut();
        expiredListeners.forEach((l) => l());
      }
      // The API's own errors are JSON (e.g. 503 "proof checks are unavailable"); a sleeping host
      // answers with an HTML page. Only the latter means "wait and retry".
      const ownError = (response.headers.get("content-type") ?? "").includes("application/json");
      if (!WAKE_STATUSES.has(response.status) || ownError || Date.now() - started > WAKE_LIMIT_MS) {
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

// Like request(), but an error carries the server's own message (e.g. "try again tomorrow").
async function requestDetail<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchAwake(`${BASE}/api${path}`, { headers: { "Content-Type": "application/json" }, ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : `Something went wrong (${response.status})`);
  return body as T;
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
  me: () => request<{ user_id: string; profile_id: string | null }>("/me"),
  claim: async (profileId: string, replace = false) => {
    const response = await fetchAwake(`${BASE}/api/me/claim`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile_id: profileId, replace }),
    });
    const body = await response.json();
    if (response.status === 409) return { conflict: body.detail.existing_profile_id as string };
    if (!response.ok) throw new Error(`${response.status}`);
    return { profile_id: body.profile_id as string };
  },
  health: () => request<{ status: string; llm_model: string; snapshot_imported: string; voice?: boolean }>("/health"),
  skills: () => request<Skill[]>("/skills"),
  sdgs: () => request<Sdg[]>("/sdgs"),
  roles: () => request<RoleOption[]>("/roles"),
  role: (id: string) => request<RoleInfo>(`/roles/${encodeURIComponent(id)}`),
  snapshots: () => request<Snapshot[]>("/signals"),
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
  matches: (id: string, scenario: Scenario, year?: number, adoption?: number, extra: string[] = []) =>
    request<Matches>(`/profiles/${id}/matches?scenario=${scenario}${year ? `&year=${year}` : ""}${adoption !== undefined ? `&adoption=${adoption}` : ""}${extra.length ? `&extra=${encodeURIComponent(extra.join(","))}` : ""}`),
  tipping: (id: string, year?: number) => request<Tipping>(`/profiles/${id}/tipping${year ? `?year=${year}` : ""}`),
  complete: (id: string, courseId: string, done: boolean) =>
    request<Profile>(`/profiles/${id}/complete`, { method: "POST", body: JSON.stringify({ course_id: courseId, done }) }),
  turn: (messages: { role: "user" | "assistant"; content: string }[], language = "en") =>
    request<ChatTurn>("/intake/turn", { method: "POST", body: JSON.stringify({ messages, language }) }),
  preview: (text: string) =>
    requestDetail<SendPreview>("/intake/preview", { method: "POST", body: JSON.stringify({ text }) }),
  previewUpload: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const response = await fetchAwake(`${BASE}/api/intake/upload/preview`, { method: "POST", body: form });
    const body = await response.json();
    if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Upload failed");
    return body as SendPreview;
  },
  transcribe: async (audio: Blob, language: string) => {
    const form = new FormData();
    form.append("audio", audio, audio.type.includes("mp4") ? "speech.mp4" : audio.type.includes("ogg") ? "speech.ogg" : "speech.webm");
    const response = await fetchAwake(`${BASE}/api/voice/transcribe?language=${language}`, { method: "POST", body: form });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Voice input failed");
    return body as { text: string };
  },
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
  classSample: async () => (await fetchAwake(`${BASE}/api/class/sample`)).text(),
  classAnalyse: async (csv: string, scenario: Scenario) => {
    const response = await fetchAwake(`${BASE}/api/class/analyse`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv, scenario }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Couldn't read that file");
    return body as ClassResult;
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
  evidenceStart: (token: string, mode: "roles" | "emerging" = "roles") =>
    request<EvidenceStatus>(`/evidence/refresh?mode=${mode}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": token } }),
  evidenceStop: (token: string) =>
    request<EvidenceStatus>("/evidence/refresh/stop", { method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": token } }),
  evidenceStatus: (token: string) =>
    request<EvidenceStatus>("/evidence/refresh", { headers: { "Content-Type": "application/json", "X-Admin-Token": token } }),
  evidencePending: (token: string) =>
    request<EvidencePending[]>("/evidence/pending", { headers: { "Content-Type": "application/json", "X-Admin-Token": token } }),
  emergingPending: (token: string) =>
    request<EmergingPending[]>("/evidence/pending?kind=emerging", { headers: { "Content-Type": "application/json", "X-Admin-Token": token } }),
  dayPending: (token: string) =>
    request<DayPending[]>("/evidence/pending?kind=day", { headers: { "Content-Type": "application/json", "X-Admin-Token": token } }),
  dayDetail: (token: string, id: string) =>
    request<DayDetail>(`/evidence/pending/${encodeURIComponent(id)}`, { headers: { "Content-Type": "application/json", "X-Admin-Token": token } }),
  emergingDetail: (token: string, id: string) =>
    request<EmergingDetail>(`/evidence/pending/${encodeURIComponent(id)}`, { headers: { "Content-Type": "application/json", "X-Admin-Token": token } }),
  emerging: (profileId?: string) =>
    request<{ label: string; roles: EmergingCard[] }>(`/emerging${profileId ? `?profile_id=${encodeURIComponent(profileId)}` : ""}`),
  emergingSearch: (capabilityId: string, profileId: string) =>
    requestDetail<{ reviewed: false; searched: string; sources: EmergingSource[] }>(`/emerging/${encodeURIComponent(capabilityId)}/search`, {
      method: "POST", body: JSON.stringify({ profile_id: profileId }) }),
  openings: (roleId: string, profileId: string) =>
    requestDetail<{ reviewed: false; searched: string; sources: EmergingSource[] }>(`/roles/${encodeURIComponent(roleId)}/openings`, {
      method: "POST", body: JSON.stringify({ profile_id: profileId }) }),
  evidenceDetail: (token: string, id: string) =>
    request<EvidenceDetail>(`/evidence/pending/${encodeURIComponent(id)}`, { headers: { "Content-Type": "application/json", "X-Admin-Token": token } }),
  evidenceDecide: (token: string, id: string, decision: "approve" | "reject", body: { reviewer: string; reason?: string; drop_sources?: string[]; drop_added?: string[] }) =>
    request<{ id: string; role_id: string; added?: string[] }>(`/evidence/pending/${encodeURIComponent(id)}/${decision}`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": token }, body: JSON.stringify(body),
    }),
  day: (roleId: string) => request<DayInJob>(`/roles/${encodeURIComponent(roleId)}/day`),
  aiAssisted: (profileId: string) => request<AiAssisted>(`/profiles/${encodeURIComponent(profileId)}/ai-assisted`),
  history: (roleId: string, scenario: Scenario) =>
    request<RoleHistory>(`/roles/${encodeURIComponent(roleId)}/history?scenario=${scenario}`),
  programmes: () => request<Programme[]>("/programmes"),
  translations: () => request<Record<string, { ms: string; zh: string }>>("/translations"),
  tasks: (roleId: string, done: string[] = []) =>
    request<RoleTasks>(`/roles/${encodeURIComponent(roleId)}/tasks${done.length ? `?done=${encodeURIComponent(done.join(","))}` : ""}`),
  updateProfile: (p: Profile) =>
    request<Profile>(`/profiles/${p.id}`, { method: "PUT", body: JSON.stringify({
      display_name: p.display_name, current_role_id: p.current_role_id, skills: p.skills,
      experience_years: p.experience_years, audience: p.audience ?? null }) }),
  roleCase: (id: string, roleId: string) => request<RoleCase>(`/profiles/${id}/roles/${encodeURIComponent(roleId)}/case`),
  coach: (profileId: string, question: string, scenario: Scenario, roleId?: string) =>
    request<CoachReply>("/coach", { method: "POST", body: JSON.stringify({ profile_id: profileId, question, scenario, role_id: roleId ?? null }) }),
  createCard: (id: string, roleId: string) =>
    request<{ card_id: string }>(`/profiles/${id}/cards`, { method: "POST", body: JSON.stringify({ role_id: roleId }) }),
  card: (cardId: string) => request<FutureCard>(`/cards/${encodeURIComponent(cardId)}`),
  tree: (id: string, role: string) => request<SkillTree>(`/profiles/${id}/tree?role=${encodeURIComponent(role)}`),
  startCheck: (id: string, skillId: string, language: string) =>
    requestDetail<CheckStart>(`/profiles/${id}/skills/${encodeURIComponent(skillId)}/checks`, {
      method: "POST", body: JSON.stringify({ language }) }),
  submitCheck: (checkId: string, profileId: string, answers: number[]) =>
    requestDetail<CheckResult>(`/checks/${encodeURIComponent(checkId)}`, {
      method: "POST", body: JSON.stringify({ profile_id: profileId, answers }) }),
  survey: (id: string) => request<{ cards: SurveyCard[]; dimensions: WorkDimension[] }>(`/profiles/${id}/survey`),
  surveyBank: () => request<{ cards: SurveyCard[]; dimensions: WorkDimension[] }>("/survey/bank"),
  interpret: (text: string, language: string) =>
    request<{ dims: Record<string, number>; reading: string | null }>("/survey/interpret", {
      method: "POST", body: JSON.stringify({ text, language }) }),
  submitSurvey: (id: string, answers: SurveyAnswer[], language: string) =>
    request<SurveyResult>(`/profiles/${id}/survey`, { method: "POST", body: JSON.stringify({ answers, language }) }),
  xray: (roleId: string, scenario: Scenario, year?: number, adoption?: number) =>
    request<Xray>(`/roles/${encodeURIComponent(roleId)}/xray?scenario=${scenario}${year ? `&year=${year}` : ""}${adoption ? `&adoption=${adoption}` : ""}`),
  pathway: (id: string, role: string) => request<Pathway>(`/profiles/${id}/pathway?role=${encodeURIComponent(role)}`),
};

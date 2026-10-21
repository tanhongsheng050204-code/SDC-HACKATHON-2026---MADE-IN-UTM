// Browser storage can throw (private mode, blocked site data), so every access goes through here.
// Only small conveniences live in the browser; profiles are on the server.

export const KEYS = {
  profile: "laluan.profileId",
  lite: "laluan.lite",
  theme: "laluan.theme",
  sliderTip: "laluan.sliderTipSeen",
  rolesView: "laluan.rolesView",  // "list" or "graph" on Future roles
  tasksDone: "laluan.tasksDone",
  adminToken: "laluan.adminToken",
  reviewer: "laluan.reviewer",
  nameSkipped: "laluan.nameSkipped.",
  storyCard: "laluan.storyCard.",
  goals: "laluan.goals.",
  assistant: "laluan.assistant.",  // + profile id, session only: the Ask Laluan thread
  assistantVoice: "laluan.assistantVoice",  // "1" reads answers aloud  // + profile id: SDGs picked during onboarding, kept on this device only  // + profile, role and progress: the card made for the Today banner  // + user id, session only: "Skip" holds until the next login
} as const;

type Area = "local" | "session";
const area = (a: Area) => (a === "session" ? window.sessionStorage : window.localStorage);

export function load(key: string, a: Area = "local"): string | null {
  try { return area(a).getItem(key); } catch { return null; }
}

export function save(key: string, value: string | null, a: Area = "local") {
  try {
    if (value === null) area(a).removeItem(key);
    else area(a).setItem(key, value);
  } catch { /* private mode */ }
}

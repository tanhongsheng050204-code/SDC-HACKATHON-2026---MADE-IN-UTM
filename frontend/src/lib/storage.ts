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
  onboardingCounted: "laluan.onboardingCounted",  // session only: the anonymous onboarding_started count was sent
  installDismissed: "laluan.installDismissed",  // "Not now" on the Install Laluan card
  joinCode: "laluan.joinCode",  // session only: a class code from a ?join= link, used once on My profile
  replanSeen: "laluan.replanSeen.",  // + profile id: the forecast whose re-ranking "Got it" dismissed
  forecastSeen: "laluan.forecastSeen.",  // + profile id: the forecast whose changes "Got it" dismissed
  loginPending: "laluan.loginPending",  // session only: set before Google, read once on the way back  // + user id, session only: "Skip" holds until the next login
  coach: "laluan.coach.",  // + profile/role id, session only: the conversation survives closing the drawer
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

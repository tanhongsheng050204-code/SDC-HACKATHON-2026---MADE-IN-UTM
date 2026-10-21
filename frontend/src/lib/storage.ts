// Browser storage can throw (private mode, blocked site data), so every access goes through here.
// Only small conveniences live in the browser; profiles are on the server.

export const KEYS = {
  profile: "laluan.profileId",
  lite: "laluan.lite",
  theme: "laluan.theme",
  sliderTip: "laluan.sliderTipSeen",
  tasksDone: "laluan.tasksDone",
  adminToken: "laluan.adminToken",
  reviewer: "laluan.reviewer",
  nameAsked: "laluan.nameAsked.",  // + user id: asked once per account on this browser
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

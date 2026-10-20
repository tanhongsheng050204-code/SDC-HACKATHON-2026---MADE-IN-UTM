// The screen, scenario and year live in the query string (app flow: "Browser back works on every
// screen", "?scenario=accelerated&year=2032"). No router library: a handful of screens doesn't need one.
import type { Scenario } from "./api";

export type Screen =
  | "landing" | "home" | "intake" | "review" | "radar" | "tasks"
  | "roles" | "role" | "impact" | "tree" | "survey" | "sources" | "workforce" | "review-kit";

const SCREENS: Screen[] = ["landing", "home", "intake", "review", "radar", "tasks", "roles", "role", "impact", "tree", "survey", "sources", "workforce", "review-kit"];
const SCENARIO_IDS: Scenario[] = ["slow", "baseline", "accelerated"];

export interface Route { screen: Screen; scenario: Scenario; year?: number; role?: string; adoption?: number }

export function readRoute(search = window.location.search): Route {
  const p = new URLSearchParams(search);
  const view = p.get("view") as Screen | null;
  const scenario = p.get("scenario") as Scenario | null;
  const year = Number(p.get("year"));
  const adoption = Number(p.get("adoption"));
  return {
    screen: view && SCREENS.includes(view) ? view : "landing",
    scenario: scenario && SCENARIO_IDS.includes(scenario) ? scenario : "baseline",
    year: Number.isInteger(year) && year > 2000 ? year : undefined,
    role: p.get("role") ?? undefined,
    adoption: adoption >= 0.5 && adoption <= 2 ? adoption : undefined,
  };
}

export function routeUrl(r: Route): string {
  if (r.screen === "landing") return window.location.pathname;
  const p = new URLSearchParams({ view: r.screen });
  if (r.scenario !== "baseline") p.set("scenario", r.scenario);
  if (r.year) p.set("year", String(r.year));
  if (r.adoption !== undefined && r.screen === "roles") p.set("adoption", String(r.adoption));
  if (r.role && (r.screen === "role" || r.screen === "impact" || r.screen === "tree")) p.set("role", r.role);
  return `${window.location.pathname}?${p}`;
}

export function writeRoute(r: Route, mode: "push" | "replace") {
  const url = routeUrl(r);
  if (url === window.location.pathname + window.location.search) return;
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

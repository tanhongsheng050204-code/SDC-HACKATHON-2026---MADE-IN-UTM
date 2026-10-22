// Automated accessibility checks (axe-core) on the main screens, run in CI with the other tests.
// jsdom cannot measure colour contrast, so that rule is checked by hand (MANUAL_TEST_PLAN 21.4);
// everything else axe can see that is serious or critical fails the build.
import { render } from "@testing-library/react";
import axe from "axe-core";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { LoginDialog } from "./components/AccountButton";
import { ApplicationTracker } from "./components/ApplicationTracker";
import { Intake } from "./screens/Intake";
import { Landing } from "./screens/landing/Landing";
import { Legal } from "./screens/Legal";
import { Workforce } from "./screens/Workforce";

// Every API call answers with an empty result, so screens render their first state offline.
vi.mock("./lib/api", async (orig) => {
  const real = await orig<typeof import("./lib/api")>();
  const empty = new Proxy({}, { get: () => async () => [] });
  return { ...real, api: empty };
});

// jsdom has no matchMedia or IntersectionObserver; the landing page's animations ask for both.
window.matchMedia ??= ((query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {},
  addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })) as typeof window.matchMedia;
globalThis.IntersectionObserver ??= class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } root = null;
  rootMargin = ""; thresholds = []; } as unknown as typeof IntersectionObserver;
// Nor SVG geometry, which the walking girl on the route uses.
Object.assign(SVGElement.prototype, { getTotalLength: () => 1000, getPointAtLength: () => ({ x: 0, y: 0 }) });

async function violations(ui: ReactElement) {
  const { container } = render(<main>{ui}</main>);
  await new Promise((r) => setTimeout(r, 50));
  const result = await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
  return result.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
}

const noop = () => {};

describe("accessibility (axe)", () => {
  it("landing page", async () => {
    expect(await violations(<Landing nav={null} banners={null} model={null} prefs={null} onStart={noop} onDemo={noop} onHr={noop}
      onSources={noop} onReviewKit={noop} />)).toEqual([]);
  });
  it("onboarding, first question", async () => {
    expect(await violations(<Intake audience={null} onAudience={noop} onDone={noop} />)).toEqual([]);
  });
  it("login dialog", async () => {
    expect(await violations(<LoginDialog onClose={noop} />)).toEqual([]);
  });
  it("privacy notice and terms", async () => {
    expect(await violations(<Legal doc="privacy" />)).toEqual([]);
    expect(await violations(<Legal doc="terms" />)).toEqual([]);
  });
  it("HR teams and career centres", async () => {
    expect(await violations(<Workforce />)).toEqual([]);
  });
  it("application tracker", async () => {
    expect(await violations(<ApplicationTracker profileId="p1" roleId="data_analyst" />)).toEqual([]);
  });
});

import type { Journey, JourneyStep } from "../lib/api";
import { StringKey, t, tf, tr } from "../lib/i18n";
import type { Screen } from "../lib/route";

const STEPS: JourneyStep[] = ["stand", "explore", "build", "apply"];
// Where each step's button goes, and the screens that are part of the journey (the bar shows only on those).
const GOES_TO: Record<JourneyStep | "done", Screen> = { stand: "profile", explore: "roles", build: "tree", apply: "role", done: "roles" };
const HOME_OF: Partial<Record<Screen, JourneyStep>> = {
  intake: "stand", profile: "stand", review: "stand", survey: "stand", tasks: "stand", radar: "stand",
  roles: "explore", role: "explore", tree: "build", impact: "build",
};

// The thread through the app: at the foot of every journey screen, which step this is and the
// one thing to do next, with a button. It reads the same journey as Today and the sidebar.
export function JourneyNext({ journey, screen, targetTitle, onStep }: {
  journey: Journey; screen: Screen; targetTitle: string | null; onStep: (s: JourneyStep | "done") => void;
}) {
  const here = HOME_OF[screen];
  if (!here) return null;
  const next = journey.next;
  const at = STEPS.indexOf(next ?? "apply") + 1;
  const key = (next ?? "done") as JourneyStep | "done";
  const text = next ? tf(`jn.${key}` as StringKey, { role: targetTitle ? tr(targetTitle) : "" }) : t("jn.done");
  return (
    <aside className="journey-next" aria-label={t("step.title")}>
      <ol className="jn-dots" aria-hidden="true">
        {journey.steps.map((s) => <li key={s.id} className={s.done ? "done" : s.id === next ? "now" : ""} />)}
      </ol>
      <div className="jn-text">
        <small>{next ? tf("jn.stepOf", { n: at, name: t(`step.${next}` as StringKey) }) : t("jn.allDone")}</small>
        <strong>{text}</strong>
      </div>
      {GOES_TO[key] !== screen && <button className="btn ink sm" onClick={() => onStep(key)}>{t(`jn.go.${key}` as StringKey)} →</button>}
    </aside>
  );
}

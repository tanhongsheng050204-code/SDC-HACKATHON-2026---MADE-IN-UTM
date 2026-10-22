import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { EvidencePanel } from "../components/EvidencePanel";
import { FeedbackPanel } from "../components/FeedbackPanel";
import { CounsellorPanel } from "../components/CounsellorPanel";
import { RefreshPanel } from "../components/RefreshPanel";

// The human check on new data, in one place: trend refreshes, skill evidence from job ads,
// emerging roles and "a day in this job" drafts. Every panel asks for the admin token; nothing
// reaches users until a named person approves it. Internal tool, so English only.
export function Admin() {
  const [done, setDone] = useState<string | null>(null);
  const approved = async () => { setDone("Approved. Users see the change on their next page load."); };
  // Before a demo or judging: the trend layer should show a recent date.
  const [age, setAge] = useState<{ days: number; id: string } | null>(null);
  useEffect(() => {
    api.health().then((h) => {
      const days = Math.floor((Date.now() - new Date(h.snapshot_imported).getTime()) / 86_400_000);
      setAge({ days, id: h.snapshot });
    }).catch(() => setAge(null));
  }, [done]);
  return (
    <section>
      <div className="page-head">
        <h1>Admin: review new data</h1>
        <p className="muted">Refreshes and AI-drafted evidence wait here for a person. Approve with your name, or reject with a reason; both are kept, and the Sources page shows who approved each forecast.</p>
      </div>
      {done && <div className="banner info" role="status">{done}</div>}
      {age && age.days > 14 && (
        <div className="banner warning" role="status">The forecast in use ({age.id}) is {age.days} days old. Run Refresh trend data and approve it before a demo, so the Radar and rankings show a recent date.</div>
      )}
      <RefreshPanel onDone={approved} />
      <EvidencePanel onDone={approved} />
      <FeedbackPanel />
      <CounsellorPanel />
    </section>
  );
}

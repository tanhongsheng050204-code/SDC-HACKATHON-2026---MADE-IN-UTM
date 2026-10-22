import type { StringKey } from "../lib/i18n";

// The only things a counsellor sees about a student who joined their class (backend
// app/services/classes.py SHARED). Shown to the student before they join.
export const SHARED_LABELS: Record<string, StringKey> = {
  display_name: "cls.f.display_name", destination: "cls.f.destination", readiness: "cls.f.readiness",
  courses_finished: "cls.f.courses_finished", skills_proven: "cls.f.skills_proven", last_active: "cls.f.last_active",
  target_date: "cls.f.target_date", status: "cls.f.status",
};

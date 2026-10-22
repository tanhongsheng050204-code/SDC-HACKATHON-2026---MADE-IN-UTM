// A study calendar for a pathway: each unfinished course becomes weekly study sessions, one course
// after another, as an .ics file the person imports into Google, Outlook or Apple Calendar. Built in
// the browser, so nothing about the plan is sent anywhere.

export interface StudyPlanInput {
  courses: { id: string; title: string; provider: string; url: string; hours: number }[];
  days: number[];          // 0 = Sunday … 6 = Saturday
  sessionHours: number;    // length of one session
  startTime: string;       // "HH:MM", local time
  from: Date;              // the first session is on or after the day after this
  roleTitle: string;
}

export interface Session { courseId: string; start: Date; end: Date }

/** Every session, in order. A course takes as many sessions as its hours need. */
export function sessions(input: StudyPlanInput): Session[] {
  const [hh, mm] = input.startTime.split(":").map(Number);
  const days = [...new Set(input.days)].sort();
  if (!days.length || input.sessionHours <= 0) return [];
  const out: Session[] = [];
  const day = new Date(input.from.getFullYear(), input.from.getMonth(), input.from.getDate() + 1);
  for (const course of input.courses) {
    let needed = Math.max(1, Math.ceil(course.hours / input.sessionHours));
    while (needed > 0) {
      if (days.includes(day.getDay())) {
        const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh, mm);
        out.push({ courseId: course.id, start, end: new Date(start.getTime() + input.sessionHours * 3_600_000) });
        needed -= 1;
      }
      day.setDate(day.getDate() + 1);
    }
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");
// Floating local time (no time zone), so the calendar shows it at the person's own clock time.
const local = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escape = (text: string) => text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// RFC 5545: lines longer than 75 octets are folded onto continuation lines that start with a space.
function fold(line: string): string {
  const bytes = new TextEncoder();
  if (bytes.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  for (const ch of line) {
    if (bytes.encode(current + ch).length > (parts.length ? 74 : 75)) { parts.push(current); current = ""; }
    current += ch;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** The .ics text: one event per session, titled with the course and numbered "session 3 of 10". */
export function icsFile(input: StudyPlanInput, words: { count: (i: number, n: number) => string; goal: string }): string {
  const all = sessions(input);
  const stamp = utc(new Date());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Laluan//Study plan//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const course of input.courses) {
    const own = all.filter((s) => s.courseId === course.id);
    own.forEach((s, i) => {
      lines.push("BEGIN:VEVENT",
        `UID:${course.id}-${local(s.start)}@laluan`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${local(s.start)}`,
        `DTEND:${local(s.end)}`,
        `SUMMARY:${escape(`${course.title} (${words.count(i + 1, own.length)})`)}`,
        `DESCRIPTION:${escape(`${course.provider}\n${course.url}\n${words.goal}: ${input.roleTitle}`)}`,
        ...(course.url ? [`URL:${course.url}`] : []),
        "END:VEVENT");
    });
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** One meeting as an .ics file: a counsellor check-in. Built in the browser; nothing is sent. */
export function meetingIcs(title: string, start: Date, minutes: number, description: string): string {
  const end = new Date(start.getTime() + minutes * 60_000);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Laluan//Check-in//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT", `UID:checkin-${local(start)}-${Math.random().toString(36).slice(2, 8)}@laluan`, `DTSTAMP:${utc(new Date())}`,
    `DTSTART:${local(start)}`, `DTEND:${local(end)}`, `SUMMARY:${escape(title)}`, `DESCRIPTION:${escape(description)}`,
    "END:VEVENT", "END:VCALENDAR"];
  return lines.map(fold).join("\r\n") + "\r\n";
}

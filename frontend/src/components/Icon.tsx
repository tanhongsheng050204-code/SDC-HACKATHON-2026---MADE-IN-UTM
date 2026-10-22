// Line icons drawn on a 24 px grid, one path each, so we don't ship an icon library.
export type IconName =
  | "user" | "users" | "radar" | "briefcase" | "route" | "globe" | "trash"
  | "sun" | "moon" | "upload" | "list" | "chat" | "book" | "home" | "mic" | "target"
  | "go-straight" | "turn-left" | "turn-right" | "flag" | "check"
  | "arrowLeft" | "arrowRight" | "mapPin" | "arrowUp" | "download" | "settings" | "mail";

const ICONS: Record<IconName, string> = {
  chat: "M4 5h16v11H9l-5 4z",
  mail: "M4 6h16v12H4zM4 7l8 6 8-6",
  list: "M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0",
  radar: "M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 12l6-6",
  briefcase: "M4 8h16v11H4zM9 8V5h6v3M4 13h16",
  route: "M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  trash: "M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13",
  download: "M12 4v12M7 11l5 5 5-5M5 20h14",
  settings: "M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 20a6 6 0 0 0-3-5.2",
  upload: "M12 16V4M7 9l5-5 5 5M5 20h14",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5",
  moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z",
  home: "M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-5h4v5",
  mic: "M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zM6 11a6 6 0 0 0 12 0M12 17v4M9 21h6",
  book: "M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h9",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z",
  "go-straight": "M12 20V5M7 10l5-5 5 5",
  "turn-left": "M17 20v-7a4 4 0 0 0-4-4H6M10 5 6 9l4 4",
  "turn-right": "M7 20v-7a4 4 0 1 1 4-4h7M14 5l4 4-4 4",
  check: "M5 12.5l4.5 4.5L19 7.5",
  flag: "M6 21V4M6 4h11l-2 4 2 4H6",
  arrowLeft: "M19 12H5M12 5l-7 7 7 7",
  arrowRight: "M5 12h14M12 19l7-7-7-7",
  mapPin: "M12 22C7 17 5 14 5 10a7 7 0 0 1 14 0c0 4-2 7-7 12zM12 10.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z",
  arrowUp: "M12 19V5M5 12l7-7 7 7",
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={ICONS[name]} />
    </svg>
  );
}

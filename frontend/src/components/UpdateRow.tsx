import { useState, type ReactNode } from "react";
import { Sheet } from "./Sheet";

// One line in Today's Updates list: an icon, what changed, one action. The full card opens in a
// side panel, so Today stays short and nothing is lost.
export function UpdateRow({ icon, text, action, tone = "", title, onClick, children }: {
  icon: string; text: ReactNode; action: string; tone?: "" | "warn" | "good"; title?: ReactNode;
  onClick?: () => void; children?: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={`update-row ${tone}`} onClick={() => (onClick ? onClick() : setOpen(true))}>
        <span className="update-icon" aria-hidden="true">{icon}</span>
        <span className="update-text">{text}</span>
        <span className="update-go">{action}</span>
      </button>
      {open && children && <Sheet title={title ?? text} onClose={() => setOpen(false)}>{children(() => setOpen(false))}</Sheet>}
    </>
  );
}

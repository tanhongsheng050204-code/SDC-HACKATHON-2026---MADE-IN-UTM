import { useState } from "react";
import QRCode from "qrcode";
import { api, Profile } from "../lib/api";
import { t } from "../lib/i18n";

export function ShareCard({ profile, roleId }: { profile: Profile; roleId: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    try {
      const { card_id } = await api.createCard(profile.id, roleId);
      const url = `${window.location.origin}${window.location.pathname}?card=${card_id}`;
      setLink(url);
      setQr(await QRCode.toDataURL(url, { margin: 1, width: 220, errorCorrectionLevel: "M" }));
    } catch { setError("Couldn't create the card. Try again."); }
  }
  async function copy() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); }
  }

  return (
    <div className="card share-card">
      <h3>Future Card</h3>
      <p className="muted">A read-only summary of this plan you can show a counsellor, employer or family. It shows {profile.display_name ? `your name, ${profile.display_name},` : "no name"} the role, your readiness and the plan in brief, never your full skill list. It stops working when you delete your profile.</p>
      {!link ? <button className="primary" onClick={create}>{t("a.card")}</button> : (
        <div className="share-row">
          {qr && <img src={qr} width={160} height={160} alt="QR code that opens your Future Card" />}
          <div className="share-actions">
            <a href={link} target="_blank" rel="noreferrer">Open the card ↗</a>
            <button onClick={copy}>{copied ? "Link copied" : "Copy link"}</button>
            <code className="share-link">{link}</code>
          </div>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

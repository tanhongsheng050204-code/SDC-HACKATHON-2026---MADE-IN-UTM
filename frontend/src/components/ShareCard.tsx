import { useState } from "react";
import QRCode from "qrcode";
import { api, Profile } from "../lib/api";
import { t, tf } from "../lib/i18n";

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
    } catch { setError(t("share.failed")); }
  }
  async function copy() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); }
  }

  return (
    <div className="card share-card">
      <h3>{t("share.title")}</h3>
      <p className="muted">{profile.display_name ? tf("share.bodyName", { name: profile.display_name }) : t("share.bodyNoName")}</p>
      {!link ? <button className="primary" onClick={create}>{t("a.card")}</button> : (
        <div className="share-row">
          {qr && <img src={qr} width={160} height={160} alt={t("share.qr")} />}
          <div className="share-actions">
            <a href={link} target="_blank" rel="noreferrer">{t("share.open")} ↗</a>
            <button onClick={copy}>{copied ? t("share.copied") : t("share.copy")}</button>
            <code className="share-link">{link}</code>
          </div>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

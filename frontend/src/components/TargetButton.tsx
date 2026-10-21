import { useState } from "react";
import { api, Profile } from "../lib/api";
import { t } from "../lib/i18n";
import { Icon } from "./Icon";

// The destination is the role the journey's later steps (Pathway, practice, sharing) follow.
export function TargetButton({ profile, roleId, onProfile }: {
  profile: Profile; roleId: string; onProfile: (p: Profile) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const isTarget = profile.target_role_id === roleId;

  async function choose(next: string | null) {
    setBusy(true); setFailed(false);
    try { onProfile(await api.setTarget(profile.id, next)); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  }

  return (
    <span className="target-button">
      {isTarget ? (
        <>
          <span className="badge good"><Icon name="target" />{t("target.yours")}</span>
          <button className="link" disabled={busy} onClick={() => choose(null)}>{t("target.clear")}</button>
        </>
      ) : (
        <button className="btn ink" disabled={busy} onClick={() => choose(roleId)}>
          <Icon name="target" />{profile.target_role_id ? t("target.switch") : t("target.make")}
        </button>
      )}
      {failed && <span className="error" role="alert">{t("target.failed")}</span>}
    </span>
  );
}

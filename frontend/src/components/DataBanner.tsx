import { monthsOld } from "../lib/format";
import { t } from "../lib/i18n";

// Yellow banner for forecast data the person should not take at face value: illustrative seed
// figures, or a snapshot more than a year old (app flow, "Empty and blocked states").
export function DataBanner({ illustrative, imported }: { illustrative: boolean; imported: string }) {
  const age = monthsOld(imported);
  if (illustrative) return <div className="banner warning">{t("banner.illustrative")}</div>;
  if (age > 12) return <div className="banner warning">{t("banner.stale").replace("{n}", String(age))}</div>;
  return null;
}

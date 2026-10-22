import { useEffect, useState } from "react";
import { LogoMark } from "../components/Brand";
import { api } from "../lib/api";
import { t, tf, type StringKey } from "../lib/i18n";

// The privacy notice and terms of use (/?legal=privacy | terms). Written from what the app really
// does, following the PDPA 2010 principles; the "what we keep" parts reuse the Your data panel's
// text so the two can never disagree. A draft for the team to review, not legal advice.
export type LegalDoc = "privacy" | "terms";

const PRIVACY: { h: StringKey; p: StringKey }[] = [
  { h: "legal.whoH", p: "legal.whoP" },
  { h: "priv.saved", p: "priv.savedText" },
  { h: "priv.never", p: "priv.neverText" },
  { h: "legal.whyH", p: "legal.whyP" },
  { h: "legal.consentH", p: "legal.consentP" },
  { h: "priv.ai", p: "priv.aiText" },
  { h: "priv.who", p: "priv.whoText" },
  { h: "legal.discloseH", p: "legal.discloseP" },
  { h: "legal.keepH", p: "legal.keepP" },
  { h: "legal.securityH", p: "legal.securityP" },
  { h: "priv.rights", p: "priv.rightsText" },
  { h: "legal.correctH", p: "legal.correctP" },
  { h: "priv.delete", p: "priv.deleteText" },
  { h: "legal.youngH", p: "legal.youngP" },
  { h: "legal.changesH", p: "legal.changesP" },
];

const TERMS: { h: StringKey; p: StringKey }[] = [
  { h: "terms.whatH", p: "terms.whatP" },
  { h: "terms.adviceH", p: "terms.adviceP" },
  { h: "terms.useH", p: "terms.useP" },
  { h: "terms.contentH", p: "terms.contentP" },
  { h: "terms.linksH", p: "terms.linksP" },
  { h: "terms.serviceH", p: "terms.serviceP" },
  { h: "terms.liabilityH", p: "terms.liabilityP" },
  { h: "terms.lawH", p: "terms.lawP" },
];

export function legalHref(doc: LegalDoc) {
  return `${window.location.pathname}?legal=${doc}`;
}

export function LegalLinks() {
  return (
    <span className="legal-links">
      <a href={legalHref("privacy")}>{t("legal.privacyTitle")}</a> · <a href={legalHref("terms")}>{t("legal.termsTitle")}</a>
    </span>
  );
}

export function Legal({ doc }: { doc: LegalDoc }) {
  const [contact, setContact] = useState<string | null>(null);
  useEffect(() => { api.health().then((h) => setContact(h.contact ?? null)).catch(() => {}); }, []);
  useEffect(() => { document.title = `${t(doc === "privacy" ? "legal.privacyTitle" : "legal.termsTitle")} · Laluan`; }, [doc]);
  const sections = doc === "privacy" ? PRIVACY : TERMS;
  return (
    <div className="legal-page">
      <header className="legal-top">
        <a className="brand" href={window.location.pathname}><LogoMark size={26} /><span>Laluan</span></a>
        <a className="btn quiet" href={window.location.pathname}>{t("legal.back")}</a>
      </header>
      <main id="main" className="legal-body">
        <h1>{t(doc === "privacy" ? "legal.privacyTitle" : "legal.termsTitle")}</h1>
        <p className="legal-draft">{t("legal.draft")}</p>
        <p className="legal-intro">{t(doc === "privacy" ? "legal.privacyIntro" : "legal.termsIntro")}</p>
        {sections.map((s) => (
          <section key={s.h}>
            <h2>{t(s.h)}</h2>
            <p>{t(s.p)}</p>
          </section>
        ))}
        <section>
          <h2>{t("legal.contactH")}</h2>
          <p>{contact ? <>{tf("legal.contactP", { email: "" })}<a href={`mailto:${contact}`}>{contact}</a></> : t("legal.contactNone")}</p>
        </section>
        <p className="muted">
          {doc === "privacy"
            ? <a href={legalHref("terms")}>{t("legal.termsTitle")} →</a>
            : <a href={legalHref("privacy")}>{t("legal.privacyTitle")} →</a>}
        </p>
      </main>
    </div>
  );
}

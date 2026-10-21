import { useEffect, useState } from "react";
import { LoginToKeep } from "../components/AccountButton";
import { api, Profile, ScaleAnswer, SurveyAnswer, SurveyCard, SurveyResult } from "../lib/api";
import { getLang, t } from "../lib/i18n";
import { MicButton } from "../components/MicButton";

const textFor = (text: Record<string, string>) => text[getLang()] || text.en;
const SCALE: ScaleAnswer[] = ["strongly_disagree", "disagree", "neutral", "agree", "strongly_agree"];

// One card at a time, answered on a five-point scale, or in your own words ("Something else").
// Choosing fills the circle; Next moves on and Back lets the person change an earlier answer. At the end, the preferences your
// answers reveal and roles you might not have considered.
export function Survey({ profile, userId, onDone, onSkip }: {
  profile: Profile; userId: string | null; onDone: (p: Profile) => void; onSkip: () => void;
}) {
  const [cards, setCards] = useState<SurveyCard[] | null>(null);
  const [answers, setAnswers] = useState<(SurveyAnswer | undefined)[]>([]);  // by card position
  const [index, setIndex] = useState(0);
  const [other, setOther] = useState<string | null>(null);
  const [reading, setReading] = useState<{ dims: Record<string, number>; reading: string | null } | null>(null);
  const [result, setResult] = useState<SurveyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.survey(profile.id).then((s) => setCards(s.cards)).catch(() => setError(t("survey.loadFailed")));
  }, [profile.id]);

  const card = cards && index < cards.length ? cards[index] : null;
  const chosen = answers[index];

  async function submit(all: SurveyAnswer[]) {
    setBusy(true); setError(null);
    try { setResult(await api.submitSurvey(profile.id, all, getLang())); }
    catch { setError(t("survey.saveFailed")); }
    finally { setBusy(false); }
  }

  function answer(a: SurveyAnswer) {
    const next = [...answers];
    next[index] = a;
    setAnswers(next); setOther(null); setReading(null);
  }

  function go(step: 1 | -1) {
    setOther(null); setReading(null);
    const to = index + step;
    setIndex(to);
    if (cards && to === cards.length) submit(answers as SurveyAnswer[]);
  }

  async function checkOther() {
    if (!other?.trim()) return;
    setBusy(true);
    try { setReading(await api.interpret(other.trim(), getLang())); }
    catch { setReading({ dims: {}, reading: null }); }
    finally { setBusy(false); }
  }

  async function finish() {
    try { onDone(await api.getProfile(profile.id)); } catch { onSkip(); }
  }

  return (
    <section>
      <div className="page-head"><h1>{t("survey.title")}</h1><p className="muted">{t("survey.sub")}</p></div>
      <LoginToKeep userId={userId} isDemo={!!profile.is_demo} />
      {error && (
        <p className="error" role="alert">{error}
          {cards && index === cards.length && !result && <> <button className="link" disabled={busy} onClick={() => submit(answers as SurveyAnswer[])}>{t("survey.retry")}</button></>}
        </p>
      )}
      {!cards && !error && <p className="muted">{t("a.loading")}</p>}

      {card && cards && (
        <div className="card survey-card">
          <p className="muted">{index + 1} / {cards.length}</p>
          <p className="survey-text">{textFor(card.text)}</p>
          {other === null ? (
            <>
              <p className="muted likert-prompt" id="likert-prompt">{t("survey.scale")}</p>
              <div className="likert">
                <span className="likert-end disagree" aria-hidden="true">{t("survey.strongly_disagree")}</span>
                <div className="likert-dots" role="radiogroup" aria-labelledby="likert-prompt">
                  {SCALE.map((value) => (
                    <button key={value} className={`likert-dot ${value}${chosen?.answer === value ? " selected" : ""}`}
                      role="radio" aria-checked={chosen?.answer === value} aria-label={t(`survey.${value}`)} title={t(`survey.${value}`)}
                      onClick={() => answer({ card_id: card.id, answer: value })} />
                  ))}
                </div>
                <span className="likert-end agree" aria-hidden="true">{t("survey.strongly_agree")}</span>
              </div>
              {chosen?.answer === "other" && <p className="muted">{t("survey.yourWords")} “{chosen.note}”</p>}
              <button className="link" onClick={() => setOther(chosen?.answer === "other" ? chosen.note ?? "" : "")}>✎ {t("survey.other")}</button>
              <div className="survey-nav">
                <button className="btn quiet" disabled={index === 0} onClick={() => go(-1)}>← {t("survey.back")}</button>
                <button className="btn ink" disabled={!chosen} onClick={() => go(1)}>
                  {index + 1 === cards.length ? t("survey.finish") : `${t("survey.next")} →`}</button>
              </div>
            </>
          ) : (
            <div className="survey-other">
              <label>{t("survey.otherLabel")}
                <textarea rows={2} maxLength={300} value={other} onChange={(e) => { setOther(e.target.value); setReading(null); }} />
              </label>
              <MicButton onText={(text) => { setOther((o) => `${(o ?? "").trimEnd()} ${text}`.trim().slice(0, 300)); setReading(null); }} />
              {!reading && <button className="btn quiet" disabled={busy || !other.trim()} onClick={checkOther}>{t("survey.check")}</button>}
              <button className="link" onClick={() => { setOther(null); setReading(null); }}>{t("survey.cancel")}</button>
              {reading && reading.reading && (
                <div role="status">
                  <p>{t("survey.readAs")} <strong>{reading.reading}</strong>. {t("survey.right")}</p>
                  <div className="actions">
                    <button className="btn ink" onClick={() => answer({ card_id: card.id, answer: "other", note: other, dims: reading.dims })}>{t("survey.yes")}</button>
                    <button className="btn quiet" onClick={() => answer({ card_id: card.id, answer: "other", note: other })}>{t("survey.no")}</button>
                  </div>
                </div>
              )}
              {reading && !reading.reading && (
                <div role="status">
                  <p className="muted">{t("survey.noReading")}</p>
                  <button className="btn ink" onClick={() => answer({ card_id: card.id, answer: "other", note: other })}>{t("survey.useWords")}</button>
                </div>
              )}
            </div>
          )}
          <button className="link" onClick={onSkip}>{t("survey.skip")}</button>
        </div>
      )}

      {busy && !card && <p className="muted">{t("survey.saving")}</p>}
      {result && (
        <div className="card">
          <h2>{t("survey.found")}</h2>
          {result.summary.length ? <ul>{result.summary.map((s) => <li key={s}>{s}</li>)}</ul> : <p className="muted">{t("survey.nothing")}</p>}
          {result.also_like.length > 0 && (
            <>
              <h3>{t("survey.alsoLike")}</h3>
              <ul>{result.also_like.map((r) => <li key={r.role_id}>{r.title}</li>)}</ul>
            </>
          )}
          <button className="btn ink" onClick={finish}>{t("survey.seeRoles")}</button>
        </div>
      )}
    </section>
  );
}

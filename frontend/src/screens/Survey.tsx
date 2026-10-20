import { useEffect, useState } from "react";
import { LoginToKeep } from "../components/AccountButton";
import { api, Profile, SurveyAnswer, SurveyCard, SurveyResult } from "../lib/api";
import { getLang, t } from "../lib/i18n";

const textFor = (text: Record<string, string>) => text[getLang()] || text.en;

// One card at a time: Like, Dislike or Other (your own words). At the end, the preferences your
// answers reveal and roles you might not have considered.
export function Survey({ profile, userId, onDone, onSkip }: {
  profile: Profile; userId: string | null; onDone: (p: Profile) => void; onSkip: () => void;
}) {
  const [cards, setCards] = useState<SurveyCard[] | null>(null);
  const [answers, setAnswers] = useState<SurveyAnswer[]>([]);
  const [other, setOther] = useState<string | null>(null);
  const [reading, setReading] = useState<{ dims: Record<string, number>; reading: string | null } | null>(null);
  const [result, setResult] = useState<SurveyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.survey(profile.id).then((s) => setCards(s.cards)).catch(() => setError(t("survey.loadFailed")));
  }, [profile.id]);

  const card = cards && answers.length < cards.length ? cards[answers.length] : null;

  async function submit(all: SurveyAnswer[]) {
    setBusy(true); setError(null);
    try { setResult(await api.submitSurvey(profile.id, all, getLang())); }
    catch { setError(t("survey.saveFailed")); }
    finally { setBusy(false); }
  }

  async function answer(a: SurveyAnswer) {
    const next = [...answers, a];
    setAnswers(next); setOther(null); setReading(null);
    if (cards && next.length === cards.length) submit(next);
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
          {cards && answers.length === cards.length && !result && <> <button className="link" disabled={busy} onClick={() => submit(answers)}>{t("survey.retry")}</button></>}
        </p>
      )}
      {!cards && !error && <p className="muted">{t("a.loading")}</p>}

      {card && cards && (
        <div className="card survey-card">
          <p className="muted">{answers.length + 1} / {cards.length}</p>
          <p className="survey-text">{textFor(card.text)}</p>
          {other === null ? (
            <div className="actions">
              <button className="btn ink" onClick={() => answer({ card_id: card.id, answer: "like" })}>👍 {t("survey.like")}</button>
              <button className="btn quiet" onClick={() => answer({ card_id: card.id, answer: "dislike" })}>👎 {t("survey.dislike")}</button>
              <button className="btn quiet" onClick={() => setOther("")}>✎ {t("survey.other")}</button>
            </div>
          ) : (
            <div className="survey-other">
              <label>{t("survey.otherLabel")}
                <textarea rows={2} maxLength={300} value={other} onChange={(e) => { setOther(e.target.value); setReading(null); }} />
              </label>
              {!reading && <button className="btn quiet" disabled={busy || !other.trim()} onClick={checkOther}>{t("survey.check")}</button>}
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
                  <button className="btn ink" onClick={() => answer({ card_id: card.id, answer: "other", note: other })}>{t("survey.next")}</button>
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

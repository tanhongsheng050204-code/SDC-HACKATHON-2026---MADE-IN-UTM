import { useEffect, useRef, useState } from "react";
import { api, CheckResult, CheckStart, TreeNode } from "../lib/api";
import { getLang, levelName, t } from "../lib/i18n";

// One proof check: three questions, one at a time, graded on the server. Two right proves the level.
export function ProofCheck({ profileId, node, isDemo, onDone, onClose }: {
  profileId: string; node: TreeNode; isDemo: boolean;
  onDone: (passed: boolean) => void; onClose: () => void;
}) {
  const [check, setCheck] = useState<CheckStart | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const started = useRef(false);  // one start per open: each start is a paid model call and counts as an attempt
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api.startCheck(profileId, node.skill_id, getLang())
      .then(setCheck)
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  }, [profileId, node.skill_id]);

  const step = answers.length;
  const question = check && step < check.questions.length ? check.questions[step] : null;

  async function choose(option: number) {
    if (!check) return;
    const next = [...answers, option];
    setAnswers(next);
    if (next.length < check.questions.length) return;
    setBusy(true);
    try {
      const r = await api.submitCheck(check.check_id, profileId, next);
      setResult(r);
      onDone(r.passed);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog proof" role="dialog" aria-modal="true" aria-labelledby="proof-title">
        <h2 id="proof-title">{node.name}{check && ` · ${t("tree.prove")} ${levelName(check.level)}`}</h2>
        {busy && !check && <p className="muted">{t("tree.writing")}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        {question && check && (
          <>
            <p className="muted">{t("tree.question")} {step + 1} / {check.questions.length}</p>
            <p><strong>{question.prompt}</strong></p>
            <div className="proof-options">
              {question.options.map((o, i) => (
                <button key={i} className="btn quiet" disabled={busy} onClick={() => choose(i)}>{o}</button>
              ))}
            </div>
          </>
        )}
        {result && check && (
          <div className="proof-result" role="status">
            <p className={result.passed ? "badge good" : "badge risk"}>
              {result.passed ? `${t("tree.passed")} ${levelName(result.level)}` : t("tree.notYet")} · {result.correct} / {check.questions.length}
            </p>
            <ol>
              {check.questions.map((q, i) => (
                <li key={i}>
                  {answers[i] === result.answers[i] ? "✓" : "✗"} {q.options[result.answers[i]]}
                  {result.explanations[i] && <span className="muted"> · {result.explanations[i]}</span>}
                </li>
              ))}
            </ol>
            {!result.passed && (
              <p>
                {!isDemo && <>{t("tree.tomorrow")} </>}
                {result.course && <a href={result.course.url} target="_blank" rel="noreferrer">{result.course.title} ↗</a>}
              </p>
            )}
          </div>
        )}
        <div className="dialog-actions">
          <button className="btn ink" onClick={onClose}>{result || error ? t("tree.close") : t("tree.cancel")}</button>
        </div>
      </div>
    </div>
  );
}

import { KeyboardEvent, PointerEvent, ReactNode, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { PayLine } from "../components/PayLine";
import { levelName, t, tf, tr } from "../lib/i18n";
import { LogoMark } from "../components/Brand";
import { Sdgs } from "../components/Sdgs";
import { api, FutureCard } from "../lib/api";
import { percent, signed } from "../lib/format";
import { OUTLOOK_TEXT, OUTLOOK_TONE } from "../lib/labels";

const SLIDES = 5;  // then the share card

// S8: the Future Card opened from a shared link or QR code (/?card=ID), told as a short story:
// five slides (tap, arrow keys or swipe), then one share card with QR, Copy link and Save image.
// Only fields the card API returns are shown; never the owner's current job or skill list.
export function CardPage({ cardId }: { cardId: string }) {
  const [card, setCard] = useState<FutureCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [at, setAt] = useState(0);
  const start = useRef<number | null>(null);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.card(cardId).then(setCard).catch((e) => setError(e instanceof Error && e.message.startsWith("404")
      ? t("fc.gone")
      : t("fc.offline")));
  }, [cardId]);
  useEffect(() => { if (card) stage.current?.focus(); }, [card]);

  const go = (n: number) => setAt(Math.max(0, Math.min(SLIDES, n)));
  function keys(e: KeyboardEvent) {
    if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); go(at + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(at - 1); }
    else if (e.key === "End") go(SLIDES);
    else if (e.key === "Home") go(0);
  }
  // A tap on the left third goes back, anywhere else forward; a sideways swipe does the same.
  function down(e: PointerEvent) { start.current = e.clientX; }
  function up(e: PointerEvent<HTMLDivElement>) {
    if (start.current === null || (e.target as HTMLElement).closest("a, button")) { start.current = null; return; }
    const dx = e.clientX - start.current;
    start.current = null;
    if (Math.abs(dx) > 40) go(at + (dx < 0 ? 1 : -1));
    else {
      const box = e.currentTarget.getBoundingClientRect();
      go(at + (e.clientX - box.left < box.width / 3 ? -1 : 1));
    }
  }

  return (
    <div className="site">
      <nav className="site-nav" aria-label={t("nav.main")}>
        <a className="brand" href={window.location.pathname} aria-label={t("nav.homeAria")}><LogoMark /><span>Laluan</span></a>
      </nav>
      <main className="card-page">
        {error && <div className="banner error" role="alert">{error}</div>}
        {!card && !error && <p className="muted">{t("fc.loading")}</p>}
        {card && (
          <article className="story" aria-roledescription={t("story.role")} aria-label={tf("fc.toward", { role: tr(card.role.title) })}>
            <div className="story-dashes">
              {Array.from({ length: SLIDES + 1 }, (_, i) => (
                <button key={i} className={i < at ? "seen" : i === at ? "now" : ""} aria-label={tf("story.goTo", { n: i + 1, of: SLIDES + 1 })}
                  aria-current={i === at ? "step" : undefined} onClick={() => go(i)} />
              ))}
            </div>
            <div className="story-stage" ref={stage} tabIndex={0} onKeyDown={keys} onPointerDown={down} onPointerUp={up}
              aria-live="polite" aria-label={t("story.help")}>
              <div key={at} className="story-slide">
                {at < SLIDES ? <Slide card={card} n={at} /> : <Summary card={card} />}
              </div>
            </div>
            <div className="story-nav">
              <button className="btn quiet" onClick={() => go(at - 1)} disabled={at === 0}>← {t("story.back")}</button>
              <span className="muted">{tf("story.count", { n: at + 1, of: SLIDES + 1 })}</span>
              {at < SLIDES
                ? <button className="btn ink" onClick={() => go(at + 1)}>{t("story.next")} →</button>
                : <a className="btn ink" href={window.location.pathname}>{t("fc.own")}</a>}
            </div>
            {at < SLIDES && <button className="link story-skip" onClick={() => go(SLIDES)}>{t("story.skip")}</button>}
            <p className="source">{tf("fc.source", { id: card.source.snapshot_id, date: card.source.imported, created: card.created_at.slice(0, 10) })}</p>
          </article>
        )}
      </main>
    </div>
  );
}

function Big({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  return <div className="story-big"><span className="eyebrow">{label}</span><strong>{value}</strong>{children}</div>;
}

function Slide({ card, n }: { card: FutureCard; n: number }) {
  const o = card.outlook;
  const year = card.estimate_range.horizon_year;
  if (n === 0) return (
    <>
      <p className="eyebrow">{t("share.title")}{card.display_name ? ` · ${card.display_name}` : ""}</p>
      <h1>{tf("fc.toward", { role: tr(card.role.title) })}</h1>
      <p>{tr(card.role.summary)}</p>
      {card.identity && <blockquote className="card-identity">{card.identity}</blockquote>}
    </>
  );
  if (n === 1) return (
    <>
      <Big label={tf("fc.outlookTo", { year })} value={`${signed(o.index)}%`}>
        <span className={`badge ${OUTLOOK_TONE[o.label]}`}>{OUTLOOK_TEXT[o.label]}</span>
      </Big>
      <p>{tf("fc.range", { low: signed(card.estimate_range.low), high: signed(card.estimate_range.high) })}</p>
      {card.robust_pick && <p><span className="badge gold">{t("card.robust")}</span> {t("fc.robust")}</p>}
      <PayLine pay={card.pay} change={card.pay_change_rm} />
    </>
  );
  if (n === 2) return (
    <>
      <Big label={t("path.readiness")} value={`${percent(card.readiness)}%`}><span>{t("fc.covered")}</span></Big>
      <div className="story-meter" role="img" aria-label={`${percent(card.readiness)}%`}><span style={{ width: `${card.readiness * 100}%` }} /></div>
      {card.proven && card.proven.length > 0 && (
        <div><h3>{t("card.proven")}</h3><div className="chips">
          {card.proven.map((p) => <span key={p.name} className="chip covered">✓ {tr(p.name)} · {levelName(p.level)}</span>)}
        </div></div>
      )}
    </>
  );
  if (n === 3) return (
    <>
      <Big label={t("story.route")} value={tf("fc.steps", { n: card.steps })}><span>{tf("fc.hoursLeft", { n: card.hours })}</span></Big>
      {card.next_skills.length > 0 && <p><strong>{t("fc.next")}:</strong> {card.next_skills.map((s) => tr(s)).join(", ")}</p>}
      {card.first_step && <p><strong>{t("fc.first")}:</strong> {card.first_step}</p>}
    </>
  );
  return (
    <>
      <p className="eyebrow">{t("story.sdgs")}</p>
      <h2>{t("story.sdgsTitle")}</h2>
      <Sdgs sdgs={card.sdgs} />
    </>
  );
}

// The one card to share: link, QR, and an image drawn by hand on a <canvas> (no library).
function Summary({ card }: { card: FutureCard }) {
  const link = window.location.href;
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { QRCode.toDataURL(link, { margin: 1, width: 240, errorCorrectionLevel: "M" }).then(setQr).catch(() => setQr(null)); }, [link]);

  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); }
  }
  async function saveImage() {
    const canvas = await drawCard(card, qr);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `laluan-future-card-${card.card_id.slice(0, 8)}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, "image/png");
  }

  return (
    <div className="story-summary">
      <div className="share-face">
        <span className="eyebrow">{t("share.title")}</span>
        <h2>{tr(card.role.title)}</h2>
        <div className="share-face-nums">
          <div><strong>{percent(card.readiness)}%</strong><span>{t("path.readiness")}</span></div>
          <div><strong>{signed(card.outlook.index)}%</strong><span>{tf("fc.outlookTo", { year: card.estimate_range.horizon_year })}</span></div>
          <div><strong>{card.hours}</strong><span>{t("story.hours")}</span></div>
        </div>
        <span className="share-face-foot">{t("story.estimate")}</span>
      </div>
      <div className="share-row">
        {qr && <img src={qr} width={140} height={140} alt={t("share.qr")} />}
        <div className="share-actions">
          <button onClick={copy}>{copied ? t("share.copied") : t("share.copy")}</button>
          <button onClick={saveImage}>{t("story.save")}</button>
        </div>
      </div>
    </div>
  );
}

async function drawCard(card: FutureCard, qr: string | null): Promise<HTMLCanvasElement> {
  const W = 1080, H = 1350;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#075C51"); bg.addColorStop(1, "#0C1714");
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const font = (size: number, weight = 600) => `${weight} ${size}px Inter, system-ui, sans-serif`;
  g.fillStyle = "#E0B23A"; g.font = font(34, 700); g.fillText("Laluan", 80, 120);
  g.fillStyle = "#9FD3C7"; g.font = font(30, 600); g.fillText(t("share.title").toUpperCase(), 80, 210);
  g.fillStyle = "#FFFFFF"; g.font = font(68, 800);
  wrap(g, tr(card.role.title), 80, 300, W - 160, 80);
  const nums: [string, string][] = [
    [`${percent(card.readiness)}%`, t("path.readiness")],
    [`${signed(card.outlook.index)}%`, tf("fc.outlookTo", { year: card.estimate_range.horizon_year })],
    [`${card.hours}`, t("story.hours")],
  ];
  nums.forEach(([v, label], i) => {
    const y = 560 + i * 170;
    g.fillStyle = "#F2C94C"; g.font = font(96, 800); g.fillText(v, 80, y);
    g.fillStyle = "#CDE8E1"; g.font = font(32, 500); g.fillText(label, 80, y + 50);
  });
  g.fillStyle = "#9FD3C7"; g.font = font(26, 500);
  g.fillText(t("story.estimate"), 80, H - 90);
  if (qr) {
    const img = new Image();
    await new Promise<void>((done) => { img.onload = () => done(); img.onerror = () => done(); img.src = qr; });
    g.fillStyle = "#FFFFFF"; g.fillRect(W - 340, H - 400, 260, 260);
    g.drawImage(img, W - 330, H - 390, 240, 240);
  }
  return c;
}

function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, line: number) {
  // Chinese has no spaces, so it wraps by character.
  const spaced = text.includes(" ");
  let row = "";
  for (const word of spaced ? text.split(" ") : [...text]) {
    const next = row ? `${row}${spaced ? " " : ""}${word}` : word;
    if (g.measureText(next).width > max && row) { g.fillText(row, x, y); y += line; row = word; } else row = next;
  }
  if (row) g.fillText(row, x, y);
}

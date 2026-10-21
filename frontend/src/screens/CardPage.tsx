import { useEffect, useRef, useState } from "react";
import { t, tf, tr } from "../lib/i18n";
import { LogoMark } from "../components/Brand";
import { Sdgs } from "../components/Sdgs";
import { Icon } from "../components/Icon";
import { api, FutureCard } from "../lib/api";
import { percent } from "../lib/format";
import { OUTLOOK_TEXT, OUTLOOK_TONE } from "../lib/labels";
import QRCode from "qrcode";

const SLIDE_COUNT = 5;

// Animated counting number: counts up to `target` over ~800 ms
function CountUp({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    setVal(0);
    let start: number | null = null;
    const duration = 800;
    function step(ts: number) {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setVal(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    }
    const raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return <span className="story-big">{val}{suffix}</span>;
}

// S8: the read-only Future Card opened from a shared link or QR code (/?card=ID).
export function CardPage({ cardId }: { cardId: string }) {
  const [card, setCard] = useState<FutureCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slide, setSlide] = useState(0); // 0-4 = slides, 5 = share
  const [slideKey, setSlideKey] = useState(0); // force re-mount for animation
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    api.card(cardId).then(setCard).catch((e) => setError(e instanceof Error && e.message.startsWith("404")
      ? t("fc.gone")
      : t("fc.offline")));
  }, [cardId]);

  function goTo(n: number) {
    setSlide(n);
    setSlideKey((k) => k + 1);
  }
  function next() { if (slide < SLIDE_COUNT) goTo(slide + 1); }
  function prev() { if (slide > 0) goTo(slide - 1); }

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Touch swipe
  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > 50) {
      if (delta < 0) next();
      else prev();
    }
    touchStartX.current = null;
  }

  async function generateQr() {
    setQrLoading(true);
    try {
      const url = await QRCode.toDataURL(window.location.href, { width: 200, margin: 1 });
      setQrDataUrl(url);
    } finally {
      setQrLoading(false);
    }
  }

  function copyLink() {
    navigator.clipboard?.writeText(window.location.href).catch(() => { /* ignore */ });
  }

  function saveImage(c: FutureCard) {
    const W = 640, H = 360;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background
    ctx.fillStyle = "#F3F6F4";
    ctx.fillRect(0, 0, W, H);

    // Top bar
    ctx.fillStyle = "#086759";
    ctx.fillRect(0, 0, W, 8);

    // Role title
    ctx.fillStyle = "#10241F";
    ctx.font = "bold 28px system-ui, sans-serif";
    ctx.fillText(tr(c.role.title), 32, 60);

    // Readiness big number
    ctx.fillStyle = "#086759";
    ctx.font = "bold 56px system-ui, sans-serif";
    ctx.fillText(`${percent(c.readiness)}%`, 32, 130);

    // Readiness label
    ctx.fillStyle = "#5A6B66";
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillText(t("path.readiness"), 32, 155);

    // Next 3 skills
    ctx.fillStyle = "#10241F";
    ctx.font = "15px system-ui, sans-serif";
    c.next_skills.slice(0, 3).forEach((s, i) => {
      ctx.fillText(`→ ${s}`, 32, 195 + i * 26);
    });

    // Hours label
    ctx.fillStyle = "#5A6B66";
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText(`${c.hours} h ${t("fc.hoursLabel")}`, 32, H - 40);

    // SDG colored circles
    const sdgColors: Record<number, string> = {
      1: "#E5243B", 2: "#DDA63A", 3: "#4C9F38", 4: "#C5192D", 5: "#FF3A21",
      6: "#26BDE2", 7: "#FCC30B", 8: "#A21942", 9: "#FD6925", 10: "#DD1367",
      11: "#FD9D24", 12: "#BF8B2E", 13: "#3F7E44", 14: "#0A97D9", 15: "#56C02B",
      16: "#00689D", 17: "#19486A",
    };
    c.sdgs.slice(0, 8).forEach((sdg, i) => {
      const cx = W - 200 + i % 4 * 36 + 20;
      const cy = H - 80 + Math.floor(i / 4) * 36;
      ctx.fillStyle = sdgColors[sdg.number] ?? "#086759";
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 10px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(sdg.number), cx, cy + 4);
      ctx.textAlign = "left";
    });

    // Bottom-right watermark
    ctx.fillStyle = "#5A6B66";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("laluan.app", W - 24, H - 16);
    ctx.textAlign = "left";

    // Download
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "my-laluan-route.png";
    a.click();
  }

  return (
    <div className="site">
      <nav className="site-nav" aria-label={t("nav.main")}>
        <a className="brand" href={window.location.pathname} aria-label={t("nav.homeAria")}><LogoMark /><span>Laluan</span></a>
      </nav>
      <main className="story-page">
        {error && <div className="banner error" role="alert">{error}</div>}
        {!card && !error && <p className="muted">{t("fc.loading")}</p>}
        {card && (
          <div
            className="story"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            {/* Progress dashes — only show for slides 0-4 */}
            {slide < SLIDE_COUNT && (
              <div className="story-dashes" role="tablist" aria-label={t("fc.slide")}>
                {Array.from({ length: SLIDE_COUNT }, (_, i) => (
                  <button
                    key={i}
                    role="tab"
                    aria-selected={i === slide}
                    aria-label={`${t("fc.slide")} ${i + 1}`}
                    className={`story-dash${i < slide ? " done" : i === slide ? " active" : ""}`}
                    onClick={() => goTo(i)}
                  />
                ))}
              </div>
            )}

            {/* Slides */}
            {slide < SLIDE_COUNT && (
              <>
                {/* Tap areas */}
                <div className="story-tap-areas" aria-hidden="true">
                  <button className="story-tap" onClick={prev} tabIndex={-1} aria-hidden="true" />
                  <button className="story-tap" onClick={next} tabIndex={-1} aria-hidden="true" />
                </div>

                <div key={slideKey} className="story-slide" role="tabpanel" aria-label={`${t("fc.slide")} ${slide + 1}`}>
                  {slide === 0 && <Slide1 card={card} />}
                  {slide === 1 && <Slide2 card={card} />}
                  {slide === 2 && <Slide3 card={card} />}
                  {slide === 3 && <Slide4 card={card} />}
                  {slide === 4 && <Slide5 card={card} />}
                </div>

                <nav className="story-nav" aria-label={t("nav.main")}>
                  <button
                    className="story-nav-btn"
                    onClick={prev}
                    disabled={slide === 0}
                    aria-label={t("fc.prev")}
                  >
                    <Icon name="arrowLeft" />
                  </button>
                  <span className="muted" style={{ fontSize: ".85rem" }}>{slide + 1} / {SLIDE_COUNT}</span>
                  {slide < SLIDE_COUNT - 1 ? (
                    <button className="story-nav-btn" onClick={next} aria-label={t("fc.nextSlide")}>
                      <Icon name="arrowRight" /> <span style={{ marginLeft: 4 }}>{t("fc.nextSlide")}</span>
                    </button>
                  ) : (
                    <button className="btn ink" onClick={next} style={{ fontSize: ".9rem", padding: "8px 14px" }}>
                      {t("fc.shareBtn")} →
                    </button>
                  )}
                </nav>
              </>
            )}

            {/* Share screen */}
            {slide === SLIDE_COUNT && (
              <div className="share-screen">
                <button
                  className="story-nav-btn"
                  onClick={() => goTo(SLIDE_COUNT - 1)}
                  style={{ marginBottom: 16 }}
                  aria-label={t("fc.backSlides")}
                >
                  <Icon name="arrowLeft" /> <span style={{ marginLeft: 4 }}>{t("fc.backSlides")}</span>
                </button>
                <h2>{t("fc.shareBtn")}</h2>
                <p className="muted">{t("fc.shareDesc")}</p>
                <div className="share-block">
                  {qrDataUrl && (
                    <img src={qrDataUrl} width={160} height={160} alt="QR code for this card" />
                  )}
                  <div className="share-actions">
                    <button
                      className="btn ink"
                      onClick={generateQr}
                      disabled={qrLoading}
                    >
                      {qrLoading ? "…" : t("fc.generate")}
                    </button>
                    <button className="btn quiet" onClick={copyLink}>
                      <Icon name="upload" /> {t("fc.own")}
                    </button>
                    <button className="btn quiet" onClick={() => saveImage(card)}>
                      {t("fc.saveImage")}
                    </button>
                  </div>
                </div>
                {qrDataUrl && (
                  <span className="share-link">{window.location.href}</span>
                )}
                <button className="btn quiet" style={{ marginTop: 12 }} onClick={copyLink}>
                  Copy link
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// Slide 1 — "Where you're heading"
function Slide1({ card }: { card: FutureCard }) {
  return (
    <>
      <p className="eyebrow">{t("fc.s1Title")}</p>
      <h1 className="story-title">{tr(card.role.title)}</h1>
      <p className="story-body">{tr(card.role.summary)}</p>
      {card.identity && (
        <blockquote className="card-identity story-identity">{card.identity}</blockquote>
      )}
    </>
  );
}

// Slide 2 — "Where it's heading"
function Slide2({ card }: { card: FutureCard }) {
  const abs = Math.abs(card.outlook.index);
  return (
    <>
      <p className="eyebrow">{t("fc.s2Title")}</p>
      <span className={`badge ${OUTLOOK_TONE[card.outlook.label]}`}>{OUTLOOK_TEXT[card.outlook.label]}</span>
      <CountUp target={abs} suffix="%" />
      <p className="story-label">
        {tf("fc.range", { low: String(card.estimate_range.low), high: String(card.estimate_range.high) })}
      </p>
      <p className="story-body">
        {tf("fc.outlookTo", { year: String(card.estimate_range.horizon_year) })}
      </p>
    </>
  );
}

// Slide 3 — "Your readiness"
function Slide3({ card }: { card: FutureCard }) {
  return (
    <>
      <p className="eyebrow">{t("fc.s3Title")}</p>
      <CountUp target={percent(card.readiness)} suffix="%" />
      <p className="story-label">{t("path.readiness")}</p>
      {card.robust_pick && (
        <p><span className="badge gold">{t("card.robust")}</span></p>
      )}
    </>
  );
}

// Slide 4 — "Your route"
function Slide4({ card }: { card: FutureCard }) {
  return (
    <>
      <p className="eyebrow">{t("fc.s4Title")}</p>
      <CountUp target={card.hours} suffix=" h" />
      <p className="story-label">{t("fc.hoursLabel")}</p>
      <p className="story-body">{tf("fc.steps", { n: card.steps })}</p>
      {card.next_skills.length > 0 && (
        <div className="chips story-skills">
          {card.next_skills.slice(0, 3).map((s) => (
            <span key={s} className="chip">{s}</span>
          ))}
        </div>
      )}
      {card.first_step && (
        <p className="story-body"><strong>{t("fc.first")}:</strong> {card.first_step}</p>
      )}
    </>
  );
}

// Slide 5 — "Your impact"
function Slide5({ card }: { card: FutureCard }) {
  return (
    <>
      <p className="eyebrow">{t("fc.s5Title")}</p>
      <Sdgs sdgs={card.sdgs} />
    </>
  );
}

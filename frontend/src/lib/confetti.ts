// A small, one-off burst of colour from an element, for a finished course. It never blocks
// anything and is skipped with reduce-motion or in Lite mode.
const COLOURS = ["#086759", "#E0B23A", "#0B5B4F", "#9FD3C7", "#F2C94C"];

export function confetti(from: Element | null) {
  if (!from || typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.lite === "1") return;
  const box = from.getBoundingClientRect();
  const layer = document.createElement("div");
  layer.className = "confetti";
  layer.setAttribute("aria-hidden", "true");
  layer.style.left = `${box.left + box.width / 2}px`;
  layer.style.top = `${box.top + box.height / 2}px`;
  for (let i = 0; i < 16; i++) {
    const bit = document.createElement("span");
    const angle = (i / 16) * Math.PI * 2;
    const dist = 36 + Math.random() * 30;
    bit.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    bit.style.setProperty("--dy", `${Math.sin(angle) * dist - 12}px`);
    bit.style.background = COLOURS[i % COLOURS.length];
    layer.appendChild(bit);
  }
  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 800);
}

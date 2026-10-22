export function signed(n: number) {
  return `${n > 0 ? "+" : ""}${n}`;
}

export function percent(x: number) {
  return Math.round(x * 100);
}

// White numbers fail contrast on ten of the official SDG colours (yellow, orange, light blue,
// green...), so those tiles get dark numbers instead. WCAG relative-luminance formula.
export function sdgStyle(colour: string) {
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const onWhite = 1.05 / (lum(colour) + 0.05);
  return { background: colour, color: onWhite >= 4.5 ? "#fff" : "#10241F" };
}

// App flow: a snapshot older than 12 months gets the same yellow banner as illustrative data.
export function monthsOld(isoDate: string, now = new Date()) {
  const then = new Date(isoDate);
  if (Number.isNaN(then.getTime())) return 0;
  return (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth());
}

export function jobLinks(title: string) {
  const q = encodeURIComponent(title);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return [
    { label: "MYFutureJobs", url: "https://myfuturejobs.gov.my/" },
    { label: "JobStreet", url: `https://my.jobstreet.com/${slug}-jobs` },
    { label: "LinkedIn", url: `https://www.linkedin.com/jobs/search/?keywords=${q}&location=Malaysia` },
  ];
}

export function onetUrl(code: string) {
  return `https://www.onetonline.org/link/summary/${code}`;
}

// "22 Oct 2026" in the page's language, from an ISO date (read as a local calendar day).
export function shortDate(iso: string) {
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString(document.documentElement.lang || undefined,
    { day: "numeric", month: "short", year: "numeric" });
}

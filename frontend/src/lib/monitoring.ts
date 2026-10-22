// Error tracking, only when VITE_SENTRY_DSN is set at build time. The Sentry code is loaded on
// demand, so builds without a DSN never download it. Before an event leaves the browser it loses
// the user, breadcrumbs (clicks, console lines, requests) and query strings, and IDs in paths are
// replaced, so no profile, question or CV text can reach Sentry.

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

const IDS = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[A-Za-z0-9_-]{20,}/g;

export function cleanUrl(url: string | undefined): string | undefined {
  return url?.split(/[?#]/)[0].replace(IDS, "{id}");
}

interface SentryEvent { request?: { url?: string }; user?: unknown; breadcrumbs?: unknown; extra?: unknown }

export function scrubEvent<T extends SentryEvent>(event: T): T {
  const url = cleanUrl(event.request?.url);
  return { ...event, request: url ? { url } : undefined, user: undefined, breadcrumbs: undefined, extra: undefined };
}

export function startMonitoring() {
  if (!DSN) return;
  import("@sentry/react").then((Sentry) => {
    Sentry.init({
      dsn: DSN,
      environment: (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) || "production",
      sendDefaultPii: false,
      maxBreadcrumbs: 0,
      tracesSampleRate: 0,
      beforeSend: (event) => scrubEvent(event),
    });
  }).catch(() => { /* monitoring must never break the app */ });
}

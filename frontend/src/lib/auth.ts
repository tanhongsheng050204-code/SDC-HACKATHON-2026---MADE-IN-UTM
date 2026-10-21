// Google login through Supabase Auth. The browser holds the session; the backend only verifies the
// token we send with each request (backend/app/auth.py). Without VITE_SUPABASE_* the app runs as
// before, anonymous only, and the login button is hidden.
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const authEnabled = Boolean(URL && KEY);
const client: SupabaseClient | null = authEnabled ? createClient(URL!, KEY!) : null;

let token: string | null = null;
let userId: string | null = null;
let googleName: string | null = null;  // offered as the default display name; stored only if the person saves it
let accountName: string | null = null;  // the name the person chose, kept on the Supabase account (user_metadata.display_name)
type Listener = (userId: string | null) => void;
const listeners = new Set<Listener>();

type Session = { access_token: string; user: { id: string; user_metadata?: Record<string, unknown> } };

function set(session: Session | null) {
  const next = session?.user.id ?? null;
  token = session?.access_token ?? null;
  const meta = session?.user.user_metadata ?? {};
  googleName = String(meta.full_name ?? meta.name ?? "").trim().slice(0, 60) || null;
  accountName = String(meta.display_name ?? "").trim().slice(0, 60) || null;
  if (next !== userId) {
    userId = next;
    listeners.forEach((l) => l(userId));
  }
}

// Resolves once the stored session (if any) has been read, so the first requests after a reload
// carry the login instead of racing it.
export const ready: Promise<void> = client
  ? client.auth.getSession().then(({ data }) => set(data.session)).catch(() => undefined)
  : Promise.resolve();
if (client) client.auth.onAuthStateChange((_event, session) => set(session));

export const getToken = () => token;

/** The current access token, refreshed first if it has expired (e.g. after the laptop slept). */
export async function freshToken(): Promise<string | null> {
  if (!client) return null;
  await ready;
  const { data } = await client.auth.getSession();
  set(data.session);
  return token;
}

/** One forced refresh, for a token the server refused. */
export async function refreshToken(): Promise<string | null> {
  if (!client) return null;
  const { data } = await client.auth.refreshSession();
  set(data.session);
  return token;
}
export const getUserId = () => userId;
export const getGoogleName = () => googleName;
export const getAccountName = () => accountName;

/** Keep the chosen name on the account itself, so it survives logging out, a replaced profile
 * and other devices. Profiles copy it (App.tsx). */
export async function setAccountName(name: string): Promise<void> {
  if (!client) return;
  const { data, error } = await client.auth.updateUser({ data: { display_name: name } });
  if (error) throw error;
  accountName = String(data.user?.user_metadata?.display_name ?? name).trim() || null;
}

// Tells the listener the current user straight away, then on every change: the stored session can
// finish loading before a screen subscribes, and that screen must not miss it (it showed "Log in"
// while the person was logged in).
export function onAuth(listener: Listener): () => void {
  listeners.add(listener);
  listener(userId);
  return () => { listeners.delete(listener); };
}

export async function signIn(): Promise<void> {
  if (!client) return;
  // Come back to the same screen (the app keeps its state in the query string).
  await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin + window.location.pathname + window.location.search },
  });
}

export async function signOut(): Promise<void> {
  if (!client) return;
  // This device only: an expired token here must not end the person's sessions elsewhere.
  await client.auth.signOut({ scope: "local" });
  set(null);
}

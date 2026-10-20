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
type Listener = (userId: string | null) => void;
const listeners = new Set<Listener>();

function set(session: { access_token: string; user: { id: string } } | null) {
  const next = session?.user.id ?? null;
  token = session?.access_token ?? null;
  if (next !== userId) {
    userId = next;
    listeners.forEach((l) => l(userId));
  }
}

if (client) {
  client.auth.getSession().then(({ data }) => set(data.session));
  client.auth.onAuthStateChange((_event, session) => set(session));
}

export const getToken = () => token;
export const getUserId = () => userId;

export function onAuth(listener: Listener): () => void {
  listeners.add(listener);
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
  await client.auth.signOut();
  set(null);
}

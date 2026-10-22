// Runtime configuration. In Docker the web container writes /config.js from its environment
// (compose reads frontend.env into it) before nginx starts, so the same image can be pointed at
// a different API or Supabase project without a rebuild. Build-time VITE_* values stay the
// fallback for `npm run dev` and for hosts that bake them in.
declare global {
  interface Window {
    __LALUAN__?: { apiUrl?: string; supabaseUrl?: string; supabaseAnonKey?: string; microsoftLogin?: boolean };
  }
}

const runtime: Window["__LALUAN__"] = typeof window !== "undefined" ? window.__LALUAN__ ?? {} : {};

export const config = {
  apiUrl: runtime.apiUrl || import.meta.env.VITE_API_URL || "",
  supabaseUrl: runtime.supabaseUrl || import.meta.env.VITE_SUPABASE_URL || "",
  supabaseAnonKey: runtime.supabaseAnonKey || import.meta.env.VITE_SUPABASE_ANON_KEY || "",
  // "Sign in with Microsoft" (school and work accounts) only once the Azure provider is set up in Supabase.
  microsoftLogin: runtime.microsoftLogin ?? import.meta.env.VITE_AUTH_MICROSOFT === "1",
};

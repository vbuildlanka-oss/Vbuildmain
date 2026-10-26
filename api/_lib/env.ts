/**
 * Server-side settings, read from Vercel environment variables.
 * The VITE_ copies are what the browser bundle uses; functions can read them too,
 * so the Supabase values only have to be entered once.
 */
export function supabaseEnv() {
  const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "";
  return { url, key, ok: Boolean(url && key) };
}

export function r2Env() {
  const accountId = process.env.R2_ACCOUNT_ID ?? "";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? "";
  const bucket = process.env.R2_BUCKET ?? "";
  const publicUrl = (process.env.R2_PUBLIC_URL ?? "").replace(/\/+$/, "");
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicUrl,
    ok: Boolean(accountId && accessKeyId && secretAccessKey && bucket && publicUrl),
  };
}

/** Headers for Supabase REST calls; pass the user's access token to act as them. */
export function supabaseHeaders(key: string, token?: string): Record<string, string> {
  const h: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  else if (key.startsWith("eyJ")) h.Authorization = `Bearer ${key}`;
  return h;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

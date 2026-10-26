import { json, supabaseEnv, supabaseHeaders } from "./_lib/env.js";

/**
 * GET /api/keep-alive: Vercel Cron calls this once a day (see vercel.json).
 *
 * Supabase pauses free projects after a week with too little database
 * activity. This runs a real write, the `keep_alive()` function in
 * supabase/setup.sql, so the project always counts as active. The GitHub
 * Actions workflow in .github/workflows/supabase-keep-alive.yml pings
 * several more times a day as a backup.
 *
 * When CRON_SECRET is set, Vercel sends it as a bearer token and other
 * callers are refused.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return json({ error: "Unauthorized" }, 401);
  }
  const { url, key, ok } = supabaseEnv();
  if (!ok) return json({ ok: false, error: "Supabase isn't configured." }, 500);

  const res = await fetch(`${url}/rest/v1/rpc/keep_alive`, {
    method: "POST",
    headers: supabaseHeaders(key),
    body: JSON.stringify({ caller: "vercel-cron" }),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error("[keep-alive] Supabase ping failed", res.status, body.slice(0, 300));
    return json({ ok: false, status: res.status, error: body.slice(0, 300) }, 502);
  }
  return json({ ok: true, heartbeat: JSON.parse(body) });
}

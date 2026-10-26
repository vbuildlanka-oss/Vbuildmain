import { AwsClient } from "aws4fetch";

import { json, r2Env, supabaseEnv, supabaseHeaders } from "./_lib/env.js";

/**
 * POST /api/upload — stores an image in Cloudflare R2 and returns its public URL.
 *
 * The admin page sends the file as the raw request body, already converted
 * to WebP in the browser. It sends the user's Supabase access token as
 * `Authorization: Bearer …`. The token is checked by asking Supabase whether
 * this user is an admin, so no Supabase secret ever lives here. The image
 * passes through this function on its way to R2, so the R2 bucket needs no
 * CORS setup.
 */

const MAX_BYTES = 4 * 1024 * 1024; // Vercel's request body limit is 4.5 MB.
const TYPES: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/avif": "avif",
};

async function isAdmin(token: string): Promise<boolean> {
  const { url, key, ok } = supabaseEnv();
  if (!ok) return false;
  const res = await fetch(`${url}/rest/v1/rpc/is_admin`, {
    method: "POST",
    headers: supabaseHeaders(key, token),
    body: "{}",
  });
  // An invalid or expired token is rejected by Supabase with 401.
  return res.ok && (await res.json()) === true;
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "image"
  );
}

export async function POST(request: Request): Promise<Response> {
  const supa = supabaseEnv();
  const r2 = r2Env();
  if (!supa.ok) return json({ error: "Supabase isn't configured on the server." }, 500);
  if (!r2.ok) return json({ error: "Cloudflare R2 isn't configured on the server yet." }, 500);

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token || !(await isAdmin(token))) return json({ error: "Not signed in as an admin." }, 401);

  const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const ext = TYPES[type];
  if (!ext) return json({ error: `Unsupported file type: ${type || "unknown"}` }, 415);

  const body = await request.arrayBuffer();
  if (body.byteLength === 0) return json({ error: "Empty file." }, 400);
  if (body.byteLength > MAX_BYTES) return json({ error: "Image is larger than 4 MB." }, 413);

  const name = slugify(decodeURIComponent(request.headers.get("x-filename") ?? "image"));
  const folder =
    (request.headers.get("x-folder") ?? "uploads").replace(/[^a-z0-9-]/gi, "") || "uploads";
  const key = `${folder}/${new Date().toISOString().slice(0, 10)}/${name}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

  const client = new AwsClient({
    accessKeyId: r2.accessKeyId,
    secretAccessKey: r2.secretAccessKey,
    service: "s3",
    region: "auto",
  });
  const put = await client.fetch(
    `https://${r2.accountId}.r2.cloudflarestorage.com/${r2.bucket}/${key}`,
    {
      method: "PUT",
      body,
      headers: {
        "Content-Type": type,
        // Every upload gets a unique key, so it can be cached forever.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    },
  );
  if (!put.ok) {
    const detail = (await put.text()).slice(0, 300);
    console.error("[upload] R2 PUT failed", put.status, detail);
    return json({ error: `Cloudflare R2 rejected the upload (${put.status}).` }, 502);
  }
  return json({ url: `${r2.publicUrl}/${key}`, key, bytes: body.byteLength });
}

/** GET /api/upload — tells the admin overview whether uploads are set up (no secrets returned). */
export function GET(): Response {
  return json({ r2: r2Env().ok, supabase: supabaseEnv().ok });
}

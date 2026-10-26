import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { CONTENT_ID, supabaseAnonKey, supabaseConfigured, supabaseUrl } from "@/content/store";
import type { SiteContent } from "@/content/types";

// -----------------------------------------------------------------------------
// Supabase
// -----------------------------------------------------------------------------

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "vbuild-admin-auth" },
    })
  : null;

export { CONTENT_ID };

export type PublishedRow = { data: unknown; updated_at: string };

// -----------------------------------------------------------------------------
// Paths: editors address any value in the document by a path like ["hero", "body"].
// -----------------------------------------------------------------------------

export type Path = (string | number)[];

export function getAt(obj: unknown, path: Path): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur == null) return undefined;
    cur = (cur as Record<string | number, unknown>)[k];
  }
  return cur;
}

export function setAt<T>(obj: T, path: Path, value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path;
  const src = obj as unknown as Record<string | number, unknown> | unknown[];
  const copy = (Array.isArray(src) ? [...src] : { ...src }) as Record<string | number, unknown>;
  copy[head] = setAt(copy[head], rest, value);
  return copy as unknown as T;
}

// -----------------------------------------------------------------------------
// Slugs + validation
// -----------------------------------------------------------------------------

export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function uniqueSlug(base: string, taken: string[]): string {
  const root = slugify(base) || "untitled";
  let slug = root;
  for (let i = 2; taken.includes(slug); i++) slug = `${root}-${i}`;
  return slug;
}

export type Problem = { where: string; message: string; section: string };

/** Things that would break the site if published. */
export function validate(c: SiteContent): Problem[] {
  const out: Problem[] = [];
  const checkSlugs = (items: { slug: string; title: string }[], kind: string, section: string) => {
    const seen = new Set<string>();
    items.forEach((it, i) => {
      const where = `${kind} ${i + 1}${it.title ? ` (${it.title})` : ""}`;
      if (!it.title.trim())
        out.push({ where, message: "needs a title", section: `${section}:${i}` });
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(it.slug))
        out.push({
          where,
          message: "needs a URL slug made of lowercase letters, numbers and dashes",
          section: `${section}:${i}`,
        });
      else if (seen.has(it.slug))
        out.push({
          where,
          message: `uses the slug “${it.slug}” twice`,
          section: `${section}:${i}`,
        });
      seen.add(it.slug);
    });
  };
  checkSlugs(c.services, "Service", "services");
  checkSlugs(c.projects, "Project", "projects");
  c.projects.forEach((p, i) => {
    if (p.liveUrl && !/^https?:\/\//.test(p.liveUrl))
      out.push({
        where: `Project ${i + 1} (${p.title})`,
        message: "live URL must start with https://",
        section: `projects:${i}`,
      });
  });
  if (!/^\d{6,15}$/.test(c.settings.whatsapp.replace(/\D/g, "")))
    out.push({
      where: "Site settings",
      message: "WhatsApp number looks wrong",
      section: "settings",
    });
  return out;
}

// -----------------------------------------------------------------------------
// Images: shrink + convert to WebP in the browser, then upload to R2 via /api/upload.
// -----------------------------------------------------------------------------

const MAX_EDGE = 2400;
const MAX_BYTES = 3.8 * 1024 * 1024;

async function encode(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function prepareImage(file: File): Promise<Blob> {
  // Vector and animated formats are uploaded as they are.
  if (file.type === "image/svg+xml" || file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.86, 0.78, 0.68, 0.55]) {
    const webp = await encode(canvas, "image/webp", quality);
    // Browsers that can't encode WebP silently return PNG; use JPEG there instead.
    const blob = webp?.type === "image/webp" ? webp : await encode(canvas, "image/jpeg", quality);
    if (blob && blob.size <= MAX_BYTES) return blob;
  }
  throw new Error("Couldn't get this image under 4 MB. Try a smaller one.");
}

export async function uploadImage(file: File, folder: string): Promise<string> {
  if (!supabase) throw new Error("Supabase isn't configured.");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session expired. Sign in again.");
  const blob = await prepareImage(file);
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": blob.type || file.type,
      "X-Filename": encodeURIComponent(file.name),
      "X-Folder": folder,
    },
    body: blob,
  });
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !body.url) {
    throw new Error(
      body.error ??
        (res.status === 404
          ? "The upload endpoint isn't available here (it runs on Vercel)."
          : `Upload failed (${res.status}).`),
    );
  }
  return body.url;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

import { blankProject, blankService, defaultContent } from "./defaults";
import type { Project, SiteContent } from "./types";

/**
 * Public content loading.
 *
 * Before React mounts, the site loads the published document from Supabase
 * with one small REST request. index.html starts that request even before
 * the JS bundle has finished downloading. If Supabase isn't configured, is
 * paused or doesn't answer within a few seconds, the site uses the last
 * copy it saw, cached in localStorage, and failing that the defaults it
 * ships with. The site always renders.
 *
 * Preview: /admin writes the draft to localStorage and opens the site with
 * ?preview=1. That tab shows the draft and reloads whenever the draft changes.
 */

export const CONTENT_ID = "site";
const CACHE_KEY = "vbuild:content";
export const DRAFT_KEY = "vbuild:preview-draft";
const PREVIEW_FLAG = "vbuild:preview";
const TIMEOUT_MS = 3000;

export const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(
  /\/+$/,
  "",
);
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

type Row = { data: unknown; updated_at?: string };

declare global {
  interface Window {
    /** Started by the inline script in index.html. */
    __vbuildContent?: Promise<Row[] | null>;
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Saved values win; anything missing (e.g. a field added later) comes from `base`. */
function mergeDeep<T>(base: T, saved: unknown): T {
  if (Array.isArray(base)) return (Array.isArray(saved) ? saved : base) as T;
  if (isObject(base)) {
    if (!isObject(saved)) return base;
    const out: Record<string, unknown> = { ...base };
    for (const key of Object.keys(saved)) {
      out[key] =
        key in base ? mergeDeep((base as Record<string, unknown>)[key], saved[key]) : saved[key];
    }
    return out as T;
  }
  return (
    saved === undefined || saved === null || typeof saved !== typeof base ? base : saved
  ) as T;
}

/** Fills gaps in a saved document so the site can rely on every field existing. */
export function normalizeContent(saved: unknown): SiteContent {
  const c = mergeDeep(defaultContent, saved);
  // The 3D story has exactly four beats.
  const chapters = defaultContent.process.chapters.map((d, i) =>
    mergeDeep(d, c.process.chapters[i]),
  );
  return {
    ...c,
    process: { ...c.process, chapters },
    services: c.services.map((s) => mergeDeep(blankService, s)),
    // Saved projects predate the `published` flag: treat a missing one as published.
    projects: c.projects.map((p) => mergeDeep({ ...blankProject, published: true }, p)),
  };
}

export function restHeaders(token?: string): Record<string, string> {
  const key = supabaseAnonKey ?? "";
  const h: Record<string, string> = { apikey: key };
  // Legacy anon keys are JWTs and double as the bearer token; new publishable keys are not.
  if (token) h.Authorization = `Bearer ${token}`;
  else if (key.startsWith("eyJ")) h.Authorization = `Bearer ${key}`;
  return h;
}

async function fetchPublished(): Promise<unknown | null> {
  if (!supabaseConfigured) return null;
  const request =
    window.__vbuildContent ??
    fetch(`${supabaseUrl}/rest/v1/site_content?id=eq.${CONTENT_ID}&select=data,updated_at`, {
      headers: restHeaders(),
    })
      .then((r) => (r.ok ? (r.json() as Promise<Row[]>) : null))
      .catch(() => null);
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS));
  const rows = await Promise.race([request, timeout]);
  return rows?.[0]?.data ?? null;
}

function readJson(storage: Storage, key: string): unknown | null {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

let current: SiteContent = defaultContent;
let preview = false;

export async function loadContent(): Promise<SiteContent> {
  const params = new URLSearchParams(window.location.search);
  if (params.has("preview")) sessionStorage.setItem(PREVIEW_FLAG, "1");
  preview = sessionStorage.getItem(PREVIEW_FLAG) === "1" && !!localStorage.getItem(DRAFT_KEY);

  if (preview) {
    current = normalizeContent(readJson(localStorage, DRAFT_KEY));
    // Follow the editor: reload when the draft changes in the admin tab.
    let timer = 0;
    window.addEventListener("storage", (e) => {
      if (e.key !== DRAFT_KEY) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => window.location.reload(), 500);
    });
  } else {
    const published = await fetchPublished();
    if (published) {
      current = normalizeContent(published);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(published));
      } catch {
        // Storage full or blocked: the cache is only a fallback.
      }
    } else {
      const cached = readJson(localStorage, CACHE_KEY);
      current = cached ? normalizeContent(cached) : defaultContent;
    }
  }
  applySeo(current);
  return current;
}

export function exitPreview() {
  sessionStorage.removeItem(PREVIEW_FLAG);
  const url = new URL(window.location.href);
  url.searchParams.delete("preview");
  window.location.replace(url.toString());
}

function applySeo(c: SiteContent) {
  document.title = c.settings.seoTitle;
  const set = (selector: string, value: string) =>
    document.querySelector<HTMLMetaElement>(selector)?.setAttribute("content", value);
  set('meta[name="description"]', c.settings.seoDescription);
  set('meta[property="og:title"]', c.settings.seoTitle);
  set('meta[name="twitter:title"]', c.settings.seoTitle);
  set('meta[property="og:description"]', c.settings.seoDescription);
  set('meta[name="twitter:description"]', c.settings.seoDescription);
}

/** The content for this page load (set once, before React mounts). */
export function getContent(): SiteContent {
  return current;
}

export function useContent(): SiteContent {
  return current;
}

export function isPreview(): boolean {
  return preview;
}

/** Projects shown on the site; unpublished ones are visible only in preview. */
export function visibleProjects(c: SiteContent): Project[] {
  return preview ? c.projects : c.projects.filter((p) => p.published);
}

export function whatsappUrl(c: SiteContent): string {
  return `https://wa.me/${c.settings.whatsapp.replace(/\D/g, "")}`;
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Eye,
  Loader2,
  LogOut,
  RotateCcw,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { defaultContent } from "@/content/defaults";
import { DRAFT_KEY, normalizeContent } from "@/content/store";
import type { SiteContent } from "@/content/types";
import { cn } from "@/lib/utils";
import logoImage from "@/assets/vbuild-mark.webp";
import { CONTENT_ID, supabase, timeAgo, validate, type Problem } from "./lib";
import { COLLECTIONS, SECTIONS, type Collection } from "./sections";
import { CollectionView, HistoryView, SectionView, StatusView } from "./views";

const LOCAL_DRAFT = "vbuild:admin-draft";

type Published = { content: SiteContent; updatedAt: string | null; exists: boolean };
export type Toast = { tone: "ok" | "error"; text: string } | null;

/** Everything the views need to read and change the draft. */
export type EditorApi = {
  draft: SiteContent;
  published: Published;
  update: (fn: (c: SiteContent) => SiteContent) => void;
  replaceDraft: (c: SiteContent, note: string) => void;
  go: (view: string) => void;
  preview: (path: string) => void;
  toast: (t: Toast) => void;
};

function readLocalDraft(): { base: string | null; data: unknown } | null {
  try {
    const raw = localStorage.getItem(LOCAL_DRAFT);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const sameContent = (a: SiteContent, b: SiteContent) => JSON.stringify(a) === JSON.stringify(b);

export function Editor({ session }: { session: Session }) {
  const [published, setPublished] = useState<Published | null>(null);
  const [draft, setDraft] = useState<SiteContent | null>(null);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState(() => window.location.hash.slice(1) || "status");
  const [toast, setToast] = useState<Toast>(null);
  const [publishing, setPublishing] = useState(false);
  const [problems, setProblems] = useState<Problem[] | null>(null);
  const [restoredDraft, setRestoredDraft] = useState(false);

  // Load the published document (or start from the bundled defaults the first time).
  const load = useCallback(async () => {
    setLoadError("");
    const { data, error } = await supabase!
      .from("site_content")
      .select("data, updated_at")
      .eq("id", CONTENT_ID)
      .maybeSingle();
    if (error) {
      setLoadError(error.message);
      return;
    }
    const pub: Published = data
      ? { content: normalizeContent(data.data), updatedAt: data.updated_at, exists: true }
      : { content: defaultContent, updatedAt: null, exists: false };
    setPublished(pub);
    const local = readLocalDraft();
    if (local && local.base === pub.updatedAt) {
      const restored = normalizeContent(local.data);
      setDraft(restored);
      setRestoredDraft(!sameContent(restored, pub.content));
    } else {
      setDraft(pub.content);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const dirty = useMemo(
    () => !!draft && !!published && (!published.exists || !sameContent(draft, published.content)),
    [draft, published],
  );

  // Keep the draft safe across reloads, and feed the preview tab.
  useEffect(() => {
    if (!draft || !published) return;
    const t = window.setTimeout(() => {
      try {
        if (dirty)
          localStorage.setItem(
            LOCAL_DRAFT,
            JSON.stringify({ base: published.updatedAt, data: draft }),
          );
        else localStorage.removeItem(LOCAL_DRAFT);
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {
        // Ignore quota errors; publishing still works.
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [draft, published, dirty]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    const onHash = () => setView(window.location.hash.slice(1) || "status");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const toastTimer = useRef(0);
  const showToast = useCallback((t: Toast) => {
    setToast(t);
    window.clearTimeout(toastTimer.current);
    if (t)
      toastTimer.current = window.setTimeout(
        () => setToast(null),
        t.tone === "error" ? 8000 : 4000,
      );
  }, []);

  const go = useCallback((v: string) => {
    window.history.replaceState(null, "", `#${v}`);
    setView(v);
    document.getElementById("admin-main")?.scrollTo({ top: 0 });
  }, []);

  const api: EditorApi | null =
    draft && published
      ? {
          draft,
          published,
          update: (fn) => setDraft((d) => (d ? fn(d) : d)),
          replaceDraft: (c, note) => {
            setDraft(c);
            showToast({ tone: "ok", text: note });
          },
          go,
          toast: showToast,
          preview: (path) => {
            localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
            const [p, hash] = path.split("#");
            window.open(`${p}?preview=1${hash ? `#${hash}` : ""}`, "vbuild-preview");
          },
        }
      : null;

  const publish = async () => {
    if (!draft || !published) return;
    const found = validate(draft);
    if (found.length) return setProblems(found);
    setPublishing(true);
    const query = published.exists
      ? supabase!
          .from("site_content")
          .update({ data: draft })
          .eq("id", CONTENT_ID)
          // Only overwrite the version this editor started from.
          .eq("updated_at", published.updatedAt!)
          .select("updated_at")
      : supabase!.from("site_content").insert({ id: CONTENT_ID, data: draft }).select("updated_at");
    const { data, error } = await query;
    setPublishing(false);
    if (error) return showToast({ tone: "error", text: `Couldn't publish: ${error.message}` });
    if (!data?.length) {
      return showToast({
        tone: "error",
        text: "The site was published from somewhere else since you opened the editor. Your changes are kept here. Reload to see the newer version first.",
      });
    }
    setPublished({ content: draft, updatedAt: data[0].updated_at, exists: true });
    setRestoredDraft(false);
    localStorage.removeItem(LOCAL_DRAFT);
    showToast({ tone: "ok", text: "Published. New visitors see it right away." });
  };

  const discard = () => {
    if (!published) return;
    if (!window.confirm("Throw away all unpublished changes?")) return;
    setDraft(published.content);
    setRestoredDraft(false);
    localStorage.removeItem(LOCAL_DRAFT);
  };

  if (loadError)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground">
        <AlertTriangle className="h-6 w-6 text-destructive" />
        <p className="max-w-md text-sm text-muted-foreground">
          Couldn't load the site content: {loadError}. If you just created the project, run{" "}
          <code>supabase/setup.sql</code> first. If it was paused, resume it in the Supabase
          dashboard.
        </p>
        <Button variant="outline" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  if (!api)
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <TopBar
        email={session.user.email ?? ""}
        dirty={dirty}
        firstPublish={!published!.exists}
        updatedAt={published!.updatedAt}
        publishing={publishing}
        onPublish={() => void publish()}
        onDiscard={discard}
        onPreview={() => api.preview(previewPathFor(view, api.draft))}
      />
      <div className="flex min-h-0 flex-1">
        <Sidebar view={view} draft={api.draft} go={go} />
        <main id="admin-main" className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 pb-24 pt-6 md:px-8 md:pt-10">
            <MobileNav view={view} draft={api.draft} go={go} />
            {restoredDraft && (
              <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
                <span>Restored unpublished changes from your last session.</span>
                <button
                  type="button"
                  onClick={discard}
                  className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                >
                  Discard
                </button>
              </div>
            )}
            {!published!.exists && (
              <div className="mb-6 rounded-xl border border-border bg-card/40 px-4 py-3 text-sm text-muted-foreground">
                Nothing is published to Supabase yet, so the site is showing the content it ships
                with. Publish once to take it over from here.
              </div>
            )}
            <ViewRouter view={view} api={api} />
          </div>
        </main>
      </div>

      <Dialog open={!!problems} onOpenChange={(o) => !o && setProblems(null)}>
        <DialogContent className="glass-panel max-w-md rounded-2xl border-border">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Fix these before publishing</DialogTitle>
            <DialogDescription>
              They would break a page or a link on the live site.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-sm">
            {problems?.map((p, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="text-left hover:text-primary"
                  onClick={() => {
                    setProblems(null);
                    go(p.section);
                  }}
                >
                  <span className="font-medium">{p.where}</span>{" "}
                  <span className="text-muted-foreground">{p.message}</span>
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      {toast && (
        <div
          role="status"
          className={cn(
            "fixed bottom-5 left-1/2 z-50 flex w-max max-w-[min(92vw,34rem)] -translate-x-1/2 items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-xl",
            toast.tone === "ok"
              ? "border-primary/30 bg-background/90"
              : "border-destructive/40 bg-background/95",
          )}
        >
          {toast.tone === "ok" ? (
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          )}
          {toast.text}
        </div>
      )}
    </div>
  );
}

function previewPathFor(view: string, draft: SiteContent): string {
  const [coll, idx] = view.split(":");
  if ((coll === "projects" || coll === "services") && idx !== undefined) {
    const item = draft[coll][Number(idx)];
    if (item?.slug) return `${COLLECTIONS[coll].route}/${item.slug}`;
  }
  if (coll === "projects") return "/#work";
  if (coll === "services") return "/#services";
  return SECTIONS.find((s) => s.id === view)?.previewPath ?? "/";
}

function ViewRouter({ view, api }: { view: string; api: EditorApi }) {
  const [base, idx] = view.split(":");
  if (base === "projects" || base === "services")
    return (
      <CollectionView
        api={api}
        collection={base as Collection}
        index={idx === undefined ? null : Number(idx)}
      />
    );
  if (base === "history") return <HistoryView api={api} />;
  const section = SECTIONS.find((s) => s.id === base);
  if (section) return <SectionView api={api} section={section} />;
  return <StatusView api={api} />;
}

function TopBar(props: {
  email: string;
  dirty: boolean;
  firstPublish: boolean;
  updatedAt: string | null;
  publishing: boolean;
  onPublish: () => void;
  onDiscard: () => void;
  onPreview: () => void;
}) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-6">
      <a href="#status" className="flex min-w-0 items-center gap-2.5">
        <img src={logoImage} alt="" className="h-8 w-8 rounded-full object-cover" />
        <span className="hidden font-display text-sm font-semibold tracking-[0.16em] sm:inline">
          VBUILD
        </span>
        <span className="hidden text-xs text-muted-foreground sm:inline">admin</span>
      </a>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "hidden items-center gap-1.5 text-xs md:flex",
            props.dirty ? "text-primary" : "text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              props.dirty ? "bg-primary" : "bg-muted-foreground/50",
            )}
          />
          {props.dirty ? "Unpublished changes" : `Published ${timeAgo(props.updatedAt)}`}
        </span>
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="hidden items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground lg:inline-flex"
        >
          Live site <ExternalLink className="h-3 w-3" />
        </a>
        <Button
          variant="ghost"
          size="sm"
          onClick={props.onPreview}
          title="Open this page with your unpublished changes"
        >
          <Eye /> <span className="hidden sm:inline">Preview</span>
        </Button>
        {props.dirty && !props.firstPublish && (
          <Button
            variant="ghost"
            size="sm"
            onClick={props.onDiscard}
            title="Discard unpublished changes"
          >
            <RotateCcw /> <span className="hidden sm:inline">Discard</span>
          </Button>
        )}
        <Button size="sm" disabled={!props.dirty || props.publishing} onClick={props.onPublish}>
          {props.publishing ? <Loader2 className="animate-spin" /> : <Upload />} Publish
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title={`Sign out ${props.email}`}
          aria-label="Sign out"
          onClick={() => void supabase!.auth.signOut()}
        >
          <LogOut />
        </Button>
      </div>
    </header>
  );
}

type NavItem = { id: string; label: string; indent?: boolean; muted?: boolean };

function navGroups(draft: SiteContent): { label: string; items: NavItem[] }[] {
  const byGroup = (g: string) =>
    SECTIONS.filter((s) => s.group === g).map((s) => ({ id: s.id, label: s.label }));
  return [
    { label: "", items: [{ id: "status", label: "Overview" }] },
    { label: "Site", items: byGroup("Site") },
    { label: "Home page", items: byGroup("Home page") },
    {
      label: "Projects",
      items: [
        { id: "projects", label: "All projects" },
        ...draft.projects.map((p, i) => ({
          id: `projects:${i}`,
          label: p.title || "Untitled",
          indent: true,
          muted: !p.published,
        })),
      ],
    },
    {
      label: "Services",
      items: [
        { id: "services", label: "All services" },
        ...draft.services.map((s, i) => ({
          id: `services:${i}`,
          label: s.title || "Untitled",
          indent: true,
        })),
      ],
    },
    { label: "Detail pages", items: byGroup("Detail pages") },
    { label: "", items: [{ id: "history", label: "History & backups" }] },
  ];
}

function Sidebar({
  view,
  draft,
  go,
}: {
  view: string;
  draft: SiteContent;
  go: (v: string) => void;
}) {
  return (
    <nav
      aria-label="Admin sections"
      className="hidden w-64 shrink-0 overflow-y-auto border-r border-border px-3 py-5 md:block"
    >
      {navGroups(draft).map((g, gi) => (
        <div key={gi} className="mb-5">
          {g.label && (
            <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/70">
              {g.label}
            </p>
          )}
          {g.items.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => go(it.id)}
              className={cn(
                "block w-full truncate rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                it.indent && "pl-5 text-[13px]",
                view === it.id
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                it.muted && view !== it.id && "opacity-60",
              )}
            >
              {it.label}
              {it.muted && (
                <span className="ml-1.5 text-[10px] uppercase tracking-wider">draft</span>
              )}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}

function MobileNav({
  view,
  draft,
  go,
}: {
  view: string;
  draft: SiteContent;
  go: (v: string) => void;
}) {
  return (
    <select
      aria-label="Section"
      value={view}
      onChange={(e) => go(e.target.value)}
      className="mb-6 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm md:hidden"
    >
      {navGroups(draft).map((g, gi) => (
        <optgroup key={gi} label={g.label || "—"}>
          {g.items.map((it) => (
            <option key={it.id} value={it.id}>
              {it.indent ? `   ${it.label}` : it.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

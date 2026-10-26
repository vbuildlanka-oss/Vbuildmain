import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Copy,
  Download,
  Eye,
  FileUp,
  HeartPulse,
  ImageIcon,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { blankProject, blankService } from "@/content/defaults";
import { normalizeContent } from "@/content/store";
import type { Project, Service, SiteContent } from "@/content/types";
import { cn } from "@/lib/utils";
import type { EditorApi } from "./Editor";
import { Card, FieldList, move, TextInput, Toggle } from "./fields";
import { CONTENT_ID, slugify, supabase, timeAgo, uniqueSlug } from "./lib";
import { COLLECTIONS, type Collection, type SectionDef } from "./sections";

function Heading(props: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-[-0.03em]">{props.title}</h1>
        {props.description && (
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            {props.description}
          </p>
        )}
      </div>
      {props.actions && <div className="flex shrink-0 flex-wrap gap-2">{props.actions}</div>}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Single sections (hero, about, …)
// -----------------------------------------------------------------------------

export function SectionView({ api, section }: { api: EditorApi; section: SectionDef }) {
  const value = api.draft[section.key] as unknown as Record<string, unknown>;
  return (
    <>
      <Heading
        title={section.label}
        description={section.description}
        actions={
          <Button variant="outline" size="sm" onClick={() => api.preview(section.previewPath)}>
            <Eye /> Preview
          </Button>
        }
      />
      <Card>
        <FieldList
          fields={section.fields}
          value={value}
          onChange={(key, v) =>
            api.update((c) => ({
              ...c,
              [section.key]: { ...(c[section.key] as object), [key]: v },
            }))
          }
        />
      </Card>
    </>
  );
}

// -----------------------------------------------------------------------------
// Projects & services
// -----------------------------------------------------------------------------

type Item = Project | Service;

function itemsOf(c: SiteContent, coll: Collection): Item[] {
  return c[coll];
}

function withItems(c: SiteContent, coll: Collection, items: Item[]): SiteContent {
  return { ...c, [coll]: items };
}

export function CollectionView(props: {
  api: EditorApi;
  collection: Collection;
  index: number | null;
}) {
  const { api, collection, index } = props;
  const items = itemsOf(api.draft, collection);
  if (index !== null && items[index]) return <ItemEditor {...props} index={index} />;
  return <CollectionList api={api} collection={collection} />;
}

function CollectionList({ api, collection }: { api: EditorApi; collection: Collection }) {
  const meta = COLLECTIONS[collection];
  const items = itemsOf(api.draft, collection);
  const [creating, setCreating] = useState(false);
  const setItems = (next: Item[]) => api.update((c) => withItems(c, collection, next));

  return (
    <>
      <Heading
        title={meta.label}
        description={
          collection === "projects"
            ? "Shown in this order in the work section. Projects marked as draft stay hidden from the site until you publish them."
            : "Shown in this order on the home page. Each one has its own page."
        }
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus /> New {meta.singular}
          </Button>
        }
      />
      <div className="space-y-2">
        {items.map((item, i) => {
          const isProject = collection === "projects";
          const project = item as Project;
          return (
            <div
              key={i}
              className="group flex items-center gap-3 rounded-xl border border-border bg-card/40 p-2.5 transition-colors hover:border-primary/40"
            >
              {isProject && (
                <div className="h-12 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
                  {project.image ? (
                    <img src={project.image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="m-auto mt-3.5 h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={() => api.go(`${collection}:${i}`)}
                className="min-w-0 flex-1 px-1 text-left"
              >
                <p className="truncate text-sm font-medium">{item.title || "Untitled"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {meta.route}/{item.slug || "…"}
                  {isProject && !project.published && (
                    <span className="ml-2 uppercase tracking-wider text-primary">draft</span>
                  )}
                </p>
              </button>
              <div className="flex shrink-0 items-center">
                <IconButton
                  label="Move up"
                  disabled={i === 0}
                  onClick={() => setItems(move(items, i, i - 1))}
                >
                  <ArrowUp className="h-4 w-4" />
                </IconButton>
                <IconButton
                  label="Move down"
                  disabled={i === items.length - 1}
                  onClick={() => setItems(move(items, i, i + 1))}
                >
                  <ArrowDown className="h-4 w-4" />
                </IconButton>
                <IconButton label="Edit" onClick={() => api.go(`${collection}:${i}`)}>
                  <ArrowRight className="h-4 w-4" />
                </IconButton>
              </div>
            </div>
          );
        })}
        {items.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">Nothing here yet.</p>
        )}
      </div>
      <NewItemDialog api={api} collection={collection} open={creating} onOpenChange={setCreating} />
    </>
  );
}

function IconButton(props: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className={cn(
        "rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30",
        props.danger && "hover:text-destructive",
      )}
    >
      {props.children}
    </button>
  );
}

/** Quick start: a title is enough; the slug follows it, and you can copy an existing entry's layout. */
function NewItemDialog(props: {
  api: EditorApi;
  collection: Collection;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { api, collection } = props;
  const meta = COLLECTIONS[collection];
  const items = itemsOf(api.draft, collection);
  const [title, setTitle] = useState("");
  const [template, setTemplate] = useState("blank");

  useEffect(() => {
    if (props.open) {
      setTitle("");
      setTemplate("blank");
    }
  }, [props.open]);

  const slug = uniqueSlug(
    title,
    items.map((i) => i.slug),
  );
  const create = () => {
    const base: Item =
      template === "blank"
        ? collection === "projects"
          ? { ...blankProject }
          : { ...blankService }
        : structuredClone(items[Number(template)]);
    const item = { ...base, title: title.trim(), slug } as Item;
    if (collection === "projects") (item as Project).published = false;
    // New projects go first (newest work leads); new services go last.
    const next = collection === "projects" ? [item, ...items] : [...items, item];
    api.update((c) => withItems(c, collection, next));
    props.onOpenChange(false);
    api.go(`${collection}:${collection === "projects" ? 0 : next.length - 1}`);
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="glass-panel max-w-md rounded-2xl border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">New {meta.singular}</DialogTitle>
          <DialogDescription>
            {collection === "projects"
              ? "It starts as a draft, so nothing shows on the site until you switch it on and publish."
              : "It appears on the site after you publish."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) create();
          }}
        >
          <TextInput
            label="Title"
            value={title}
            onChange={setTitle}
            placeholder={
              collection === "projects" ? "e.g. Atlas — Fleet Dashboard" : "e.g. Mobile Apps"
            }
          />
          <p className="-mt-2 text-xs text-muted-foreground">
            Page address: {meta.route}/
            <span className="text-foreground">{title.trim() ? slug : "…"}</span>
          </p>
          {items.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Start from
              </p>
              <select
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="blank">Blank</option>
                {items.map((it, i) => (
                  <option key={i} value={i}>
                    Copy of “{it.title}”
                  </option>
                ))}
              </select>
            </div>
          )}
          <Button type="submit" className="w-full" disabled={!title.trim()}>
            Create and edit
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ItemEditor({
  api,
  collection,
  index,
}: {
  api: EditorApi;
  collection: Collection;
  index: number;
}) {
  const meta = COLLECTIONS[collection];
  const items = itemsOf(api.draft, collection);
  const item = items[index];
  const isProject = collection === "projects";
  const [confirmDelete, setConfirmDelete] = useState(false);
  const publishedSlugs = itemsOf(api.published.content, collection).map((i) => i.slug);
  const slugClash = items.some((it, i) => i !== index && it.slug === item.slug);

  const setItem = (patch: Partial<Item>) =>
    api.update((c) =>
      withItems(
        c,
        collection,
        itemsOf(c, collection).map((it, i) => (i === index ? ({ ...it, ...patch } as Item) : it)),
      ),
    );

  const onField = (key: string, v: unknown) => {
    // The slug follows the title until it's edited by hand.
    if (key === "title" && (item.slug === "" || item.slug === slugify(item.title))) {
      setItem({
        title: v as string,
        slug: uniqueSlug(
          v as string,
          items.filter((_, i) => i !== index).map((i) => i.slug),
        ),
      });
    } else {
      setItem({ [key]: v } as Partial<Item>);
    }
  };

  const duplicate = () => {
    const copy = structuredClone(item);
    copy.title = `${item.title} (copy)`;
    copy.slug = uniqueSlug(
      copy.title,
      items.map((i) => i.slug),
    );
    if (isProject) (copy as Project).published = false;
    const next = [...items];
    next.splice(index + 1, 0, copy);
    api.update((c) => withItems(c, collection, next));
    api.go(`${collection}:${index + 1}`);
  };

  const remove = () => {
    api.update((c) =>
      withItems(
        c,
        collection,
        items.filter((_, i) => i !== index),
      ),
    );
    setConfirmDelete(false);
    api.go(collection);
    api.toast({
      tone: "ok",
      text: `Deleted. Publish to remove it from the site, or Discard to undo.`,
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => api.go(collection)}
        className="mb-4 text-xs text-muted-foreground hover:text-foreground"
      >
        ← {meta.label}
      </button>
      <Heading
        title={item.title || `Untitled ${meta.singular}`}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => api.preview(`${meta.route}/${item.slug}`)}
              disabled={!item.slug}
            >
              <Eye /> Preview
            </Button>
            <Button variant="outline" size="sm" onClick={duplicate}>
              <Copy /> Duplicate
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              className="hover:text-destructive"
            >
              <Trash2 /> Delete
            </Button>
          </>
        }
      />

      <div className="space-y-4">
        <Card>
          <div className="space-y-5">
            {isProject && (
              <Toggle
                label="Show on the site"
                help="Off = draft. It's saved, but hidden from visitors."
                value={(item as Project).published}
                onChange={(v) => setItem({ published: v } as Partial<Project>)}
              />
            )}
            <div>
              <TextInput
                label="Page address (slug)"
                value={item.slug}
                onChange={(v) => setItem({ slug: slugify(v) || v.toLowerCase() })}
                help={`${window.location.origin}${meta.route}/${item.slug || "…"}`}
              />
              {slugClash && (
                <p className="mt-1.5 text-xs text-destructive">
                  Another {meta.singular} already uses this address.
                </p>
              )}
              {!slugClash &&
                publishedSlugs.length > 0 &&
                api.published.exists &&
                !publishedSlugs.includes(item.slug) &&
                index < publishedSlugs.length && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Changing the address breaks links people may already have to this page.
                  </p>
                )}
            </div>
          </div>
        </Card>
        <Card>
          <FieldList
            fields={meta.fields}
            value={item as unknown as Record<string, unknown>}
            onChange={onField}
          />
        </Card>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="glass-panel max-w-sm rounded-2xl border-border">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              Delete “{item.title || "Untitled"}”?
            </DialogTitle>
            <DialogDescription>
              It's removed from your draft. Nothing changes on the live site until you publish.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// -----------------------------------------------------------------------------
// Overview
// -----------------------------------------------------------------------------

type Heartbeat = { pinged_at: string; source: string; ping_count: number };

export function StatusView({ api }: { api: EditorApi }) {
  const [beat, setBeat] = useState<Heartbeat | null | "error">(null);
  const [pinging, setPinging] = useState(false);
  const [server, setServer] = useState<{ r2: boolean; supabase: boolean } | null | "missing">(null);

  const loadBeat = async () => {
    const { data, error } = await supabase!
      .from("keep_alive")
      .select("pinged_at, source, ping_count")
      .eq("id", 1)
      .maybeSingle();
    setBeat(error || !data ? "error" : (data as Heartbeat));
  };
  useEffect(() => {
    void loadBeat();
    fetch("/api/upload")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setServer, () => setServer("missing"));
  }, []);

  const ping = async () => {
    setPinging(true);
    const { error } = await supabase!.rpc("keep_alive", { caller: "admin" });
    setPinging(false);
    if (error) api.toast({ tone: "error", text: `Ping failed: ${error.message}` });
    void loadBeat();
  };

  const visible = api.draft.projects.filter((p) => p.published).length;
  const beatAge =
    beat && beat !== "error" ? (Date.now() - new Date(beat.pinged_at).getTime()) / 864e5 : null;

  return (
    <>
      <Heading
        title="Overview"
        description="Edit any section from the menu. Changes stay private until you press Publish."
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Card title="Content">
          <p className="text-sm text-muted-foreground">
            {api.published.exists
              ? `Last published ${timeAgo(api.published.updatedAt)}.`
              : "Not published to Supabase yet."}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {api.draft.projects.length} projects ({visible} on the site) ·{" "}
            {api.draft.services.length} services · {api.draft.faq.items.length} FAQs
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => api.go("projects")}>
              <Plus /> Add a project
            </Button>
            <Button size="sm" variant="outline" onClick={() => api.go("hero")}>
              Edit hero
            </Button>
          </div>
        </Card>

        <Card
          title={
            <span className="inline-flex items-center gap-2">
              <HeartPulse className="h-4 w-4 text-primary" /> Supabase keep-alive
            </span>
          }
        >
          {beat === null ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : beat === "error" ? (
            <p className="text-sm text-destructive">
              Couldn't read the heartbeat. Has supabase/setup.sql been run?
            </p>
          ) : (
            <>
              <p
                className={cn(
                  "text-sm",
                  beatAge !== null && beatAge > 2 ? "text-destructive" : "text-muted-foreground",
                )}
              >
                Last ping {timeAgo(beat.pinged_at)} from{" "}
                <span className="text-foreground">{beat.source}</span> · {beat.ping_count} total
              </p>
              <p className="mt-1 text-xs text-muted-foreground/80">
                Vercel pings daily and GitHub Actions every 6 hours. Free projects pause after a
                quiet week.
              </p>
            </>
          )}
          <Button
            size="sm"
            variant="outline"
            className="mt-4"
            disabled={pinging}
            onClick={() => void ping()}
          >
            {pinging && <Loader2 className="animate-spin" />} Ping now
          </Button>
        </Card>

        <Card title="Image uploads (Cloudflare R2)">
          {server === null ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : server === "missing" ? (
            <p className="text-sm text-muted-foreground">
              The upload function isn't reachable here. It runs on Vercel.
            </p>
          ) : server.r2 ? (
            <p className="text-sm text-muted-foreground">
              Connected. Uploaded images are converted to WebP and served from R2.
            </p>
          ) : (
            <p className="text-sm text-destructive">
              Not configured: add the R2_* environment variables in Vercel (see ADMIN_SETUP.md).
            </p>
          )}
        </Card>

        <Card title="Preview">
          <p className="text-sm text-muted-foreground">
            Preview opens the site in another tab with your unpublished changes. It refreshes by
            itself as you edit.
          </p>
          <Button size="sm" variant="outline" className="mt-4" onClick={() => api.preview("/")}>
            <Eye /> Open preview
          </Button>
        </Card>
      </div>
    </>
  );
}

// -----------------------------------------------------------------------------
// History & backups
// -----------------------------------------------------------------------------

type Version = { id: number; saved_at: string };

export function HistoryView({ api }: { api: EditorApi }) {
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [error, setError] = useState("");
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase!
      .from("site_content_history")
      .select("id, saved_at")
      .eq("content_id", CONTENT_ID)
      .order("saved_at", { ascending: false })
      .limit(50)
      .then(({ data, error }) =>
        error ? setError(error.message) : setVersions(data as Version[]),
      );
  }, [api.published.updatedAt]);

  const restore = async (v: Version) => {
    setLoadingId(v.id);
    const { data, error } = await supabase!
      .from("site_content_history")
      .select("data")
      .eq("id", v.id)
      .single();
    setLoadingId(null);
    if (error) return api.toast({ tone: "error", text: error.message });
    api.replaceDraft(
      normalizeContent(data.data),
      `Loaded the version from ${new Date(v.saved_at).toLocaleString()}. Publish to make it live.`,
    );
  };

  const download = () => {
    const blob = new Blob([JSON.stringify(api.draft, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `vbuild-content-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      api.replaceDraft(
        normalizeContent(parsed),
        "Imported into the editor. Check it over, then publish.",
      );
    } catch {
      api.toast({ tone: "error", text: "That file isn't a valid content backup." });
    }
  };

  return (
    <>
      <Heading
        title="History & backups"
        description="Every publish is kept (the latest 50). Loading an old version puts it in the editor; nothing goes live until you publish it."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={download}>
              <Download /> Download backup
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <FileUp /> Import backup
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                void importFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </>
        }
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!versions && !error && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
      {versions?.length === 0 && (
        <p className="text-sm text-muted-foreground">No published versions yet.</p>
      )}
      <div className="space-y-2">
        {versions?.map((v, i) => (
          <div
            key={v.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/40 px-4 py-3"
          >
            <div>
              <p className="text-sm">{new Date(v.saved_at).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">
                {timeAgo(v.saved_at)}
                {i === 0 && " · live now"}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={loadingId === v.id}
              onClick={() => void restore(v)}
            >
              {loadingId === v.id && <Loader2 className="animate-spin" />} Load into editor
            </Button>
          </div>
        ))}
      </div>
    </>
  );
}

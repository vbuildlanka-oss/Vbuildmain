import { useId, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { uploadImage } from "./lib";

/**
 * Form building blocks for the admin. Each section describes its fields as
 * data (see sections.ts) and <FieldList> renders them, so adding an editable
 * field to the site usually takes one line.
 */

export type Field =
  | {
      kind: "text" | "textarea" | "url" | "email";
      key: string;
      label: string;
      help?: string;
      rows?: number;
      placeholder?: string;
    }
  | { kind: "image"; key: string; label: string; help?: string; folder: string }
  | { kind: "tags"; key: string; label: string; help?: string; placeholder?: string }
  | { kind: "lines"; key: string; label: string; help?: string; addLabel?: string }
  | { kind: "toggle"; key: string; label: string; help?: string }
  | {
      kind: "items";
      key: string;
      label: string;
      help?: string;
      fields: Field[];
      itemTitle: (item: Record<string, unknown>, index: number) => string;
      /** Fixed-length lists can be edited but not added to, removed from or reordered. */
      fixed?: boolean;
      newItem?: () => Record<string, unknown>;
      addLabel?: string;
    };

const control =
  "w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 transition-colors focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20";

function Label({ label, help, htmlFor }: { label: string; help?: string; htmlFor?: string }) {
  return (
    <div className="mb-1.5">
      <label
        htmlFor={htmlFor}
        className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
      >
        {label}
      </label>
      {help && <p className="mt-0.5 text-xs text-muted-foreground/70">{help}</p>}
    </div>
  );
}

export function TextInput(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  help?: string;
  type?: string;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
}) {
  const id = useId();
  return (
    <div>
      <Label label={props.label} help={props.help} htmlFor={id} />
      {props.multiline ? (
        <textarea
          id={id}
          rows={props.rows ?? 3}
          value={props.value}
          placeholder={props.placeholder}
          onChange={(e) => props.onChange(e.target.value)}
          className={cn(control, "resize-y leading-6")}
        />
      ) : (
        <input
          id={id}
          type={props.type ?? "text"}
          value={props.value}
          placeholder={props.placeholder}
          onChange={(e) => props.onChange(e.target.value)}
          className={control}
        />
      )}
    </div>
  );
}

export function Toggle(props: {
  label: string;
  help?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = useId();
  // Deliberately not a <label> wrapper: the browser forwards label clicks to the
  // switch, which can fire a second click and undo the toggle.
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={props.value}
        aria-labelledby={id}
        onClick={() => props.onChange(!props.value)}
        className={cn(
          "relative mt-0.5 h-5 w-9 shrink-0 cursor-pointer rounded-full border border-border transition-colors",
          props.value ? "bg-primary" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3.5 w-3.5 rounded-full bg-foreground transition-transform",
            props.value ? "translate-x-4 bg-primary-foreground" : "translate-x-0.5",
          )}
        />
      </button>
      <span>
        <span
          id={id}
          className="cursor-pointer text-sm text-foreground"
          onClick={() => props.onChange(!props.value)}
        >
          {props.label}
        </span>
        {props.help && <span className="block text-xs text-muted-foreground">{props.help}</span>}
      </span>
    </div>
  );
}

/** Chips: type and press Enter or comma; paste a comma-separated list to add several. */
export function TagsInput(props: {
  label: string;
  help?: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const id = useId();
  const add = (raw: string) => {
    const next = raw
      .split(/[,\n]/)
      .map((t) => t.trim())
      .filter((t) => t && !props.value.includes(t));
    if (next.length) props.onChange([...props.value, ...next]);
    setText("");
  };
  return (
    <div>
      <Label label={props.label} help={props.help} htmlFor={id} />
      <div className={cn(control, "flex flex-wrap items-center gap-1.5 py-1.5")}>
        {props.value.map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs"
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              onClick={() => props.onChange(props.value.filter((_, j) => j !== i))}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={text}
          placeholder={props.value.length ? "" : (props.placeholder ?? "Type and press Enter")}
          onChange={(e) =>
            e.target.value.includes(",") ? add(e.target.value) : setText(e.target.value)
          }
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(text);
            } else if (e.key === "Backspace" && !text && props.value.length) {
              props.onChange(props.value.slice(0, -1));
            }
          }}
          onBlur={() => text && add(text)}
          className="min-w-24 flex-1 bg-transparent py-0.5 text-sm outline-none"
        />
      </div>
    </div>
  );
}

function RowButtons(props: {
  index: number;
  count: number;
  onMove: (to: number) => void;
  onRemove: () => void;
  removeLabel: string;
}) {
  const btn =
    "rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30";
  return (
    <div className="flex shrink-0 items-center">
      <button
        type="button"
        className={btn}
        aria-label="Move up"
        disabled={props.index === 0}
        onClick={() => props.onMove(props.index - 1)}
      >
        <ArrowUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={btn}
        aria-label="Move down"
        disabled={props.index === props.count - 1}
        onClick={() => props.onMove(props.index + 1)}
      >
        <ArrowDown className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={cn(btn, "hover:text-destructive")}
        aria-label={props.removeLabel}
        onClick={props.onRemove}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** A list of single-line entries (bullet points). */
export function LinesInput(props: {
  label: string;
  help?: string;
  value: string[];
  onChange: (v: string[]) => void;
  addLabel?: string;
}) {
  return (
    <div>
      <Label label={props.label} help={props.help} />
      <div className="space-y-2">
        {props.value.map((line, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={line}
              onChange={(e) =>
                props.onChange(props.value.map((l, j) => (j === i ? e.target.value : l)))
              }
              className={control}
            />
            <RowButtons
              index={i}
              count={props.value.length}
              onMove={(to) => props.onChange(move(props.value, i, to))}
              onRemove={() => props.onChange(props.value.filter((_, j) => j !== i))}
              removeLabel="Remove line"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => props.onChange([...props.value, ""])}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          <Plus className="h-3.5 w-3.5" /> {props.addLabel ?? "Add line"}
        </button>
      </div>
    </div>
  );
}

export function ImageInput(props: {
  label: string;
  help?: string;
  value: string;
  onChange: (v: string) => void;
  folder: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("That isn't an image file.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      props.onChange(await uploadImage(file, props.folder));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <Label label={props.label} help={props.help} />
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void upload(e.dataTransfer.files[0]);
        }}
        className={cn(
          "flex flex-col gap-3 rounded-xl border border-dashed p-3 transition-colors sm:flex-row sm:items-center",
          drag ? "border-primary bg-primary/5" : "border-border",
        )}
      >
        <div className="relative flex aspect-[16/10] w-full shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted sm:w-48">
          {props.value ? (
            <img src={props.value} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus className="h-6 w-6 text-muted-foreground" />
          )}
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:border-primary/50 hover:bg-accent disabled:opacity-50"
            >
              <ImagePlus className="h-3.5 w-3.5" />{" "}
              {busy ? "Uploading…" : props.value ? "Replace" : "Upload"}
            </button>
            {props.value && (
              <button
                type="button"
                onClick={() => props.onChange("")}
                className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-destructive"
              >
                Remove
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Drop an image here or upload one. It's resized and converted to WebP automatically.
          </p>
          <input
            value={props.value}
            onChange={(e) => props.onChange(e.target.value)}
            placeholder="…or paste an image URL"
            className={cn(control, "py-1.5 text-xs")}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void upload(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

/** Renders a section's fields against `value` (an object), reporting changes per key. */
export function FieldList(props: {
  fields: Field[];
  value: Record<string, unknown>;
  onChange: (key: string, v: unknown) => void;
}) {
  return (
    <div className="space-y-5">
      {props.fields.map((f) => (
        <FieldControl
          key={f.key}
          field={f}
          value={props.value[f.key]}
          onChange={(v) => props.onChange(f.key, v)}
        />
      ))}
    </div>
  );
}

function FieldControl({
  field: f,
  value,
  onChange,
}: {
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  switch (f.kind) {
    case "text":
    case "url":
    case "email":
      return (
        <TextInput
          label={f.label}
          help={f.help}
          type={f.kind === "text" ? "text" : f.kind}
          placeholder={f.placeholder}
          value={String(value ?? "")}
          onChange={onChange}
        />
      );
    case "textarea":
      return (
        <TextInput
          label={f.label}
          help={f.help}
          multiline
          rows={f.rows}
          placeholder={f.placeholder}
          value={String(value ?? "")}
          onChange={onChange}
        />
      );
    case "image":
      return (
        <ImageInput
          label={f.label}
          help={f.help}
          folder={f.folder}
          value={String(value ?? "")}
          onChange={onChange}
        />
      );
    case "tags":
      return (
        <TagsInput
          label={f.label}
          help={f.help}
          placeholder={f.placeholder}
          value={(value as string[]) ?? []}
          onChange={onChange}
        />
      );
    case "lines":
      return (
        <LinesInput
          label={f.label}
          help={f.help}
          addLabel={f.addLabel}
          value={(value as string[]) ?? []}
          onChange={onChange}
        />
      );
    case "toggle":
      return <Toggle label={f.label} help={f.help} value={Boolean(value)} onChange={onChange} />;
    case "items":
      return (
        <ItemsInput
          field={f}
          value={(value as Record<string, unknown>[]) ?? []}
          onChange={onChange}
        />
      );
  }
}

function ItemsInput({
  field,
  value,
  onChange,
}: {
  field: Extract<Field, { kind: "items" }>;
  value: Record<string, unknown>[];
  onChange: (v: Record<string, unknown>[]) => void;
}) {
  return (
    <div>
      <Label label={field.label} help={field.help} />
      <div className="space-y-3">
        {value.map((item, i) => (
          <Card
            key={i}
            title={field.itemTitle(item, i)}
            actions={
              field.fixed ? undefined : (
                <RowButtons
                  index={i}
                  count={value.length}
                  onMove={(to) => onChange(move(value, i, to))}
                  onRemove={() => onChange(value.filter((_, j) => j !== i))}
                  removeLabel="Remove item"
                />
              )
            }
          >
            <FieldList
              fields={field.fields}
              value={item}
              onChange={(key, v) =>
                onChange(value.map((it, j) => (j === i ? { ...it, [key]: v } : it)))
              }
            />
          </Card>
        ))}
        {!field.fixed && field.newItem && (
          <button
            type="button"
            onClick={() => onChange([...value, field.newItem!()])}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> {field.addLabel ?? "Add item"}
          </button>
        )}
      </div>
    </div>
  );
}

export function Card(props: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-card/40 p-4 md:p-5", props.className)}>
      {(props.title || props.actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-sm font-medium text-foreground">{props.title}</p>
          {props.actions}
        </div>
      )}
      {props.children}
    </div>
  );
}

import type { Project, Service, SiteContent } from "@/content/types";
import type { Field } from "./fields";

/**
 * What the admin can edit, section by section. Each entry points at an object
 * in the content document and lists its fields. To make something new
 * editable, add the field to types.ts + defaults.ts, then list it here.
 */

export type SectionDef = {
  id: string;
  group: "Site" | "Home page" | "Detail pages";
  label: string;
  description: string;
  key: Exclude<keyof SiteContent, "version" | "services" | "projects">;
  /** Where on the site this appears, for the Preview button. */
  previewPath: string;
  fields: Field[];
};

export const SECTIONS: SectionDef[] = [
  {
    id: "settings",
    group: "Site",
    label: "Site settings",
    description:
      "Name, contact details, social links and search-engine text used across every page.",
    key: "settings",
    previewPath: "/",
    fields: [
      { kind: "text", key: "siteName", label: "Site name" },
      { kind: "text", key: "seoTitle", label: "Browser tab & search title" },
      {
        kind: "textarea",
        key: "seoDescription",
        label: "Search description",
        rows: 2,
        help: "Shown under the title in Google results. About 150 characters.",
      },
      { kind: "email", key: "email", label: "Contact email" },
      {
        kind: "text",
        key: "whatsapp",
        label: "WhatsApp number",
        help: "With country code, digits only, e.g. 94719802526.",
      },
      { kind: "url", key: "linkedin", label: "LinkedIn URL" },
      { kind: "url", key: "github", label: "GitHub URL" },
      { kind: "text", key: "startProjectLabel", label: "“Start a project” button (header & menu)" },
      { kind: "text", key: "menuLocation", label: "Location line in the mobile menu" },
      { kind: "text", key: "footerLocation", label: "Location line in the footer" },
      { kind: "text", key: "copyright", label: "Copyright line" },
    ],
  },
  {
    id: "nav",
    group: "Site",
    label: "Navigation",
    description: "Labels of the header links. Each one scrolls to its section.",
    key: "nav",
    previewPath: "/",
    fields: [
      { kind: "text", key: "process", label: "Process link" },
      { kind: "text", key: "services", label: "Services link" },
      { kind: "text", key: "work", label: "Work link" },
      { kind: "text", key: "faq", label: "FAQ link" },
    ],
  },
  {
    id: "hero",
    group: "Home page",
    label: "Hero",
    description: "The first screen, next to the particle sphere.",
    key: "hero",
    previewPath: "/",
    fields: [
      { kind: "text", key: "eyebrow", label: "Small line above the headline" },
      { kind: "textarea", key: "headline", label: "Headline", rows: 2 },
      {
        kind: "text",
        key: "headlineAccent",
        label: "Headline ending (gradient)",
        help: "Drawn in the ice-to-violet gradient right after the headline.",
      },
      { kind: "textarea", key: "body", label: "Intro paragraph", rows: 3 },
      { kind: "text", key: "primaryCta", label: "Main button" },
      { kind: "text", key: "secondaryCta", label: "Second button (scrolls to work)" },
      { kind: "text", key: "scrollCue", label: "Scroll hint (bottom right)" },
    ],
  },
  {
    id: "process",
    group: "Home page",
    label: "Process story",
    description:
      "The pinned 3D story. There are always four chapters: they drive the sphere → cloud → brain → lit-up brain beats.",
    key: "process",
    previewPath: "/#process",
    fields: [
      { kind: "text", key: "eyebrow", label: "Section label" },
      {
        kind: "items",
        key: "chapters",
        label: "Chapters",
        fixed: true,
        itemTitle: (c, i) => `${i + 1}. ${String(c.step || "Chapter")}`,
        fields: [
          { kind: "text", key: "step", label: "Step name" },
          { kind: "text", key: "title", label: "Heading" },
          { kind: "textarea", key: "detail", label: "Paragraph", rows: 3 },
        ],
      },
    ],
  },
  {
    id: "about",
    group: "Home page",
    label: "About",
    description: "Studio intro and the founder card.",
    key: "about",
    previewPath: "/#about",
    fields: [
      { kind: "text", key: "eyebrow", label: "Section label" },
      { kind: "text", key: "heading", label: "Heading" },
      { kind: "text", key: "headingMuted", label: "Heading, second line (dimmed)" },
      { kind: "textarea", key: "body", label: "Paragraph", rows: 3 },
      { kind: "image", key: "founderImage", label: "Founder photo", folder: "about" },
      { kind: "text", key: "founderImageAlt", label: "Photo description (for screen readers)" },
      { kind: "text", key: "founderName", label: "Founder name" },
      { kind: "text", key: "founderRole", label: "Founder role" },
      {
        kind: "textarea",
        key: "founderCredentials",
        label: "Credentials",
        rows: 2,
        help: "One per line.",
      },
    ],
  },
  {
    id: "servicesSection",
    group: "Home page",
    label: "Services section",
    description: "Heading above the service cards. Edit the services themselves under Services.",
    key: "servicesSection",
    previewPath: "/#services",
    fields: [
      { kind: "text", key: "eyebrow", label: "Section label" },
      { kind: "text", key: "heading", label: "Heading" },
      { kind: "textarea", key: "intro", label: "Intro", rows: 2 },
      { kind: "text", key: "cardCta", label: "Card link text" },
    ],
  },
  {
    id: "workSection",
    group: "Home page",
    label: "Work section",
    description: "Heading above the project cards. Edit the projects themselves under Projects.",
    key: "workSection",
    previewPath: "/#work",
    fields: [
      { kind: "text", key: "eyebrow", label: "Section label" },
      { kind: "text", key: "heading", label: "Heading" },
      { kind: "text", key: "cardCta", label: "Card link text" },
    ],
  },
  {
    id: "stack",
    group: "Home page",
    label: "Tech stack",
    description: "The scrolling marquee of tools.",
    key: "stack",
    previewPath: "/",
    fields: [
      { kind: "text", key: "eyebrow", label: "Section label" },
      { kind: "text", key: "heading", label: "Heading" },
      {
        kind: "tags",
        key: "items",
        label: "Tools",
        help: "Press Enter after each, or paste a comma-separated list.",
      },
    ],
  },
  {
    id: "faq",
    group: "Home page",
    label: "FAQ",
    description: "Questions and answers.",
    key: "faq",
    previewPath: "/#faq",
    fields: [
      { kind: "text", key: "eyebrow", label: "Section label" },
      { kind: "text", key: "heading", label: "Heading" },
      {
        kind: "items",
        key: "items",
        label: "Questions",
        addLabel: "Add question",
        itemTitle: (f, i) => String(f.q || `Question ${i + 1}`),
        newItem: () => ({ q: "", a: "" }),
        fields: [
          { kind: "text", key: "q", label: "Question" },
          { kind: "textarea", key: "a", label: "Answer", rows: 3 },
        ],
      },
    ],
  },
  {
    id: "contact",
    group: "Home page",
    label: "Contact & dialog",
    description:
      "The closing section and the pop-up that opens from every “Start a project” button.",
    key: "contact",
    previewPath: "/#contact",
    fields: [
      { kind: "text", key: "eyebrow", label: "Section label" },
      { kind: "text", key: "heading", label: "Heading" },
      { kind: "textarea", key: "body", label: "Paragraph", rows: 2 },
      { kind: "text", key: "cta", label: "Button" },
      { kind: "text", key: "emailPrefix", label: "Text before the email link" },
      { kind: "text", key: "dialogTitle", label: "Pop-up title" },
      { kind: "textarea", key: "dialogBody", label: "Pop-up text", rows: 3 },
      { kind: "text", key: "dialogCta", label: "Pop-up button (opens WhatsApp)" },
    ],
  },
  {
    id: "servicePage",
    group: "Detail pages",
    label: "Service page labels",
    description: "Headings shared by every service page.",
    key: "servicePage",
    previewPath: "/",
    fields: [
      { kind: "text", key: "eyebrow", label: "Label above the title" },
      { kind: "text", key: "includesHeading", label: "“What's included” heading" },
      { kind: "text", key: "processHeading", label: "“Process” heading" },
      { kind: "text", key: "useCasesHeading", label: "“Use cases” heading" },
      { kind: "text", key: "nextEyebrow", label: "Closing label" },
      { kind: "text", key: "nextHeading", label: "Closing heading" },
      { kind: "text", key: "cta", label: "Closing button" },
      { kind: "text", key: "headerCta", label: "Header button" },
    ],
  },
  {
    id: "projectPage",
    group: "Detail pages",
    label: "Project page labels",
    description: "Headings shared by every project page.",
    key: "projectPage",
    previewPath: "/",
    fields: [
      { kind: "text", key: "eyebrow", label: "Label above the title" },
      { kind: "text", key: "problemLabel", label: "“Problem” label" },
      { kind: "text", key: "solutionLabel", label: "“Solution” label" },
      { kind: "text", key: "outcomeLabel", label: "“Outcome” label" },
      { kind: "text", key: "stackLabel", label: "“Stack” label" },
      { kind: "text", key: "liveLabel", label: "Live site link" },
      { kind: "text", key: "ctaHeading", label: "Closing heading" },
      { kind: "text", key: "cta", label: "Closing button" },
      { kind: "text", key: "headerCta", label: "Header button" },
    ],
  },
];

export const PROJECT_FIELDS: Field[] = [
  { kind: "text", key: "title", label: "Title" },
  {
    kind: "textarea",
    key: "copy",
    label: "Summary",
    rows: 2,
    help: "One or two sentences. Shown on the card and under the page title.",
  },
  {
    kind: "image",
    key: "image",
    label: "Cover image",
    folder: "projects",
    help: "Wide images work best (16:10 or 16:9).",
  },
  {
    kind: "tags",
    key: "tags",
    label: "Card tags",
    help: "Two or three short tags shown on the card.",
  },
  { kind: "textarea", key: "problem", label: "Problem", rows: 3 },
  { kind: "textarea", key: "solution", label: "Solution", rows: 4 },
  { kind: "textarea", key: "outcome", label: "Outcome", rows: 3 },
  { kind: "tags", key: "stack", label: "Tech stack" },
  {
    kind: "url",
    key: "liveUrl",
    label: "Live site URL",
    placeholder: "https://…",
    help: "Optional.",
  },
];

export const SERVICE_FIELDS: Field[] = [
  { kind: "text", key: "title", label: "Title" },
  {
    kind: "textarea",
    key: "copy",
    label: "Card text",
    rows: 2,
    help: "Shown on the home page card.",
  },
  { kind: "textarea", key: "long", label: "Page intro", rows: 3 },
  { kind: "lines", key: "includes", label: "What's included", addLabel: "Add item" },
  {
    kind: "items",
    key: "process",
    label: "Process steps",
    addLabel: "Add step",
    itemTitle: (p, i) => `${i + 1}. ${String(p.step || "Step")}`,
    newItem: () => ({ step: "", detail: "" }),
    fields: [
      { kind: "text", key: "step", label: "Step" },
      { kind: "text", key: "detail", label: "Detail" },
    ],
  },
  { kind: "lines", key: "useCases", label: "Example use cases", addLabel: "Add use case" },
];

export type Collection = "projects" | "services";

export const COLLECTIONS = {
  projects: {
    label: "Projects",
    singular: "project",
    route: "/work",
    fields: PROJECT_FIELDS,
  },
  services: {
    label: "Services",
    singular: "service",
    route: "/services",
    fields: SERVICE_FIELDS,
  },
} as const;

export type CollectionItem = Project | Service;

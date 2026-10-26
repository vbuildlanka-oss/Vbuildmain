/**
 * Everything on the public site that can be edited from /admin.
 *
 * The whole site is stored as one JSON document (Supabase table
 * `site_content`, row id "site"). When the schema grows, add the new field
 * to `defaults.ts` as well. Older documents are merged over the defaults, so
 * they pick up new fields automatically.
 */

export type Service = {
  slug: string;
  title: string;
  /** Short line on the home page card. */
  copy: string;
  /** Intro paragraph on the service page. */
  long: string;
  includes: string[];
  process: { step: string; detail: string }[];
  useCases: string[];
};

export type Project = {
  slug: string;
  title: string;
  /** One-line summary on cards and under the page title. */
  copy: string;
  tags: string[];
  /** Absolute URL (R2) or a path under /public (e.g. /content/iris.webp). */
  image: string;
  problem: string;
  solution: string;
  outcome: string;
  stack: string[];
  liveUrl?: string;
  /** Unpublished projects are hidden from the site but kept in the admin. */
  published: boolean;
};

export type Chapter = { step: string; title: string; detail: string };
export type Faq = { q: string; a: string };

export type SiteContent = {
  version: 1;
  settings: {
    siteName: string;
    seoTitle: string;
    seoDescription: string;
    email: string;
    /** Digits only, with country code (used for wa.me links). */
    whatsapp: string;
    linkedin: string;
    github: string;
    menuLocation: string;
    footerLocation: string;
    copyright: string;
    startProjectLabel: string;
  };
  nav: { process: string; services: string; work: string; faq: string };
  hero: {
    eyebrow: string;
    headline: string;
    /** Last word(s) of the headline, drawn in the brand gradient. */
    headlineAccent: string;
    body: string;
    primaryCta: string;
    secondaryCta: string;
    scrollCue: string;
  };
  process: {
    eyebrow: string;
    /** Exactly four: each one drives a beat of the 3D particle scene. */
    chapters: Chapter[];
  };
  about: {
    eyebrow: string;
    heading: string;
    headingMuted: string;
    body: string;
    founderName: string;
    founderRole: string;
    /** One line per row. */
    founderCredentials: string;
    founderImage: string;
    founderImageAlt: string;
  };
  servicesSection: { eyebrow: string; heading: string; intro: string; cardCta: string };
  workSection: { eyebrow: string; heading: string; cardCta: string };
  stack: { eyebrow: string; heading: string; items: string[] };
  faq: { eyebrow: string; heading: string; items: Faq[] };
  contact: {
    eyebrow: string;
    heading: string;
    body: string;
    cta: string;
    emailPrefix: string;
    dialogTitle: string;
    dialogBody: string;
    dialogCta: string;
  };
  servicePage: {
    eyebrow: string;
    includesHeading: string;
    processHeading: string;
    useCasesHeading: string;
    nextEyebrow: string;
    nextHeading: string;
    cta: string;
    headerCta: string;
  };
  projectPage: {
    eyebrow: string;
    problemLabel: string;
    solutionLabel: string;
    outcomeLabel: string;
    stackLabel: string;
    liveLabel: string;
    ctaHeading: string;
    cta: string;
    headerCta: string;
  };
  services: Service[];
  projects: Project[];
};

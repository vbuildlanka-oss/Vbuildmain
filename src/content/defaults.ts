import type { Project, Service, SiteContent } from "./types";

/**
 * The content the site ships with. It's used when Supabase isn't configured
 * or can't be reached, and it fills in any field a saved document is missing.
 * Image paths point at /public/content so they stay stable across builds.
 */
export const defaultContent: SiteContent = {
  version: 1,
  settings: {
    siteName: "VBUILD",
    seoTitle: "VBUILD — AI & Software Studio",
    seoDescription:
      "VBUILD creates premium websites, AI agents, integrations, and custom software engineered to scale.",
    email: "hello@vbuild.dev",
    whatsapp: "94719802526",
    linkedin: "https://linkedin.com",
    github: "https://github.com",
    menuLocation: "Toronto · Working globally",
    footerLocation: "Toronto, Canada · Working globally",
    copyright: "© 2026 VBUILD. All rights reserved.",
    startProjectLabel: "Start a project",
  },
  nav: { process: "Process", services: "Services", work: "Work", faq: "FAQ" },
  hero: {
    eyebrow: "Independent software studio",
    headline: "We build websites, AI agents and software that",
    headlineAccent: "scale.",
    body: "A small team that designs, builds and looks after the software for you, from the first call to long after launch.",
    primaryCta: "Get in touch",
    secondaryCta: "View work",
    scrollCue: "Scroll to explore",
  },
  process: {
    eyebrow: "How we work",
    chapters: [
      {
        step: "Listen",
        title: "Every project starts in pieces.",
        detail:
          "A half-written brief, a spreadsheet nobody trusts, three opinions on what the product should be. We sit with your team and your users until the pieces start to make sense.",
      },
      {
        step: "Plan",
        title: "Then we lay it all out.",
        detail:
          "Before anyone writes code, every screen, flow and integration is on the table where you can see it. Changing your mind is cheap at this stage, so we encourage it.",
      },
      {
        step: "Build",
        title: "We put it together, properly.",
        detail:
          "Typed, tested, reviewed code, shipped in small steps. You get something you can click every week, not a big reveal at the end.",
      },
      {
        step: "Launch",
        title: "And then it comes to life.",
        detail:
          "We launch it, watch how real people use it and keep tuning. The AI, automations and integrations keep working long after the launch party.",
      },
    ],
  },
  about: {
    eyebrow: "About",
    heading: "Small by design.",
    headingMuted: "Ambitious by nature.",
    body: "VBUILD partners with forward-thinking teams to turn complex ideas into clear, useful products. Strategy, design, and engineering work as one — from the first sketch to production.",
    founderName: "Lathurshan Muralitharan",
    founderRole: "Founder, VBUILD",
    founderCredentials: "Computer Science Graduate\nUniversity of Waterloo",
    founderImage: "/content/founder-lathurshan.webp",
    founderImageAlt: "Portrait of Lathurshan Muralitharan, founder of VBUILD",
  },
  servicesSection: {
    eyebrow: "Services",
    heading: "Built end to end.",
    intro:
      "Design, engineering and AI under one roof, so nothing gets lost between agencies. Pick one to see how we approach it.",
    cardCta: "Explore",
  },
  workSection: {
    eyebrow: "Selected work",
    heading: "Systems with a point of view.",
    cardCta: "View case",
  },
  stack: {
    eyebrow: "Stack",
    heading: "Tools we ship with.",
    items: [
      "React",
      "Next.js",
      "TypeScript",
      "Node",
      "Python",
      "OpenAI",
      "Anthropic",
      "Postgres",
      "AWS",
      "Cloudflare",
      "Tailwind",
      "GSAP",
      "Three.js",
      "Vercel",
      "Stripe",
    ],
  },
  faq: {
    eyebrow: "FAQ",
    heading: "Good questions.",
    items: [
      {
        q: "What's a typical engagement timeline?",
        a: "Most projects ship in 4–10 weeks. Discovery sprints run 1–2 weeks; complex platforms can extend across multiple phases.",
      },
      {
        q: "How is pricing structured?",
        a: "Fixed-scope phases or monthly retainers. Most engagements land between $8k and $80k depending on scope. We share an estimate after a short discovery call.",
      },
      {
        q: "Who owns the code and IP?",
        a: "You do — fully. Repositories, accounts, and infrastructure are transferred on completion.",
      },
      {
        q: "Do you offer ongoing support?",
        a: "Yes. Post-launch retainers cover monitoring, iteration, and feature work at a predictable monthly rate.",
      },
      {
        q: "How deep does AI integration go?",
        a: "From a single GPT-powered feature to multi-agent systems with custom evaluation, observability, and guardrails.",
      },
      {
        q: "Custom build vs templates?",
        a: "We build from scratch. Templates are fine for some things, but they tend to fight you once the product grows.",
      },
    ],
  },
  contact: {
    eyebrow: "Have a challenge in mind?",
    heading: "Let's build what's next.",
    body: "Tell us what you're working on. We'll get back to you within a day with honest thoughts on how we'd tackle it.",
    cta: "Start a project",
    emailPrefix: "Or email",
    dialogTitle: "Let's start with a conversation.",
    dialogBody:
      "At VBUILD, we believe the best work starts with a conversation. We take the time to understand your specific needs so we can provide a service tailored to you.",
    dialogCta: "Chat on WhatsApp",
  },
  servicePage: {
    eyebrow: "Service",
    includesHeading: "What's included",
    processHeading: "Process",
    useCasesHeading: "Example use cases",
    nextEyebrow: "Next step",
    nextHeading: "Let's talk specifics.",
    cta: "Start on WhatsApp",
    headerCta: "Talk to us",
  },
  projectPage: {
    eyebrow: "Selected work",
    problemLabel: "Problem",
    solutionLabel: "Solution",
    outcomeLabel: "Outcome",
    stackLabel: "Stack",
    liveLabel: "Visit live site",
    ctaHeading: "Have a similar challenge?",
    cta: "Start on WhatsApp",
    headerCta: "Talk to us",
  },
  services: [
    {
      slug: "websites",
      title: "Websites",
      copy: "Fast, good-looking sites that tell people what you do and make it easy to get in touch.",
      long: "Marketing sites, product sites, and content platforms engineered to load instantly, rank well, and convert. Every build is bespoke — no templates, no compromises.",
      includes: [
        "Brand-aligned visual design system",
        "Responsive, accessibility-first build",
        "SEO, Open Graph, structured data",
        "CMS or headless content layer",
        "Analytics and performance budget",
      ],
      process: [
        { step: "Discover", detail: "Audit your audience, goals, and competitors." },
        { step: "Design", detail: "Wireframes, then a tight visual direction." },
        { step: "Build", detail: "Production engineering on modern stack." },
        { step: "Ship", detail: "Launch, monitor, iterate." },
      ],
      useCases: [
        "Marketing site for a Series A SaaS",
        "Portfolio for a creative studio",
        "Content platform with bespoke CMS",
      ],
    },
    {
      slug: "ai-solutions",
      title: "AI Solutions",
      copy: "Agents that take the repetitive work off your team's plate and plug into the tools you already use.",
      long: "From research copilots to autonomous workflows, we design AI products end-to-end — model selection, prompt architecture, evaluation, UI.",
      includes: [
        "Agent and tool-use architecture",
        "RAG over your private knowledge",
        "Evaluation harness and guardrails",
        "Cost and latency optimization",
        "Production observability",
      ],
      process: [
        { step: "Discover", detail: "Map the job-to-be-done and data." },
        { step: "Design", detail: "Prototype prompts, tools, evaluations." },
        { step: "Build", detail: "Ship the system with monitoring." },
        { step: "Ship", detail: "Measure, refine, scale." },
      ],
      useCases: [
        "Internal research copilot",
        "Customer-facing AI concierge",
        "Document automation pipeline",
      ],
    },
    {
      slug: "ai-integration",
      title: "AI Integration",
      copy: "Adding AI to the product you already have, carefully, with your data staying where it belongs.",
      long: "We retrofit existing products with AI features that actually move metrics — search, summarization, classification, decisioning — without breaking what works.",
      includes: [
        "Feature scoping and ROI sizing",
        "Provider selection (OpenAI, Anthropic, open weights)",
        "Secure data pipelines",
        "Feature flags and gradual rollout",
        "Team enablement",
      ],
      process: [
        { step: "Discover", detail: "Identify high-leverage surfaces." },
        { step: "Design", detail: "Spec the integration and UX." },
        { step: "Build", detail: "Implement behind a flag." },
        { step: "Ship", detail: "Roll out and instrument." },
      ],
      useCases: [
        "Semantic search in an existing app",
        "AI summaries in a dashboard",
        "Smart routing in an internal tool",
      ],
    },
    {
      slug: "software",
      title: "Custom Software",
      copy: "Internal tools and platforms shaped around how your business actually runs, not the other way round.",
      long: "Internal tools, customer portals, and bespoke platforms — designed with the same care as a flagship product.",
      includes: [
        "Product and technical discovery",
        "Architecture and infra design",
        "Full-stack engineering",
        "Auth, billing, multi-tenant",
        "Handover and documentation",
      ],
      process: [
        { step: "Discover", detail: "Stakeholder interviews and scoping." },
        { step: "Design", detail: "Flows, data model, interface." },
        { step: "Build", detail: "Iterate with weekly demos." },
        { step: "Ship", detail: "Deploy, train, support." },
      ],
      useCases: [
        "Operations dashboard for a logistics team",
        "Customer portal for a B2B service",
        "Bespoke CRM for a niche industry",
      ],
    },
  ],
  projects: [
    {
      slug: "iris",
      title: "Iris — Neural Photo Search",
      copy: "A semantic image search engine that finds photos from a plain-language description.",
      tags: ["CLIP", "Transformers.js", "React"],
      image: "/content/iris.webp",
      problem:
        "Finding the right photo in a large library meant endless scrolling or relying on manual tags that rarely existed.",
      solution:
        "OpenAI's CLIP model runs directly in the browser via Transformers.js and ONNX Runtime Web, embedding images and text into a shared 512-dimension vector space and ranking results by cosine similarity. Includes reverse image search, zero-shot tagging, and a live PCA visualization of the embedding space.",
      outcome:
        "Natural-language photo retrieval that runs entirely client-side, evaluated offline at mAP 0.98.",
      stack: ["CLIP ViT-B/32", "Transformers.js", "ONNX Runtime", "React", "TypeScript", "Vite"],
      liveUrl: "https://vbuild-iris.vercel.app/",
      published: true,
    },
    {
      slug: "beacon",
      title: "Beacon",
      copy: "A real-time website auditor that scores any URL on performance, SEO, security, and best practices.",
      tags: ["Node.js", "Auditing", "Web"],
      image: "/content/beacon.webp",
      problem:
        "Teams had no quick, zero-config way to check a page's health without running complex CLI tools or signing up for SaaS dashboards.",
      solution:
        "Paste any URL and instantly get a scored A–F report. Built with Node.js, Beacon fetches the live page, parses its HTML, and runs it through a comprehensive checklist — all stateless, with no signups or configuration required.",
      outcome:
        "Instant visibility into page quality, enabling teams to catch issues before they ship.",
      stack: ["Node.js", "HTML Parser", "Express", "TypeScript"],
      liveUrl: "https://vbuild-beacon.vercel.app/",
      published: true,
    },
    {
      slug: "brew-and-bloom",
      title: "Brew & Bloom",
      copy: "A single-page marketing site for a specialty coffee roastery with scroll-driven animations.",
      tags: ["React", "GSAP", "Tailwind"],
      image: "/content/brew.webp",
      problem:
        "The roastery needed a web presence that felt as craft and intentional as their beans — not a generic template.",
      solution:
        "A single-page marketing site built with React, TypeScript, and Tailwind CSS featuring scroll-driven animations powered by GSAP and Lenis smooth scrolling, including pinned horizontal card carousels, chapter-based image transitions, and a scroll-linked wordmark fill effect. Designed for instant deployment to any static host.",
      outcome:
        "A polished, animation-rich brand experience that loads instantly and deploys anywhere.",
      stack: ["React", "TypeScript", "Tailwind CSS", "GSAP", "Lenis", "Vite"],
      liveUrl: "https://vbuild-coffee.vercel.app/",
      published: true,
    },
    {
      slug: "shelby-gt500",
      title: "Shelby GT500",
      copy: "An interactive 3D parallax web experience for the Shelby GT500, driven by scroll and reactive to the cursor.",
      tags: ["GSAP", "Lenis", "Canvas"],
      image: "/content/mustang.webp",
      problem:
        "A flagship muscle car deserved more than a static gallery — it needed a web experience that captured the sense of motion, depth, and raw presence you feel standing next to the real thing.",
      solution:
        "A scroll-driven HTML5 Canvas frame animation renders the GT500 turning through a full sequence as you scroll, while cursor-reactive depth layers create a real-time 3D parallax that responds to mouse movement. GSAP orchestrates the timeline and Lenis provides weighted smooth scrolling, with spec reveals synced precisely to the animation's key frames.",
      outcome:
        "A cinematic, showroom-grade product experience that turns scrolling into an immersive walkaround.",
      stack: ["HTML5 Canvas", "GSAP", "Lenis", "React", "TypeScript", "Vite"],
      liveUrl: "https://mustang-vbuild.vercel.app/",
      published: true,
    },
  ],
};

/** Empty templates for new entries, also used to fill gaps in saved ones. */
export const blankProject: Project = {
  slug: "",
  title: "",
  copy: "",
  tags: [],
  image: "",
  problem: "",
  solution: "",
  outcome: "",
  stack: [],
  liveUrl: "",
  published: false,
};

export const blankService: Service = {
  slug: "",
  title: "",
  copy: "",
  long: "",
  includes: [],
  process: [],
  useCases: [],
};

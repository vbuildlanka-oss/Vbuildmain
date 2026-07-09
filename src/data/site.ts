import irisImage from "@/assets/iris.webp";
import beaconImage from "@/assets/beacon.webp";
import brewImage from "@/assets/brew.webp";

export type Service = {
  slug: string;
  title: string;
  copy: string;
  long: string;
  includes: string[];
  process: { step: string; detail: string }[];
  useCases: string[];
};

export const services: Service[] = [
  {
    slug: "websites",
    title: "Websites",
    copy: "High-performance digital experiences built for clarity, conversion, and lasting impact.",
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
    copy: "Purpose-built agents and intelligent systems that reason, act, and integrate with how your team already works.",
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
    copy: "Production-grade intelligence woven into your products, data, and operations.",
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
    copy: "Reliable software systems designed around your most valuable workflows.",
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
];

export type Project = {
  slug: string;
  title: string;
  copy: string;
  tags: string[];
  image: string;
  problem: string;
  solution: string;
  outcome: string;
  stack: string[];
  liveUrl?: string;
};

export const projects: Project[] = [
  {
    slug: "iris",
    title: "Iris — Neural Photo Search",
    copy: "A semantic image search engine that finds photos from a plain-language description.",
    tags: ["CLIP", "Transformers.js", "React"],
    image: irisImage,
    problem: "Finding the right photo in a large library meant endless scrolling or relying on manual tags that rarely existed.",
    solution: "OpenAI's CLIP model runs directly in the browser via Transformers.js and ONNX Runtime Web, embedding images and text into a shared 512-dimension vector space and ranking results by cosine similarity. Includes reverse image search, zero-shot tagging, and a live PCA visualization of the embedding space.",
    outcome: "Natural-language photo retrieval that runs entirely client-side, evaluated offline at mAP 0.98.",
    stack: ["CLIP ViT-B/32", "Transformers.js", "ONNX Runtime", "React", "TypeScript", "Vite"],
  },
  {
    slug: "beacon",
    title: "Beacon",
    copy: "A real-time website auditor that scores any URL on performance, SEO, security, and best practices.",
    tags: ["Node.js", "Auditing", "Web"],
    image: beaconImage,
    problem: "Teams had no quick, zero-config way to check a page's health without running complex CLI tools or signing up for SaaS dashboards.",
    solution: "Paste any URL and instantly get a scored A–F report. Built with Node.js, Beacon fetches the live page, parses its HTML, and runs it through a comprehensive checklist — all stateless, with no signups or configuration required.",
    outcome: "Instant visibility into page quality, enabling teams to catch issues before they ship.",
    stack: ["Node.js", "HTML Parser", "Express", "TypeScript"],
  },
  {
    slug: "brew-and-bloom",
    title: "Brew & Bloom",
    copy: "A single-page marketing site for a specialty coffee roastery with scroll-driven animations.",
    tags: ["React", "GSAP", "Tailwind"],
    image: brewImage,
    problem: "The roastery needed a web presence that felt as craft and intentional as their beans — not a generic template.",
    solution: "A single-page marketing site built with React, TypeScript, and Tailwind CSS featuring scroll-driven animations powered by GSAP and Lenis smooth scrolling, including pinned horizontal card carousels, chapter-based image transitions, and a scroll-linked wordmark fill effect. Designed for instant deployment to any static host.",
    outcome: "A polished, animation-rich brand experience that loads instantly and deploys anywhere.",
    stack: ["React", "TypeScript", "Tailwind CSS", "GSAP", "Lenis", "Vite"],
  },
];

export const techStack = [
  "React", "Next.js", "TypeScript", "Node", "Python",
  "OpenAI", "Anthropic", "Postgres", "AWS", "Cloudflare",
  "Tailwind", "GSAP", "Three.js", "Vercel", "Stripe",
];

export const faqs = [
  { q: "What's a typical engagement timeline?", a: "Most projects ship in 4–10 weeks. Discovery sprints run 1–2 weeks; complex platforms can extend across multiple phases." },
  { q: "How is pricing structured?", a: "Fixed-scope phases or monthly retainers. Most engagements land between $8k and $80k depending on scope. We share an estimate after a short discovery call." },
  { q: "Who owns the code and IP?", a: "You do — fully. Repositories, accounts, and infrastructure are transferred on completion." },
  { q: "Do you offer ongoing support?", a: "Yes. Post-launch retainers cover monitoring, iteration, and feature work at a predictable monthly rate." },
  { q: "How deep does AI integration go?", a: "From a single GPT-powered feature to multi-agent systems with custom evaluation, observability, and guardrails." },
  { q: "Custom build vs templates?", a: "Always bespoke. Templates compromise performance, brand, and longevity — we build to last." },
];

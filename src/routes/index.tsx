import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { ArrowRight, Github, Linkedin, Menu, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import founderImage from "@/assets/founder-lathurshan.webp";
import logoImage from "@/assets/vbuild-mark.webp";
import { services, projects, techStack, faqs } from "@/data/site";
import { ScrollScene, STORY_TRIGGER_ID } from "@/components/scroll-scene/ScrollScene";

export const Route = createFileRoute("/")({
  component: Index,
});

/**
 * The process story. Each chapter drives a pose of NEXBOT in <ScrollScene />
 * (see components/scroll-scene/timeline.ts): scattered → blueprint → assembled → switched on.
 */
const chapters = [
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
];

function Index() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    gsap.registerPlugin(ScrollTrigger);

    // Lenis — smooth, weighted scroll
    const lenis = new Lenis({ duration: 1.4, smoothWheel: !reduceMotion, smoothTouch: false } as any);
    const onTick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(onTick);
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.lagSmoothing(0);
    lenisRef.current = lenis;

    const context = gsap.context(() => {
      const mm = gsap.matchMedia();

      // === PROCESS STORY — pinned 3D scrollytelling (created first: its pin
      // spacing shifts every trigger below it). The 3D model reads this
      // trigger's range by id; the copy is scrubbed here. ===
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const pin = document.querySelector<HTMLElement>("[data-story-pin]");
        const items = gsap.utils.toArray<HTMLElement>("[data-chapter]");
        if (!pin || items.length === 0) return;
        const marks = gsap.utils.toArray<HTMLElement>("[data-chapter-mark]");
        const setActive = (i: number) => marks.forEach((m, j) => (m.dataset.active = String(i === j)));
        setActive(0);
        const tl = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            id: STORY_TRIGGER_ID,
            trigger: "[data-story]",
            start: "top top",
            end: () => `+=${window.innerHeight * items.length}`,
            pin,
            scrub: 0.6,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: (self) => setActive(Math.min(items.length - 1, Math.floor(self.progress * items.length))),
          },
        });
        items.forEach((item, i) => {
          const words = item.querySelectorAll("[data-word]");
          const body = item.querySelectorAll("[data-chapter-body]");
          if (i > 0) {
            tl.fromTo(item, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.05 }, i)
              .fromTo(words, { yPercent: 110 }, { yPercent: 0, duration: 0.3, stagger: 0.03, ease: "power3.out" }, i)
              .fromTo(body, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.25, ease: "power2.out" }, i + 0.12);
          }
          if (i < items.length - 1) {
            tl.to(item, { autoAlpha: 0, y: -40, duration: 0.2, ease: "power2.in" }, i + 0.78);
          }
        });
        tl.set({}, {}, items.length);
      });

      // === HORIZONTAL SCROLL (desktop only) ===
      mm.add("(min-width: 1024px) and (prefers-reduced-motion: no-preference)", () => {
        const track = document.querySelector<HTMLElement>("[data-work-track]");
        const wrap = document.querySelector<HTMLElement>("[data-work-wrap]");
        if (!track || !wrap) return;
        const distance = () => track.scrollWidth - window.innerWidth + 80;
        gsap.to(track, {
          x: () => -distance(),
          ease: "none",
          scrollTrigger: {
            trigger: wrap,
            start: "top top",
            end: () => `+=${distance()}`,
            scrub: 1,
            pin: true,
            invalidateOnRefresh: true,
          },
        });
      });

      // === HERO — cinematic entrance timeline ===
      gsap.from("[data-hero-item]", {
        opacity: 0, y: reduceMotion ? 0 : 40, duration: 1.4,
        stagger: 0.18, ease: "expo.out", delay: 0.3,
      });

      if (!reduceMotion) {
        // Hero copy drifts up and fades on scroll
        gsap.to("[data-hero-copy]", {
          yPercent: -12, opacity: 0, ease: "none",
          scrollTrigger: { trigger: "[data-hero]", start: "top top", end: "bottom top", scrub: true },
        });
      }

      // === SCROLL-TRIGGERED REVEALS — toggles on scroll up/down ===
      // Every [data-reveal] element fades/slides in when entering viewport
      // and reverses when leaving (scrolling back up)
      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
        gsap.fromTo(el,
          { opacity: 0, y: reduceMotion ? 0 : 30 },
          {
            opacity: 1, y: 0, duration: 0.9, ease: "power2.out",
            scrollTrigger: {
              trigger: el,
              start: "top 90%",
              toggleActions: "play none none reverse",
            },
          }
        );
      });

      // === STAGGER GROUPS — cards reveal with stagger, reverse on scroll up ===
      gsap.utils.toArray<HTMLElement>("[data-stagger]").forEach((group) => {
        const children = gsap.utils.toArray<HTMLElement>(group.children);
        children.forEach((child, i) => {
          gsap.fromTo(child,
            { opacity: 0, y: reduceMotion ? 0 : 40 },
            {
              opacity: 1, y: 0, duration: 0.7, ease: "power3.out",
              delay: i * 0.08,
              scrollTrigger: {
                trigger: child,
                start: "top 92%",
                toggleActions: "play none none reverse",
              },
            }
          );
        });
      });

      // === MOBILE WORK CARDS — reveal on scroll ===
      gsap.utils.toArray<HTMLElement>("[data-mobile-work] > a").forEach((card) => {
        gsap.fromTo(card,
          { opacity: 0, y: reduceMotion ? 0 : 30 },
          {
            opacity: 1, y: 0, duration: 0.8, ease: "power2.out",
            scrollTrigger: {
              trigger: card,
              start: "top 92%",
              toggleActions: "play none none reverse",
            },
          }
        );
      });

      // === FOOTER — slides up ===
      gsap.fromTo("footer",
        { opacity: 0, y: reduceMotion ? 0 : 20 },
        {
          opacity: 1, y: 0, duration: 0.7, ease: "power2.out",
          scrollTrigger: {
            trigger: "footer",
            start: "top 95%",
            toggleActions: "play none none reverse",
          },
        }
      );

    }, rootRef);

    const refresh = () => ScrollTrigger.refresh();
    const raf = window.requestAnimationFrame(refresh);
    window.addEventListener("load", refresh, { once: true });

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("load", refresh);
      context.revert();
      gsap.ticker.remove(onTick);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  const moveTo = (id: string) => {
    setMobileMenuOpen(false);
    const target = document.querySelector<HTMLElement>(id);
    if (!target) return;
    if (lenisRef.current) lenisRef.current.scrollTo(target, { duration: 1.6 });
    else target.scrollIntoView({ behavior: "smooth" });
  };
  const openContactDialog = () => { setMobileMenuOpen(false); setContactDialogOpen(true); };
  const openWhatsApp = () => window.open("https://wa.me/94719802526", "_blank", "noopener,noreferrer");

  const navLinks: [string, string][] = [["Process", "#process"], ["Services", "#services"], ["Work", "#work"], ["FAQ", "#faq"]];

  return (
    <div ref={rootRef} className="min-h-screen overflow-x-clip bg-background text-foreground selection:bg-primary/30">
      <ScrollScene />
      <header className="fixed inset-x-0 top-0 z-50 mx-auto grid max-w-[1500px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 md:flex md:justify-between md:px-10 md:py-5">
        <a href="#top" aria-label="VBUILD home" className="glass-panel flex h-12 items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-4">
          <span className="flex h-9 w-11 items-center justify-center overflow-hidden rounded-full bg-background">
            <img src={logoImage} alt="" className="h-full w-full object-cover" />
          </span>
          <span className="font-display text-sm font-semibold tracking-[0.16em] text-foreground">VBUILD</span>
        </a>
        <nav aria-label="Main navigation" className="glass-panel hidden items-center gap-1 rounded-full p-1 md:flex">
          {navLinks.map(([label, href]) => (
            <a key={label} href={href} onClick={(e) => { e.preventDefault(); moveTo(href); }} className="rounded-full px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">{label}</a>
          ))}
        </nav>
        <Button variant="glass" size="sm" onClick={openContactDialog} className="hidden md:inline-flex">Start a project <ArrowRight /></Button>
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="glass" size="icon" className="shrink-0 md:hidden" aria-label="Open navigation menu"><Menu /></Button>
          </SheetTrigger>
          <SheetContent side="right" className="glass-panel w-[min(88vw,23rem)] border-l border-border bg-background/95 p-6 pt-20 backdrop-blur-2xl">
            <SheetHeader className="text-left">
              <SheetTitle className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-primary">Navigate</SheetTitle>
              <SheetDescription className="sr-only">Navigate to the main sections of the VBUILD website.</SheetDescription>
            </SheetHeader>
            <nav aria-label="Mobile navigation" className="mt-10 flex flex-col">
              {navLinks.map(([label, href]) => (
                <button key={label} type="button" onClick={() => moveTo(href)} className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border py-5 text-left text-foreground transition-colors hover:text-primary">
                  <span className="font-display text-2xl font-medium tracking-[-0.03em]">{label}</span>
                  <ArrowRight className="h-4 w-4 -rotate-45" />
                </button>
              ))}
            </nav>
            <Button variant="hero" size="lg" onClick={openContactDialog} className="mt-10 w-full">Start a project <ArrowRight /></Button>
            <p className="absolute bottom-7 left-6 text-xs text-muted-foreground">Toronto · Working globally</p>
          </SheetContent>
        </Sheet>
      </header>

      <main className="relative z-10">
        {/* HERO — the 3D model lives in the fixed <ScrollScene /> layer behind */}
        <section id="top" data-hero className="relative flex min-h-screen items-end overflow-hidden px-5 pb-16 pt-24 md:px-10 lg:items-center lg:pb-0">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden bg-[linear-gradient(90deg,var(--background)_0%,color-mix(in_oklab,var(--background)_80%,transparent)_30%,transparent_60%)] lg:block" />
          <div data-hero-copy className="relative z-10 mx-auto w-full max-w-[1440px] will-change-transform">
            <div className="max-w-3xl">
              <div data-hero-item className="mb-8 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.24em] text-primary"><span className="h-px w-8 bg-primary" /> Independent software studio</div>
              <h1 data-hero-item className="font-display text-[clamp(4rem,10vw,9.5rem)] font-semibold leading-[0.82] tracking-[-0.07em]">VBUILD</h1>
              <p data-hero-item className="mt-8 max-w-2xl font-display text-[clamp(1.65rem,3.2vw,3.3rem)] font-medium leading-[1.08] tracking-[-0.04em]">We build websites, AI agents, and custom software that <span className="text-gradient">scale.</span></p>
              <p data-hero-item className="mt-6 max-w-lg text-base leading-7 text-muted-foreground">A small team that designs, builds and looks after the software for you, from the first call to long after launch.</p>
              <div data-hero-item className="mt-9 flex flex-wrap gap-3">
                <Button variant="hero" size="lg" onClick={openContactDialog}>Get in touch <ArrowRight /></Button>
                <Button variant="glass" size="lg" onClick={() => moveTo("#work")}>View work</Button>
              </div>
            </div>
          </div>
        </section>

        {/* PROCESS — pinned 3D story: the model goes signal → blueprint → built → switched on */}
        <section id="process" data-story aria-label="Our process" className="relative">
          <div data-story-pin className="relative overflow-hidden motion-safe:h-svh">
            {/* Legibility scrims (static while pinned, so they never sweep across the model) */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(0deg,var(--background)_8%,color-mix(in_oklab,var(--background)_75%,transparent)_38%,transparent_62%)] motion-reduce:hidden lg:bg-[linear-gradient(90deg,var(--background)_0%,color-mix(in_oklab,var(--background)_70%,transparent)_30%,transparent_58%)]" />

            <div className="relative mx-auto flex h-full max-w-[1440px] flex-col px-5 pt-24 md:px-10 md:pt-28 motion-reduce:pb-16">
              <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.24em] text-primary"><span className="h-px w-8 bg-primary" /> How we work</p>

              <div className="relative flex-1 motion-reduce:mt-10 motion-reduce:grid motion-reduce:gap-10 motion-reduce:sm:grid-cols-2">
                {chapters.map((c) => (
                  <article
                    key={c.step}
                    data-chapter
                    className="max-w-xl motion-safe:absolute motion-safe:inset-x-0 motion-safe:bottom-24 md:motion-safe:bottom-28 lg:motion-safe:bottom-auto lg:motion-safe:top-1/2 lg:motion-safe:-translate-y-1/2"
                  >
                    <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">{c.step}</p>
                    <h2 className="mt-4 font-display text-[clamp(2.25rem,5.4vw,5.25rem)] font-medium leading-[0.98] tracking-[-0.045em] md:mt-6">
                      {c.title.split(" ").map((word, w) => (
                        <span key={w} className="mr-[0.22em] inline-block overflow-hidden pb-[0.08em] align-bottom last:mr-0">
                          <span data-word className="inline-block will-change-transform">{word}</span>
                        </span>
                      ))}
                    </h2>
                    <p data-chapter-body className="mt-4 max-w-md text-sm leading-6 text-muted-foreground md:mt-6 md:text-base md:leading-7">{c.detail}</p>
                  </article>
                ))}
              </div>

              {/* Where we are in the story — just the words, the active one lights up */}
              <ul aria-hidden="true" className="flex flex-wrap gap-x-6 gap-y-2 pb-8 text-xs text-muted-foreground motion-reduce:hidden md:pb-10">
                {chapters.map((c) => (
                  <li key={c.step} data-chapter-mark className="transition-colors duration-500 data-[active=true]:text-foreground">{c.step}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ABOUT / FOUNDER */}
        <section id="about" className="section-rule px-5 py-16 md:px-10 md:py-28 lg:py-36">
          <div className="mx-auto grid max-w-7xl gap-10 md:gap-16 lg:grid-cols-[1.2fr_.8fr] lg:items-end">
            <div data-reveal>
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.24em] text-primary md:mb-6">About</p>
              <h2 className="max-w-4xl font-display text-3xl font-medium leading-[1.08] tracking-[-0.04em] sm:text-4xl md:text-6xl lg:text-7xl">Small by design.<br /><span className="text-muted-foreground">Ambitious by nature.</span></h2>
              <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground md:mt-8 md:text-lg md:leading-8">VBUILD partners with forward-thinking teams to turn complex ideas into clear, useful products. Strategy, design, and engineering work as one — from the first sketch to production.</p>
            </div>
            <article data-reveal className="glass-panel overflow-hidden rounded-2xl p-2 md:rounded-3xl md:p-3">
              <img src={founderImage} alt="Portrait of Lathurshan Muralitharan, founder of VBUILD" loading="lazy" width={1254} height={1254} className="aspect-[4/3] w-full rounded-xl object-cover object-[center_38%] md:rounded-2xl" />
              <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6 md:p-7">
                <div><p className="font-display text-lg font-semibold md:text-xl">Lathurshan Muralitharan</p><p className="mt-0.5 text-sm text-muted-foreground">Founder, VBUILD</p></div>
                <p className="text-xs leading-5 text-muted-foreground sm:max-w-48 sm:text-right">Computer Science Graduate<br />University of Waterloo</p>
              </div>
            </article>
          </div>
        </section>

        {/* SERVICES */}
        <section id="services" className="section-rule px-5 py-16 md:px-10 md:py-28 lg:py-36">
          <div className="mx-auto max-w-7xl">
            <div data-reveal className="mb-10 grid gap-6 md:mb-14 md:gap-8 lg:grid-cols-[1fr_.55fr] lg:items-end">
              <div>
                <p className="mb-4 text-xs font-semibold uppercase tracking-[0.24em] text-primary md:mb-6">Services</p>
                <h2 className="font-display text-3xl font-medium tracking-[-0.04em] sm:text-4xl md:text-5xl lg:text-7xl">Built end to end.</h2>
              </div>
              <p className="max-w-sm text-sm leading-6 text-muted-foreground">Design, engineering and AI under one roof, so nothing gets lost between agencies. Pick one to see how we approach it.</p>
            </div>
            <div data-stagger className="grid gap-3 sm:grid-cols-2 sm:gap-4">
              {services.map((s) => (
                <Link
                  key={s.slug}
                  to="/services/$slug"
                  params={{ slug: s.slug }}
                  className="group relative flex min-h-[180px] flex-col justify-between rounded-2xl border border-border bg-card/40 p-5 transition-[border-color,transform] duration-300 hover:-translate-y-1 hover:border-primary/50 sm:min-h-[200px] md:min-h-[220px] md:p-7 lg:p-9"
                >
                  <h3 className="font-display text-xl font-medium tracking-[-0.03em] sm:text-2xl md:text-3xl">{s.title}</h3>
                  <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground md:mt-4">{s.copy}</p>
                  <span className="mt-5 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary md:mt-8">
                    Explore <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* SELECTED WORK */}
        <section id="work" className="section-rule">
          <div className="px-5 pt-16 md:px-10 md:pt-28 lg:pt-36">
            <div data-reveal className="mx-auto max-w-7xl">
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.24em] text-primary md:mb-6">Selected work</p>
              <h2 className="font-display text-3xl font-medium tracking-[-0.04em] sm:text-4xl md:text-5xl lg:text-7xl">Systems with a point of view.</h2>
            </div>
          </div>

          {/* Mobile / tablet vertical stack */}
          <div data-mobile-work className="mx-auto mt-10 max-w-7xl space-y-10 px-5 pb-16 md:mt-14 md:space-y-12 md:px-10 md:pb-28 lg:hidden lg:pb-36">
            {projects.map((p) => (
              <Link key={p.slug} to="/work/$slug" params={{ slug: p.slug }} className="group block">
                <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-border bg-muted md:rounded-2xl">
                  <img src={p.image} alt={p.title} loading="lazy" width={1280} height={768} className="h-full w-full object-cover transition-[filter,opacity,transform] duration-700 active:scale-[1.02]" />
                </div>
                <div className="mt-4 md:mt-5">
                  <h3 className="font-display text-xl font-medium tracking-[-0.03em] sm:text-2xl">{p.title}</h3>
                  <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground md:mt-3">{p.copy}</p>
                  <p className="mt-3 text-[10px] uppercase tracking-[0.16em] text-muted-foreground md:mt-4">{p.tags.join(" · ")}</p>
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop horizontal pinned scroll */}
          <div data-work-wrap className="relative mt-16 hidden h-screen overflow-hidden lg:block">
            <div data-work-track className="flex h-full items-center gap-8 pl-10 will-change-transform">
              {projects.map((p) => (
                <Link
                  key={p.slug}
                  to="/work/$slug"
                  params={{ slug: p.slug }}
                  className="group relative block h-[70vh] w-[60vw] shrink-0 overflow-hidden rounded-3xl border border-border bg-card/30"
                >
                  <img src={p.image} alt={p.title} loading="lazy" width={1280} height={768} className="absolute inset-0 h-full w-full object-cover opacity-65 grayscale transition-[filter,opacity,transform] duration-700 group-hover:scale-[1.03] group-hover:opacity-100 group-hover:grayscale-0" />
                  <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
                  <div className="relative flex h-full flex-col justify-end p-10">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-primary">{p.tags.join(" · ")}</p>
                    <h3 className="mt-3 font-display text-4xl font-medium tracking-[-0.04em]">{p.title}</h3>
                    <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">{p.copy}</p>
                    <span className="mt-6 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                      View case <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                    </span>
                  </div>
                </Link>
              ))}
              <div className="w-[10vw] shrink-0" aria-hidden="true" />
            </div>
          </div>
        </section>

        {/* TECH STACK MARQUEE */}
        <section className="section-rule overflow-hidden py-14 md:py-20 lg:py-28">
          <div data-reveal className="mx-auto mb-8 max-w-7xl px-5 md:mb-10 md:px-10">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Stack</p>
            <h2 className="mt-3 font-display text-2xl font-medium tracking-[-0.03em] sm:text-3xl md:mt-4 md:text-5xl">Tools we ship with.</h2>
          </div>
          <div className="group relative">
            <div className="vbuild-marquee flex w-max gap-12 will-change-transform group-hover:[animation-play-state:paused]">
              {[...techStack, ...techStack].map((t, i) => (
                <span key={`${t}-${i}`} className="font-display text-2xl font-medium text-muted-foreground md:text-4xl">{t}</span>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="section-rule px-5 py-16 md:px-10 md:py-28 lg:py-36">
          <div className="mx-auto grid max-w-7xl gap-8 md:gap-16 lg:grid-cols-[.4fr_1fr]">
            <div data-reveal>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">FAQ</p>
              <h2 className="mt-4 font-display text-3xl font-medium tracking-[-0.04em] sm:text-4xl md:mt-6 md:text-5xl lg:text-7xl">Good questions.</h2>
            </div>
            <Accordion data-reveal type="single" collapsible className="w-full">
              {faqs.map((f, i) => (
                <AccordionItem key={f.q} value={`item-${i}`} className="border-border">
                  <AccordionTrigger className="py-5 text-left font-display text-base font-medium tracking-[-0.02em] sm:text-lg md:py-6 md:text-xl [&>svg]:hidden group">
                    <span className="flex w-full items-center justify-between gap-3 md:gap-4">
                      {f.q}
                      <Plus className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 group-data-[state=open]:rotate-45 md:h-5 md:w-5" />
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-5 text-sm leading-7 text-muted-foreground md:pb-6 md:text-base">{f.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* CONTACT */}
        {/* Full-viewport finale: the switched-on model rises with this section (see ScrollScene) */}
        <section id="contact" className="section-rule flex min-h-lvh flex-col justify-end px-5 pb-8 pt-[46svh] md:px-10 md:pt-[48svh] lg:pt-32">
          <div data-reveal className="mx-auto grid w-full max-w-7xl lg:grid-cols-[1.1fr_.9fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Have a challenge in mind?</p>
              <h2 className="mt-5 max-w-4xl font-display text-4xl font-medium leading-[0.98] tracking-[-0.04em] sm:text-5xl md:mt-7 lg:text-7xl xl:text-8xl">Let's build what's next.</h2>
              <p className="mt-4 max-w-md text-sm leading-7 text-muted-foreground md:mt-6 md:text-base">Tell us what you're working on. We'll get back to you within a day with honest thoughts on how we'd tackle it.</p>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4 md:mt-10">
                <Button variant="hero" size="lg" onClick={openContactDialog}>Start a project <ArrowRight /></Button>
                <p className="text-sm text-muted-foreground">Or email <a href="mailto:hello@vbuild.dev" className="text-foreground underline-offset-4 hover:underline">hello@vbuild.dev</a></p>
              </div>
            </div>
          </div>

          <footer className="mx-auto mt-16 grid w-full max-w-7xl gap-4 border-t border-border pt-6 text-xs text-muted-foreground sm:grid-cols-3 md:mt-24 md:gap-6 md:pt-7">
            <p>&copy; 2026 VBUILD. All rights reserved.</p>
            <p className="sm:text-center">Toronto, Canada &middot; Working globally</p>
            <div className="flex items-center gap-5 sm:justify-end">
              <a aria-label="LinkedIn" href="https://linkedin.com" className="transition-colors hover:text-primary"><Linkedin className="h-4 w-4" /></a>
              <a aria-label="GitHub" href="https://github.com" className="transition-colors hover:text-primary"><Github className="h-4 w-4" /></a>
            </div>
          </footer>
        </section>
      </main>

      <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
        <DialogContent className="glass-panel max-w-lg rounded-3xl border-border p-7 md:p-10">
          <DialogHeader className="text-left">
            <DialogTitle className="font-display text-3xl font-medium tracking-[-0.04em]">Let's start with a conversation.</DialogTitle>
            <DialogDescription className="pt-4 text-base leading-7 text-muted-foreground">At VBUILD, we believe the best work starts with a conversation. We take the time to understand your specific needs so we can provide a service tailored to you.</DialogDescription>
          </DialogHeader>
          <Button type="button" variant="hero" size="lg" className="mt-4 w-full sm:w-auto" onClick={openWhatsApp}>Chat on WhatsApp <ArrowRight /></Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

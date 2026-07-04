import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { ArrowRight, Github, Linkedin, Menu, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import founderImage from "@/assets/founder-lathurshan.png";
import logoImage from "@/assets/vbuild-mark.jpeg";
import { services, projects, techStack, faqs } from "@/data/site";

export const Route = createFileRoute("/")({
  component: Index,
});

const process = [
  { step: "Discover", detail: "We map the problem, the audience, and the constraints." },
  { step: "Design", detail: "Wireframes and a sharp visual direction before any code." },
  { step: "Build", detail: "Production engineering with weekly demos." },
  { step: "Ship", detail: "Launch, measure, refine — together." },
];

const SPLINE_URL = "https://my.spline.design/aibrain-VnvsW1OxElArh6zfIspyafuH/";

/**
 * Deferred Spline embed — avoids blocking initial paint.
 * 1. Waits for idle time (requestIdleCallback) before inserting the iframe.
 * 2. Shows an animated gradient placeholder while loading.
 * 3. Fades the iframe in once it fires its load event.
 * 4. Disables pointer-events so iframe never captures scroll.
 * 5. Hides iframe once user scrolls past hero to free GPU.
 */
function SplineEmbed() {
  const [shouldLoad, setShouldLoad] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const schedule = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 200));
    const id = schedule(() => setShouldLoad(true), { timeout: 1500 });
    return () => {
      if (window.cancelIdleCallback) window.cancelIdleCallback(id as number);
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "200px" },
    );
    const hero = document.querySelector("[data-hero]");
    if (hero) observer.observe(hero);
    return () => observer.disconnect();
  }, [loaded]);

  const onIframeLoad = useCallback(() => setLoaded(true), []);

  return (
    <div data-spline className="pointer-events-none absolute inset-0 will-change-transform">
      <div
        aria-hidden="true"
        className={`absolute inset-0 transition-opacity duration-700 ${loaded ? "opacity-0 pointer-events-none" : "opacity-100"}`}
      >
        <div className="h-full w-full animate-pulse bg-gradient-to-br from-primary/5 via-transparent to-primary/10" />
      </div>

      {shouldLoad && (
        <iframe
          title="Interactive AI brain"
          src={SPLINE_URL}
          frameBorder="0"
          width="100%"
          height="100%"
          loading="eager"
          onLoad={onIframeLoad}
          style={{ display: visible ? "block" : "none" }}
          className={`pointer-events-none h-[calc(100%+5rem)] w-full border-0 transition-opacity duration-1000 ${loaded ? "opacity-75" : "opacity-0"}`}
        />
      )}

      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-b from-transparent via-background/80 to-background" />
    </div>
  );
}

function Index() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);

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

    const context = gsap.context(() => {
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

      // === HORIZONTAL SCROLL (desktop only) ===
      const mm = gsap.matchMedia();
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
    };
  }, []);

  const moveTo = (id: string) => {
    setMobileMenuOpen(false);
    document.querySelector(id)?.scrollIntoView({ behavior: "smooth" });
  };
  const openContactDialog = () => { setMobileMenuOpen(false); setContactDialogOpen(true); };
  const openWhatsApp = () => window.open("https://wa.me/94719802526", "_blank", "noopener,noreferrer");

  const navLinks: [string, string][] = [["Services", "#services"], ["Work", "#work"], ["Process", "#process"], ["FAQ", "#faq"]];

  return (
    <div ref={rootRef} className="min-h-screen overflow-x-clip bg-background text-foreground selection:bg-primary/30">
      <header className="fixed inset-x-0 top-0 z-50 mx-auto grid max-w-[1500px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 md:flex md:justify-between md:px-10 md:py-5">
        <a href="#top" aria-label="VBUILD home" className="glass-panel flex h-12 items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-4">
          <span className="flex h-9 w-11 items-center justify-center overflow-hidden rounded-full bg-background">
            <img src={logoImage} alt="" className="h-full w-full object-cover" />
          </span>
          <span className="font-display text-sm font-semibold tracking-[0.16em] text-foreground">VBUILD</span>
        </a>
        <nav aria-label="Main navigation" className="glass-panel hidden items-center gap-1 rounded-full p-1 md:flex">
          {navLinks.map(([label, href]) => (
            <a key={label} href={href} className="rounded-full px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">{label}</a>
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

      <main>
        {/* HERO */}
        <section id="top" data-hero className="relative flex min-h-screen items-center overflow-hidden px-5 pt-24 md:px-10">
          <SplineEmbed />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,var(--background)_3%,color-mix(in_oklab,var(--background)_88%,transparent)_34%,color-mix(in_oklab,var(--background)_25%,transparent)_70%),linear-gradient(0deg,var(--background)_0%,transparent_40%)]" />
          <div data-hero-copy className="relative z-10 mx-auto w-full max-w-[1440px] will-change-transform">
            <div className="max-w-3xl">
              <div data-hero-item className="mb-8 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.24em] text-primary"><span className="h-px w-8 bg-primary" /> Independent software studio</div>
              <h1 data-hero-item className="font-display text-[clamp(4rem,10vw,9.5rem)] font-semibold leading-[0.82] tracking-[-0.07em]">VBUILD</h1>
              <p data-hero-item className="mt-8 max-w-2xl font-display text-[clamp(1.65rem,3.2vw,3.3rem)] font-medium leading-[1.08] tracking-[-0.04em]">We build websites, AI agents, and custom software that <span className="text-gradient">scale.</span></p>
              <p data-hero-item className="mt-6 max-w-lg text-base leading-7 text-muted-foreground">Intelligent digital systems, designed beautifully and engineered for what comes next.</p>
              <div data-hero-item className="mt-9 flex flex-wrap gap-3">
                <Button variant="hero" size="lg" onClick={openContactDialog}>Get in touch <ArrowRight /></Button>
                <Button variant="glass" size="lg" onClick={() => moveTo("#work")}>View work</Button>
              </div>
            </div>
          </div>
        </section>

        {/* ABOUT / FOUNDER */}
        <section id="about" className="section-rule px-5 py-24 md:px-10 md:py-36">
          <div className="mx-auto grid max-w-7xl gap-16 lg:grid-cols-[1.2fr_.8fr] lg:items-end">
            <div data-reveal>
              <p className="mb-6 text-xs font-semibold uppercase tracking-[0.24em] text-primary">About</p>
              <h2 className="max-w-4xl font-display text-4xl font-medium leading-[1.05] tracking-[-0.045em] md:text-7xl">Small by design.<br /><span className="text-muted-foreground">Ambitious by nature.</span></h2>
              <p className="mt-8 max-w-xl text-lg leading-8 text-muted-foreground">VBUILD partners with forward-thinking teams to turn complex ideas into clear, useful products. Strategy, design, and engineering work as one — from the first sketch to production.</p>
            </div>
            <article data-reveal className="glass-panel overflow-hidden rounded-3xl p-3">
              <img src={founderImage} alt="Portrait of Lathurshan Muralitharan, founder of VBUILD" loading="lazy" width={1254} height={1254} className="aspect-[4/3] w-full rounded-2xl object-cover object-[center_38%]" />
              <div className="flex items-end justify-between gap-6 p-5 md:p-7">
                <div><p className="font-display text-xl font-semibold">Lathurshan Muralitharan</p><p className="mt-1 text-sm text-muted-foreground">Founder, VBUILD</p></div>
                <p className="max-w-48 text-right text-xs leading-5 text-muted-foreground">Computer Science Graduate<br />University of Waterloo</p>
              </div>
            </article>
          </div>
        </section>

        {/* SERVICES */}
        <section id="services" className="section-rule px-5 py-24 md:px-10 md:py-36">
          <div className="mx-auto max-w-7xl">
            <div data-reveal className="mb-14 grid gap-8 lg:grid-cols-[1fr_.55fr] lg:items-end">
              <div>
                <p className="mb-6 text-xs font-semibold uppercase tracking-[0.24em] text-primary">Services</p>
                <h2 className="font-display text-5xl font-medium tracking-[-0.05em] md:text-7xl">Built end to end.</h2>
              </div>
              <p className="max-w-sm text-sm leading-6 text-muted-foreground">One focused studio across experience, intelligence, and infrastructure. Tap a service to see how we approach it.</p>
            </div>
            <div data-stagger className="grid gap-4 md:grid-cols-2">
              {services.map((s) => (
                <Link
                  key={s.slug}
                  to="/services/$slug"
                  params={{ slug: s.slug }}
                  className="group relative flex min-h-[220px] flex-col justify-between rounded-2xl border border-border bg-card/40 p-7 transition-[border-color,transform] duration-300 hover:-translate-y-1 hover:border-primary/50 md:p-9"
                >
                  <h3 className="font-display text-2xl font-medium tracking-[-0.03em] md:text-3xl">{s.title}</h3>
                  <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">{s.copy}</p>
                  <span className="mt-8 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                    Explore <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* SELECTED WORK */}
        <section id="work" className="section-rule">
          <div className="px-5 pt-24 md:px-10 md:pt-36">
            <div data-reveal className="mx-auto max-w-7xl">
              <p className="mb-6 text-xs font-semibold uppercase tracking-[0.24em] text-primary">Selected work</p>
              <h2 className="font-display text-5xl font-medium tracking-[-0.05em] md:text-7xl">Systems with a point of view.</h2>
            </div>
          </div>

          {/* Mobile / tablet vertical stack */}
          <div data-mobile-work className="mx-auto mt-14 max-w-7xl space-y-12 px-5 pb-24 md:px-10 md:pb-36 lg:hidden">
            {projects.map((p) => (
              <Link key={p.slug} to="/work/$slug" params={{ slug: p.slug }} className="group block">
                <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-border bg-muted">
                  <img src={p.image} alt={p.title} loading="lazy" width={1280} height={768} className="h-full w-full object-cover transition-[filter,opacity,transform] duration-700 active:scale-[1.02]" />
                </div>
                <div className="mt-5">
                  <h3 className="font-display text-2xl font-medium tracking-[-0.03em]">{p.title}</h3>
                  <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">{p.copy}</p>
                  <p className="mt-4 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{p.tags.join(" · ")}</p>
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

        {/* PROCESS */}
        <section id="process" className="section-rule px-5 py-24 md:px-10 md:py-36">
          <div className="mx-auto max-w-7xl">
            <div data-reveal className="mb-14 max-w-3xl">
              <p className="mb-6 text-xs font-semibold uppercase tracking-[0.24em] text-primary">Process</p>
              <h2 className="font-display text-5xl font-medium tracking-[-0.05em] md:text-7xl">A clear path, every time.</h2>
            </div>
            <ol data-stagger className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {process.map((p, i) => (
                <li key={p.step} className="rounded-2xl border border-border bg-card/40 p-7">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">0{i + 1}</p>
                  <p className="mt-5 font-display text-2xl font-medium tracking-[-0.03em]">{p.step}</p>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{p.detail}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* TECH STACK MARQUEE */}
        <section className="section-rule overflow-hidden py-20 md:py-28">
          <div data-reveal className="mx-auto mb-10 max-w-7xl px-5 md:px-10">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Stack</p>
            <h2 className="mt-4 font-display text-3xl font-medium tracking-[-0.04em] md:text-5xl">Tools we ship with.</h2>
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
        <section id="faq" className="section-rule px-5 py-24 md:px-10 md:py-36">
          <div className="mx-auto grid max-w-7xl gap-16 lg:grid-cols-[.4fr_1fr]">
            <div data-reveal>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">FAQ</p>
              <h2 className="mt-6 font-display text-5xl font-medium tracking-[-0.05em] md:text-7xl">Good questions.</h2>
            </div>
            <Accordion data-reveal type="single" collapsible className="w-full">
              {faqs.map((f, i) => (
                <AccordionItem key={f.q} value={`item-${i}`} className="border-border">
                  <AccordionTrigger className="py-6 text-left font-display text-lg font-medium tracking-[-0.02em] md:text-xl [&>svg]:hidden group">
                    <span className="flex w-full items-center justify-between gap-4">
                      {f.q}
                      <Plus className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300 group-data-[state=open]:rotate-45" />
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-6 text-base leading-7 text-muted-foreground">{f.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* CONTACT */}
        <section id="contact" className="section-rule px-5 py-24 md:px-10 md:py-36">
          <div data-reveal className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Have a challenge in mind?</p>
              <h2 className="mt-7 max-w-4xl font-display text-5xl font-medium tracking-[-0.055em] md:text-8xl">Let's build what's next.</h2>
              <p className="mt-6 max-w-md text-base leading-7 text-muted-foreground">Tell us where you're headed. We'll bring focus, engineering, and momentum.</p>
              <p className="mt-4 text-sm text-muted-foreground">Or email <a href="mailto:hello@vbuild.dev" className="text-foreground underline-offset-4 hover:underline">hello@vbuild.dev</a></p>
            </div>
            <Button variant="hero" size="lg" onClick={openContactDialog}>Start a project <ArrowRight /></Button>
          </div>

          <footer className="mx-auto mt-24 grid max-w-7xl gap-6 border-t border-border pt-7 text-xs text-muted-foreground sm:grid-cols-3">
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

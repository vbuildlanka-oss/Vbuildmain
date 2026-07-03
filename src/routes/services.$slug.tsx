import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { Button } from "@/components/ui/button";
import { services } from "@/data/site";
import { useSmoothScroll } from "@/lib/use-smooth-scroll";

export const Route = createFileRoute("/services/$slug")({
  loader: ({ params }) => {
    const service = services.find((s) => s.slug === params.slug);
    if (!service) throw notFound();
    return { service };
  },
  component: ServiceDetail,
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <Link to="/" className="underline">Service not found — go home</Link>
    </div>
  ),
});

function ServiceDetail() {
  const { service } = Route.useLoaderData();
  const rootRef = useRef<HTMLDivElement>(null);
  useSmoothScroll();

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      // Page entrance — cinematic stagger
      const tl = gsap.timeline({ delay: 0.15 });
      tl.from("[data-page-intro]", {
        opacity: 0, y: reduceMotion ? 0 : 50, duration: 0.9, stagger: 0.12, ease: "power3.out",
      });

      // Scroll reveals
      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
        gsap.from(el, {
          opacity: 0, y: reduceMotion ? 0 : 30, rotateX: reduceMotion ? 0 : 3,
          duration: 0.85, ease: "power2.out",
          scrollTrigger: { trigger: el, start: "top 88%", once: true },
        });
      });

      // List items cascade in
      gsap.utils.toArray<HTMLElement>("[data-list-cascade] > li").forEach((el, i) => {
        gsap.from(el, {
          opacity: 0, x: reduceMotion ? 0 : -16,
          duration: 0.6, delay: i * 0.06, ease: "power2.out",
          scrollTrigger: { trigger: el.parentElement!, start: "top 85%", once: true },
        });
      });

      // Process cards — scale in with spring
      gsap.utils.toArray<HTMLElement>("[data-process-grid] > li").forEach((el, i) => {
        gsap.from(el, {
          opacity: 0, y: reduceMotion ? 0 : 40, scale: reduceMotion ? 1 : 0.92,
          duration: 0.7, delay: i * 0.1, ease: "back.out(1.4)",
          scrollTrigger: { trigger: el.parentElement!, start: "top 85%", once: true },
        });
      });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  const openWhatsApp = () => window.open("https://wa.me/94719802526", "_blank", "noopener,noreferrer");

  return (
    <div ref={rootRef} className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-10">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> VBUILD
          </Link>
          <Button variant="glass" size="sm" onClick={openWhatsApp}>Talk to us <ArrowRight /></Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-20 md:px-10 md:py-32">
        <section data-page-intro className="max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Service</p>
          <h1 className="mt-6 font-display text-5xl font-medium leading-[1.02] tracking-[-0.05em] md:text-8xl">{service.title}</h1>
          <p className="mt-8 max-w-2xl text-lg leading-8 text-muted-foreground">{service.long}</p>
        </section>

        <section data-reveal className="mt-24 grid gap-12 border-t border-border pt-16 lg:grid-cols-[.4fr_1fr]">
          <h2 className="font-display text-3xl font-medium tracking-[-0.03em] md:text-4xl">What's included</h2>
          <ul className="space-y-4" data-list-cascade>
            {service.includes.map((item: string) => (
              <li key={item} className="flex items-start gap-3 border-b border-border pb-4 text-base text-foreground">
                <Check className="mt-1 h-4 w-4 shrink-0 text-primary" /> {item}
              </li>
            ))}
          </ul>
        </section>

        <section data-reveal className="mt-24 grid gap-12 border-t border-border pt-16 lg:grid-cols-[.4fr_1fr]">
          <h2 className="font-display text-3xl font-medium tracking-[-0.03em] md:text-4xl">Process</h2>
          <ol className="grid gap-6 sm:grid-cols-2" data-process-grid>
            {service.process.map((p: {step:string;detail:string}, i: number) => (
              <li key={p.step} className="rounded-2xl border border-border bg-card/40 p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">0{i + 1}</p>
                <p className="mt-3 font-display text-xl font-medium">{p.step}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{p.detail}</p>
              </li>
            ))}
          </ol>
        </section>

        <section data-reveal className="mt-24 grid gap-12 border-t border-border pt-16 lg:grid-cols-[.4fr_1fr]">
          <h2 className="font-display text-3xl font-medium tracking-[-0.03em] md:text-4xl">Example use cases</h2>
          <ul className="space-y-4">
            {service.useCases.map((u: string) => (
              <li key={u} className="border-b border-border pb-4 text-base text-muted-foreground">{u}</li>
            ))}
          </ul>
        </section>

        <section data-reveal className="mt-24 flex flex-col items-start justify-between gap-6 border-t border-border pt-16 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Next step</p>
            <h3 className="mt-4 font-display text-3xl font-medium tracking-[-0.04em] md:text-4xl">Let's talk specifics.</h3>
          </div>
          <Button variant="hero" size="lg" onClick={openWhatsApp}>Start on WhatsApp <ArrowRight /></Button>
        </section>
      </main>
    </div>
  );
}

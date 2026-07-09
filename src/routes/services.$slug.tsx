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
      // Page entrance
      gsap.from("[data-reveal]:first-of-type", {
        opacity: 0, y: reduceMotion ? 0 : 30, duration: 1, ease: "power3.out", delay: 0.1,
      });
      // Toggle reveals — play on scroll down, reverse on scroll up
      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
        gsap.fromTo(el,
          { opacity: 0, y: reduceMotion ? 0 : 25 },
          {
            opacity: 1, y: 0, duration: 0.8, ease: "power2.out",
            scrollTrigger: {
              trigger: el,
              start: "top 90%",
              toggleActions: "play none none reverse",
            },
          }
        );
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

      <main className="mx-auto max-w-7xl px-5 py-14 md:px-10 md:py-24 lg:py-32">
        <section data-reveal className="max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Service</p>
          <h1 className="mt-4 font-display text-3xl font-medium leading-[1.05] tracking-[-0.04em] sm:text-4xl md:mt-6 md:text-5xl lg:text-8xl">{service.title}</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground md:mt-8 md:text-lg md:leading-8">{service.long}</p>
        </section>

        <section data-reveal className="mt-14 grid gap-8 border-t border-border pt-10 md:mt-24 md:gap-12 md:pt-16 lg:grid-cols-[.4fr_1fr]">
          <h2 className="font-display text-2xl font-medium tracking-[-0.03em] sm:text-3xl md:text-4xl">What's included</h2>
          <ul className="space-y-4">
            {service.includes.map((item: string) => (
              <li key={item} className="flex items-start gap-3 border-b border-border pb-4 text-base text-foreground">
                <Check className="mt-1 h-4 w-4 shrink-0 text-primary" /> {item}
              </li>
            ))}
          </ul>
        </section>

        <section data-reveal className="mt-14 grid gap-8 border-t border-border pt-10 md:mt-24 md:gap-12 md:pt-16 lg:grid-cols-[.4fr_1fr]">
          <h2 className="font-display text-2xl font-medium tracking-[-0.03em] sm:text-3xl md:text-4xl">Process</h2>
          <ol className="grid gap-6 sm:grid-cols-2">
            {service.process.map((p: {step:string;detail:string}, i: number) => (
              <li key={p.step} className="rounded-2xl border border-border bg-card/40 p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">0{i + 1}</p>
                <p className="mt-3 font-display text-xl font-medium">{p.step}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{p.detail}</p>
              </li>
            ))}
          </ol>
        </section>

        <section data-reveal className="mt-14 grid gap-8 border-t border-border pt-10 md:mt-24 md:gap-12 md:pt-16 lg:grid-cols-[.4fr_1fr]">
          <h2 className="font-display text-2xl font-medium tracking-[-0.03em] sm:text-3xl md:text-4xl">Example use cases</h2>
          <ul className="space-y-4">
            {service.useCases.map((u: string) => (
              <li key={u} className="border-b border-border pb-4 text-base text-muted-foreground">{u}</li>
            ))}
          </ul>
        </section>

        <section data-reveal className="mt-14 flex flex-col items-start justify-between gap-5 border-t border-border pt-10 sm:flex-row sm:items-center md:mt-24 md:gap-6 md:pt-16">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Next step</p>
            <h3 className="mt-3 font-display text-2xl font-medium tracking-[-0.04em] sm:text-3xl md:mt-4 md:text-4xl">Let's talk specifics.</h3>
          </div>
          <Button variant="hero" size="lg" onClick={openWhatsApp}>Start on WhatsApp <ArrowRight /></Button>
        </section>
      </main>
    </div>
  );
}

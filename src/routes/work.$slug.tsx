import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { Button } from "@/components/ui/button";
import { projects } from "@/data/site";
import { useSmoothScroll } from "@/lib/use-smooth-scroll";

export const Route = createFileRoute("/work/$slug")({
  loader: ({ params }) => {
    const project = projects.find((p) => p.slug === params.slug);
    if (!project) throw notFound();
    return { project };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.project.title} — VBUILD` },
      { name: "description", content: loaderData?.project.copy ?? "" },
      { property: "og:title", content: `${loaderData?.project.title} — VBUILD` },
      { property: "og:description", content: loaderData?.project.copy ?? "" },
      { property: "og:image", content: loaderData?.project.image ?? "" },
    ],
  }),
  component: WorkDetail,
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <Link to="/" className="underline">Project not found — go home</Link>
    </div>
  ),
});

function WorkDetail() {
  const { project } = Route.useLoaderData();
  const rootRef = useRef<HTMLDivElement>(null);
  useSmoothScroll();

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
        gsap.from(el, { opacity: 0, y: reduceMotion ? 0 : 24, duration: 0.8, ease: "power2.out", scrollTrigger: { trigger: el, start: "top 88%", once: true } });
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
        <section data-reveal className="max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Selected work</p>
          <h1 className="mt-6 font-display text-5xl font-medium leading-[1.02] tracking-[-0.05em] md:text-8xl">{project.title}</h1>
          <p className="mt-8 max-w-2xl text-lg leading-8 text-muted-foreground">{project.copy}</p>
        </section>

        <section data-reveal className="mt-16 overflow-hidden rounded-3xl border border-border">
          <img src={project.image} alt={project.title} loading="lazy" width={1280} height={768} className="aspect-[16/9] w-full object-cover" />
        </section>

        <section className="mt-20 grid gap-12 lg:grid-cols-3">
          <article data-reveal className="border-t border-border pt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Problem</p>
            <p className="mt-4 text-base leading-7 text-muted-foreground">{project.problem}</p>
          </article>
          <article data-reveal className="border-t border-border pt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Solution</p>
            <p className="mt-4 text-base leading-7 text-muted-foreground">{project.solution}</p>
          </article>
          <article data-reveal className="border-t border-border pt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Outcome</p>
            <p className="mt-4 text-base leading-7 text-muted-foreground">{project.outcome}</p>
          </article>
        </section>

        <section data-reveal className="mt-20 border-t border-border pt-12">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Stack</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {project.stack.map((t: string) => (
              <span key={t} className="rounded-full border border-border bg-card/40 px-4 py-2 text-xs text-foreground">{t}</span>
            ))}
          </div>
        </section>

        {project.liveUrl && (
          <section data-reveal className="mt-12">
            <a href={project.liveUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-primary hover:underline">
              Visit live site <ExternalLink className="h-4 w-4" />
            </a>
          </section>
        )}

        <section data-reveal className="mt-24 flex flex-col items-start justify-between gap-6 border-t border-border pt-16 sm:flex-row sm:items-center">
          <h3 className="font-display text-3xl font-medium tracking-[-0.04em] md:text-4xl">Have a similar challenge?</h3>
          <Button variant="hero" size="lg" onClick={openWhatsApp}>Start on WhatsApp <ArrowRight /></Button>
        </section>
      </main>
    </div>
  );
}

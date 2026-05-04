import { ArrowRight, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { trackEvent } from "@/lib/track";
import { cta, infrastrutture } from "../content";
import { FadeUp } from "./FadeUp";

type Block = (typeof infrastrutture.blocks)[number];

export function InfrastrutturaBlock({ block, index }: { block: Block; index: number }) {
  const cream = index % 2 === 1;
  const flow = block.locked ? ["Dati", "AI", "Scalabilita"] : ["Input", "Analisi", "Azione"];

  return (
    <article className={cream ? "relative overflow-hidden bg-eic-cream" : "relative overflow-hidden bg-white"}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-eic-navy/12 to-transparent" />
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-20 md:px-8 lg:grid-cols-12 lg:py-28">
        <FadeUp className="lg:col-span-2">
          <span className="block text-[7.5rem] font-black leading-none tracking-[-0.08em] text-eic-orange/95 md:text-[10rem] lg:text-[15rem]">
            {block.letter}
          </span>
        </FadeUp>
        <FadeUp className="rounded-md border border-eic-navy/10 bg-white/78 p-6 shadow-xl shadow-eic-navy/6 backdrop-blur md:p-8 lg:col-span-9 lg:col-start-4">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-5xl font-black tracking-[-0.04em] text-eic-ink md:text-6xl">
              {block.locked && <Lock className="mr-3 inline h-8 w-8 text-eic-orange" strokeWidth={1.5} />}
              {block.title}
            </h3>
            <span className="text-sm font-bold uppercase tracking-[0.2em] text-eic-navy/55">{block.subtitle}</span>
          </div>
          <p className="mt-5 text-3xl font-extrabold leading-tight tracking-[-0.03em] text-eic-navy">{block.tagline}</p>
          <div className="mt-7 grid gap-2 sm:grid-cols-3">
            {flow.map((step, stepIndex) => (
              <div key={step} className="rounded-md border border-eic-navy/10 bg-eic-cream px-4 py-3">
                <span className="text-xs font-black uppercase tracking-[0.18em] text-eic-orange">0{stepIndex + 1}</span>
                <p className="mt-1 font-black text-eic-ink">{step}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 max-w-3xl space-y-6 text-lg leading-8 text-eic-ink/76">
            {block.paragraphs.map((paragraph) => (
              <p key={paragraph} className="whitespace-pre-line">
                {paragraph}
              </p>
            ))}
          </div>
          {"emphasis" in block && block.emphasis && (
            <div className="mt-8 rounded-md bg-eic-orange p-6 text-white">
              <p className="font-semibold">{block.emphasis}</p>
            </div>
          )}
          <Link
            to={cta.primaryHref}
            onClick={() =>
              trackEvent("landing_ai_cta_consulenza_click", {
                section_name: `infrastruttura_${block.letter.toLowerCase()}`,
              })
            }
            className="mt-8 inline-flex items-center gap-2 text-base font-black text-eic-orange underline-offset-4 transition hover:underline focus:outline-none focus:ring-2 focus:ring-eic-orange focus:ring-offset-2"
          >
            {block.cta}
            <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
          </Link>
        </FadeUp>
      </div>
    </article>
  );
}

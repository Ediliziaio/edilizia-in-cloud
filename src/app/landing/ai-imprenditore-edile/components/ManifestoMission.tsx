import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/track";
import { cta, manifesto } from "../content";
import { FadeUp } from "./FadeUp";

export function ManifestoMission() {
  return (
    <section className="relative overflow-hidden bg-black px-5 py-24 text-white md:px-8 lg:py-32">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.09) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.09) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
        }}
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-1/2 h-px w-full bg-gradient-to-r from-transparent via-eic-orange/80 to-transparent"
        animate={{ scaleX: [0.35, 1, 0.35], opacity: [0.25, 0.8, 0.25] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="relative mx-auto max-w-6xl">
        <FadeUp className="text-center">
          <h2 className="flex flex-col items-center justify-center gap-2 text-display-lg font-black md:flex-row md:flex-wrap md:gap-x-5">
            {manifesto.titleParts.map((part, index) => (
              <span key={part} className="block">
                <span>{part}</span>
                {index < manifesto.titleParts.length - 1 && <span className="hidden text-eic-orange md:ml-5 md:inline">/</span>}
              </span>
            ))}
          </h2>
          <p className="mx-auto mt-6 max-w-3xl text-3xl font-extrabold leading-tight tracking-[-0.03em] text-white/86">
            {manifesto.titleItalic}
          </p>
        </FadeUp>
        <FadeUp className="mx-auto mt-14 max-w-4xl space-y-6 text-lg leading-8 text-white/68">
          {manifesto.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          <div className="relative overflow-hidden rounded-md border border-eic-orange/35 bg-eic-orange/18 p-8 shadow-2xl shadow-eic-orange/10">
            <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-eic-orange" />
            <p className="text-3xl font-black leading-tight tracking-[-0.03em] text-white">“{manifesto.quote}”</p>
          </div>
          <p className="whitespace-pre-line text-white/80">{manifesto.close}</p>
        </FadeUp>
        <FadeUp className="mx-auto mt-10 grid max-w-4xl gap-3 md:grid-cols-3">
          {["Vedi il problema", "Capisci l'impatto", "Decidi l'azione"].map((item, index) => (
            <div key={item} className="rounded-md border border-white/10 bg-white/[0.045] p-4">
              <span className="text-xs font-black uppercase tracking-[0.2em] text-eic-orange">0{index + 1}</span>
              <p className="mt-2 text-lg font-black text-white">{item}</p>
            </div>
          ))}
        </FadeUp>
        <FadeUp className="mx-auto mt-12 flex max-w-4xl flex-col items-start gap-4 md:flex-row md:items-center">
          <span className="text-2xl font-black tracking-[-0.03em] text-eic-orange">{manifesto.ctaLead}</span>
          <Button
            asChild
            className="h-14 rounded-full bg-eic-orange px-8 font-semibold text-white transition hover:scale-[1.02] hover:bg-eic-orange hover:shadow-lg hover:shadow-eic-orange/30"
          >
            <Link
              to={cta.primaryHref}
              onClick={() => trackEvent("landing_ai_cta_consulenza_click", { section_name: "manifesto" })}
            >
              {manifesto.cta}
              <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
            </Link>
          </Button>
        </FadeUp>
      </div>
    </section>
  );
}

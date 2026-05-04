import { ArrowRight, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/track";
import { cta, ctaFinale } from "../content";
import { FadeUp } from "./FadeUp";

export function CTAFinale() {
  return (
    <section className="relative overflow-hidden bg-eic-orange px-5 py-24 text-white md:px-8 lg:py-32">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.2) 1px, transparent 1px)",
          backgroundSize: "58px 58px",
        }}
      />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-eic-navy/18 to-transparent" />
      <FadeUp className="relative mx-auto max-w-6xl text-center">
        <div className="mx-auto mb-8 grid max-w-3xl gap-2 text-sm font-black uppercase tracking-[0.16em] sm:grid-cols-3">
          {["31 giorni", "setup guidato", "dati reali"].map((item) => (
            <span key={item} className="rounded-full border border-white/30 bg-white/12 px-4 py-2">
              {item}
            </span>
          ))}
        </div>
        <h2 className="text-display-xl font-black">
          {ctaFinale.line1}
          <span className="mt-4 block">{ctaFinale.line2}</span>
        </h2>
        <p className="mx-auto mt-8 max-w-3xl text-xl leading-8 text-white/88">{ctaFinale.sub}</p>
        <Button
          asChild
          className="mt-10 h-auto min-h-20 w-full max-w-full whitespace-normal rounded-full bg-eic-navy px-6 py-5 text-xl font-black text-white transition hover:scale-[1.02] hover:bg-eic-navy hover:shadow-2xl hover:shadow-eic-navy/30 sm:w-auto sm:px-12 sm:text-2xl"
        >
          <Link
            to={cta.primaryHref}
            onClick={() => trackEvent("landing_ai_cta_consulenza_click", { section_name: "final_cta" })}
          >
            {ctaFinale.button}
            <ArrowRight className="h-6 w-6" strokeWidth={1.5} />
          </Link>
        </Button>
        <div className="mt-10 grid gap-3 text-sm text-white/85 md:grid-cols-4">
          {ctaFinale.trust.map((item) => (
            <span key={item} className="inline-flex items-center justify-center gap-2">
              <Check className="h-4 w-4" strokeWidth={1.5} />
              {item}
            </span>
          ))}
        </div>
      </FadeUp>
    </section>
  );
}

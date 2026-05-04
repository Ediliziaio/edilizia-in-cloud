import { ArrowRight, Check, ChevronDown, MessageCircle, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import logo from "@/assets/edilizia-in-cloud-logo.webp";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/track";
import { cta, hero, nav } from "../content";
import { FadeUp } from "./FadeUp";
import { HeroVisual } from "./HeroVisual";

function highlightHero(text: string) {
  const parts = text.split(/(AI|soldi|vendite|margini|cassa|cantieri|senza assumere|senza inseguire)/gi);
  return parts.map((part, index) =>
    ["ai", "soldi", "vendite", "margini", "cassa", "cantieri", "senza assumere", "senza inseguire"].includes(part.toLowerCase()) ? (
      <span key={`${part}-${index}`} className="text-eic-orange">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export function Hero() {
  return (
    <section className="relative min-h-[88vh] overflow-hidden bg-eic-navy-90 text-white">
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, rgba(249,115,22,.28), transparent 26%), linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px)",
          backgroundSize: "100% 100%, 56px 56px, 56px 56px",
        }}
      />
      <div className="pointer-events-none absolute -right-24 top-24 h-80 w-80 rounded-full bg-eic-orange/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-16 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-eic-navy-50/30 blur-3xl" />
      <a
        href="#contenuto"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-white focus:px-5 focus:py-3 focus:text-eic-navy focus:ring-2 focus:ring-eic-orange"
      >
        Vai al contenuto
      </a>

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-5 md:px-8">
        <Link to="/" className="group inline-flex items-center gap-3 focus:outline-none focus:ring-2 focus:ring-eic-orange focus:ring-offset-2 focus:ring-offset-eic-navy-90">
          <img
            src={logo}
            alt="Edilizia in Cloud"
            width={144}
            height={36}
            className="h-9 w-auto brightness-0 invert transition group-hover:opacity-90"
          />
        </Link>
        <Button
          asChild
          className="h-11 rounded-full bg-eic-orange px-5 font-semibold text-white shadow-none transition hover:scale-[1.02] hover:bg-eic-orange hover:shadow-lg hover:shadow-eic-orange/25"
        >
          <a
            href={cta.whatsappHref}
            onClick={() => trackEvent("landing_ai_lucia_whatsapp_click", { section_name: "hero_nav" })}
            aria-label="Parla con Lucia su WhatsApp"
          >
            <MessageCircle className="h-4 w-4" strokeWidth={1.5} />
            <span className="hidden sm:inline">{nav.cta}</span>
            <span className="sm:hidden">Lucia</span>
          </a>
        </Button>
      </header>

      <div id="contenuto" className="relative z-10 mx-auto max-w-6xl px-5 pb-16 pt-10 text-center md:px-8 md:pt-12 lg:pb-20 lg:pt-12">
        <FadeUp className="mx-auto max-w-[62rem]">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-eic-orange/35 bg-eic-orange/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-eic-orange md:text-[11px]">
            <Sparkles className="h-4 w-4" strokeWidth={1.5} />
            EdiliziaInCloud × AI
          </p>
          <h1 className="mx-auto max-w-[58rem] text-[clamp(2.05rem,4.15vw,4.75rem)] font-black leading-[1.01] tracking-[-0.05em] text-white">
            <span>{highlightHero(hero.headlineLine1)}</span>
            <span className="mx-auto mt-4 block max-w-[48rem] text-[clamp(1.05rem,1.45vw,1.45rem)] font-extrabold leading-[1.22] tracking-[-0.025em] text-white/92">
              {highlightHero(hero.headlineLine2)}
            </span>
          </h1>
          <div className="mx-auto mt-5 max-w-[46rem] space-y-2.5 text-[15px] leading-7 text-white/76 md:text-[16px] md:leading-7">
            <p>{hero.subheadline[0]}</p>
            <p className="font-semibold text-white">{hero.subheadline[1]}</p>
          </div>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row sm:items-center">
            <Button
              asChild
              className="h-[52px] rounded-full bg-eic-orange px-7 text-base font-semibold text-white transition hover:scale-[1.02] hover:bg-eic-orange hover:shadow-lg hover:shadow-eic-orange/30"
            >
              <Link
                to={cta.primaryHref}
                onClick={() => trackEvent("landing_ai_cta_consulenza_click", { section_name: "hero" })}
              >
                {hero.cta}
                <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
              </Link>
            </Button>
            <span className="text-sm text-white/62">{hero.ctaNote}</span>
          </div>
          <div className="mx-auto mt-5 grid max-w-4xl gap-2.5 text-left text-[13px] text-white/72 sm:grid-cols-2 lg:grid-cols-4">
            {hero.trust.map((item) => (
              <span key={item} className="inline-flex items-center gap-2">
                <Check className="h-4 w-4 text-eic-orange" strokeWidth={1.5} />
                {item}
              </span>
            ))}
          </div>
        </FadeUp>
        <HeroVisual />
        <FadeUp className="mx-auto mt-6 max-w-3xl rounded-md border border-white/12 bg-white/[0.06] p-4 text-sm leading-6 text-white/70">
          “{hero.quote}”
          <span className="mt-2 block text-xs font-black uppercase tracking-[0.18em] text-eic-orange">{hero.quoteAuthor}</span>
        </FadeUp>
      </div>

      <motion.div
        aria-hidden="true"
        className="absolute bottom-7 left-1/2 z-10 -translate-x-1/2 text-white/50"
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
      >
        <ChevronDown className="h-7 w-7" strokeWidth={1.5} />
      </motion.div>
    </section>
  );
}

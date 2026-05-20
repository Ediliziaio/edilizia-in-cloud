import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowRight, Check, ChevronDown, MessageCircle, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import logo from "@/assets/edilizia-in-cloud-logo-small.webp";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/track";
import { cta, hero, nav } from "../content";
import { FadeUp } from "./FadeUp";
import { HeroVisual } from "./HeroVisual";

const signalNodes = [
  { label: "CRM", top: "18%", left: "8%" },
  { label: "DDT", top: "38%", left: "4%" },
  { label: "SAL", top: "70%", left: "9%" },
  { label: "KPI", top: "22%", right: "10%" },
  { label: "AI", top: "51%", right: "5%" },
  { label: "Cassa", top: "74%", right: "12%" },
];

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

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function Hero() {
  const heroRef = useRef<HTMLElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const scrollCueRef = useRef<HTMLDivElement>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const motion = gsap.matchMedia();

    motion.add("(prefers-reduced-motion: reduce)", () => {
      gsap.set(".landing-ai-hero-item, .landing-ai-trust-item", { opacity: 1, y: 0, scale: 1, clearProps: "transform" });
    });

    motion.add("(prefers-reduced-motion: no-preference)", () => {
      const cleanups: Array<() => void> = [];
      const timeline = gsap.timeline({ defaults: { ease: "power3.out" } });

      timeline
        .from(".landing-ai-nav", { opacity: 0, y: -18, duration: 0.58 })
        .from(".landing-ai-hero-item", {
          opacity: 0,
          y: 34,
          duration: 0.74,
          stagger: 0.085,
          clearProps: "opacity,transform",
        }, 0.08)
        .from(".landing-ai-trust-item", {
          opacity: 0,
          y: 12,
          duration: 0.42,
          stagger: 0.045,
          clearProps: "opacity,transform",
        }, 0.56);

      gsap.to(".landing-ai-orb", {
        xPercent: 8,
        yPercent: -7,
        duration: 7,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
        stagger: 0.5,
      });

      gsap.to(".landing-ai-signal-node", {
        y: (index) => (index % 2 === 0 ? -12 : 12),
        rotation: (index) => (index % 2 === 0 ? 2 : -2),
        duration: 3.8,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
        stagger: 0.18,
      });

      gsap.to(".landing-ai-signal-node span", {
        boxShadow: "0 0 28px rgba(249,115,22,0.42)",
        duration: 1.7,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
        stagger: { each: 0.18, from: "random" },
      });

      if (spotlightRef.current && heroRef.current) {
        const xTo = gsap.quickTo(spotlightRef.current, "x", { duration: 0.55, ease: "power3" });
        const yTo = gsap.quickTo(spotlightRef.current, "y", { duration: 0.55, ease: "power3" });
        const show = () => gsap.to(spotlightRef.current, { autoAlpha: 1, duration: 0.25, overwrite: "auto" });
        const hide = () => gsap.to(spotlightRef.current, { autoAlpha: 0, duration: 0.35, overwrite: "auto" });
        const move = (event: PointerEvent) => {
          const rect = heroRef.current?.getBoundingClientRect();
          if (!rect) return;
          xTo(event.clientX - rect.left);
          yTo(event.clientY - rect.top);
        };

        heroRef.current.addEventListener("pointerenter", show);
        heroRef.current.addEventListener("pointerleave", hide);
        heroRef.current.addEventListener("pointermove", move);

        cleanups.push(() => {
          heroRef.current?.removeEventListener("pointerenter", show);
          heroRef.current?.removeEventListener("pointerleave", hide);
          heroRef.current?.removeEventListener("pointermove", move);
        });
      }

      if (bgRef.current && heroRef.current) {
        gsap.to(bgRef.current, {
          yPercent: 10,
          ease: "none",
          scrollTrigger: {
            trigger: heroRef.current,
            start: "top top",
            end: "bottom top",
            scrub: 0.8,
          },
        });
      }

      if (scrollCueRef.current) {
        gsap.to(scrollCueRef.current, {
          y: 8,
          duration: 1.2,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        });
      }

      return () => cleanups.forEach((cleanup) => cleanup());
    });

    return () => motion.revert();
  }, { scope: heroRef });

  return (
    <section ref={heroRef} className="relative min-h-[88vh] overflow-hidden bg-eic-navy-90 text-white">
      <div
        ref={bgRef}
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, rgba(249,115,22,.28), transparent 26%), linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px)",
          backgroundSize: "100% 100%, 56px 56px, 56px 56px",
        }}
      />
      <div className="landing-ai-orb pointer-events-none absolute -right-24 top-24 h-80 w-80 rounded-full bg-eic-orange/20 blur-3xl" />
      <div className="landing-ai-orb pointer-events-none absolute bottom-16 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-eic-navy-50/30 blur-3xl" />
      <div
        ref={spotlightRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 z-[1] hidden h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 mix-blend-screen blur-3xl md:block"
        style={{
          background: "radial-gradient(circle, rgba(249,115,22,0.28) 0%, rgba(249,115,22,0.11) 28%, transparent 68%)",
        }}
      />
      {signalNodes.map((node) => (
        <div
          key={node.label}
          aria-hidden="true"
          className="landing-ai-signal-node pointer-events-none absolute z-[2] hidden md:block"
          style={{ top: node.top, left: node.left, right: node.right }}
        >
          <span className="inline-flex h-11 min-w-11 items-center justify-center rounded-full border border-eic-orange/35 bg-eic-orange/10 px-3 text-[10px] font-black uppercase tracking-[0.18em] text-eic-orange backdrop-blur-md">
            {node.label}
          </span>
        </div>
      ))}
      <a
        href="#contenuto"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-white focus:px-5 focus:py-3 focus:text-eic-navy focus:ring-2 focus:ring-eic-orange"
      >
        Vai al contenuto
      </a>

      <header className="landing-ai-nav relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-5 md:px-8">
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
            onClick={() => trackEvent("landing_ai_silvio_whatsapp_click", { section_name: "hero_nav" })}
            aria-label="Parla con Silvio su WhatsApp"
          >
            <MessageCircle className="h-4 w-4" strokeWidth={1.5} />
            <span className="hidden sm:inline">{nav.cta}</span>
            <span className="sm:hidden">Silvio</span>
          </a>
        </Button>
      </header>

      <div id="contenuto" className="relative z-10 mx-auto max-w-6xl px-5 pb-14 pt-8 text-center md:px-8 md:pt-10 lg:pb-16 lg:pt-10">
        <div className="mx-auto max-w-[62rem]">
          <p className="landing-ai-hero-item mb-3 inline-flex items-center gap-2 rounded-full border border-eic-orange/35 bg-eic-orange/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-eic-orange md:text-[11px]">
            <Sparkles className="h-4 w-4" strokeWidth={1.5} />
            EdiliziaInCloud × AI
          </p>
          <h1 className="landing-ai-hero-item mx-auto max-w-[56rem] text-[clamp(2rem,4vw,4.55rem)] font-black leading-[1.02] tracking-[-0.045em] text-white">
            <span>{highlightHero(hero.headlineLine1)}</span>
            <span className="mx-auto mt-4 block max-w-[48rem] text-[clamp(1.05rem,1.45vw,1.45rem)] font-extrabold leading-[1.22] tracking-[-0.025em] text-white/92">
              {highlightHero(hero.headlineLine2)}
            </span>
          </h1>
          <div className="landing-ai-hero-item mx-auto mt-5 max-w-[46rem] space-y-2.5 text-[15px] leading-7 text-white/76 md:text-[16px] md:leading-7">
            <p>{hero.subheadline[0]}</p>
            <p className="font-semibold text-white">{hero.subheadline[1]}</p>
          </div>
          <div className="landing-ai-hero-item mx-auto mt-7 max-w-4xl rounded-md border border-white/10 bg-white/[0.055] p-2.5 shadow-2xl shadow-black/18 backdrop-blur">
            <div className="flex flex-col items-center justify-between gap-3 rounded-[6px] border border-white/[0.08] bg-eic-navy/35 px-3 py-3 sm:flex-row sm:px-4">
              <Button
                asChild
                className="h-[54px] w-full rounded-full bg-eic-orange px-7 text-base font-semibold text-white transition hover:scale-[1.02] hover:bg-eic-orange hover:shadow-lg hover:shadow-eic-orange/30 sm:w-auto"
              >
                <Link
                  to={cta.primaryHref}
                  onClick={() => trackEvent("landing_ai_cta_consulenza_click", { section_name: "hero" })}
                >
                  {hero.cta}
                  <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
                </Link>
              </Button>
              <div className="text-center sm:text-left">
                <p className="text-sm font-semibold text-white">{hero.ctaNote}</p>
                <p className="mt-1 text-xs text-white/48">Analisi su vendite, cantieri, cassa e margini reali.</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-2 pb-1 text-[12px] font-semibold text-white/66">
              {hero.trust.map((item) => (
                <span key={item} className="landing-ai-trust-item inline-flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-eic-orange" strokeWidth={1.7} />
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
        <HeroVisual />
        <FadeUp className="mx-auto mt-6 max-w-3xl rounded-md border border-white/12 bg-white/[0.06] p-4 text-sm leading-6 text-white/70">
          “{hero.quote}”
          <span className="mt-2 block text-xs font-black uppercase tracking-[0.18em] text-eic-orange">{hero.quoteAuthor}</span>
        </FadeUp>
      </div>

      <div
        ref={scrollCueRef}
        aria-hidden="true"
        className="absolute bottom-7 left-1/2 z-10 -translate-x-1/2 text-white/50"
      >
        <ChevronDown className="h-7 w-7" strokeWidth={1.5} />
      </div>
    </section>
  );
}

import { useEffect, useRef, useState } from "react";
// GSAP + ScrollTrigger ora lazy: PageSpeed desktop flaggava 90KB di
// JS + 2.7s di Script Evaluation per animazioni decorative non critiche
// al LCP (testo "Aumenta margini..."). L'effetto è eseguito dopo il primo
// paint senza bloccare il TBT iniziale.
import {
  Hammer, HardHat, Ruler, Warehouse, Wrench, Building2, Blocks, ConeIcon, Star,
  Shield, Zap,
} from "lucide-react";
import PlatformMockup from "@/components/landing/PlatformMockup";

const floatingIcons: Array<{ Icon: typeof HardHat; top: string; left?: string; right?: string; size: number; delay: string; anim: string }> = [
  { Icon: HardHat, top: "10%", left: "5%", size: 48, delay: "0s", anim: "animate-float" },
  { Icon: Hammer, top: "20%", right: "8%", size: 40, delay: "1s", anim: "animate-float-slow" },
  { Icon: Ruler, top: "60%", left: "10%", size: 36, delay: "2s", anim: "animate-float" },
  { Icon: Warehouse, top: "70%", right: "12%", size: 44, delay: "0.5s", anim: "animate-float-slow" },
  { Icon: Wrench, top: "40%", left: "3%", size: 32, delay: "3s", anim: "animate-float" },
  { Icon: Building2, top: "15%", left: "80%", size: 52, delay: "1.5s", anim: "animate-float-slow" },
  { Icon: Blocks, top: "80%", left: "25%", size: 38, delay: "2.5s", anim: "animate-float" },
  { Icon: ConeIcon, top: "50%", right: "5%", size: 34, delay: "0.8s", anim: "animate-float-slow" },
];




const typingWords = ["i tuoi margini", "la tua cassa", "i tuoi cantieri", "il tuo marketing"];

const microBadges = [
  { Icon: Shield, label: "GDPR Compliant" },
  { Icon: Zap, label: "Setup in 48h" },
  { Icon: Star, label: "4.9/5 stelle" },
];

export default function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const backgroundRef = useRef<HTMLImageElement>(null);

  // Typing animation state
  const [, setWordIndex] = useState(0);
  const [displayWord, setDisplayWord] = useState(typingWords[0]);
  const [fadeState, setFadeState] = useState<"in" | "out">("in");

  useEffect(() => {
    const interval = setInterval(() => {
      setFadeState("out");
      setTimeout(() => {
        setWordIndex((prev) => {
          const next = (prev + 1) % typingWords.length;
          setDisplayWord(typingWords[next]);
          return next;
        });
        setFadeState("in");
      }, 350);
    }, 2200);
    return () => clearInterval(interval);
  }, []);

  // GSAP caricato dopo il primo paint via dynamic import.
  // PERF: Prima import statico a top-level caricava ~90KB sincronicamente
  // bloccando il main thread (TBT). Ora le entrance animations partono solo
  // se l'utente non ha prefers-reduced-motion E quando il browser è idle.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let mounted = true;
    let revert: (() => void) | null = null;

    const idle = (cb: () => void) => {
      type IdleCallbackWindow = Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
      const w = window as IdleCallbackWindow;
      if (typeof w.requestIdleCallback === "function") {
        w.requestIdleCallback(cb, { timeout: 1200 });
      } else {
        setTimeout(cb, 200);
      }
    };

    idle(() => {
      if (!mounted) return;
      Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]).then(([gsapMod, stMod]) => {
        if (!mounted) return;
        const gsap = gsapMod.default;
        const ScrollTrigger = stMod.ScrollTrigger;
        gsap.registerPlugin(ScrollTrigger);

        const motion = gsap.matchMedia();
        motion.add("(prefers-reduced-motion: no-preference)", () => {
          const timeline = gsap.timeline({ defaults: { ease: "power3.out" } });
          timeline
            .from(".gsap-hero-item", { opacity: 0, y: 28, duration: 0.72, stagger: 0.09, clearProps: "opacity,transform" })
            .from(".gsap-dashboard", { opacity: 0, y: 42, scale: 0.97, duration: 0.9, clearProps: "opacity,transform" }, 0.18)
            .from(".gsap-card", { opacity: 0, y: 14, duration: 0.42, stagger: 0.035, clearProps: "opacity,transform" }, 0.55);

          if (backgroundRef.current && sectionRef.current) {
            gsap.to(backgroundRef.current, {
              yPercent: 9,
              ease: "none",
              scrollTrigger: {
                trigger: sectionRef.current,
                start: "top top",
                end: "bottom top",
                scrub: 0.7,
              },
            });
          }
        });
        revert = () => motion.revert();
      }).catch(() => { /* GSAP non disponibile: la pagina resta funzionale */ });
    });

    return () => {
      mounted = false;
      if (revert) revert();
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden pt-20 md:pt-36 pb-14 md:pb-20"
    >
      {/* Real photo background with parallax — <img> tag for LCP eligibility.
          Responsive srcset + WebP per ridurre il LCP mobile:
          PSI flaggava 387KB caricati per un'immagine coperta da gradient 92%.
          Il <picture> limita i telefoni (≤640px CSS) alla variante 768w (~55KB):
          con sizes=100vw un display 3x sceglieva la 1440w da 152KB — è l'elemento
          LCP e su 4G valeva da solo ~2.5s (audit Lighthouse 11/06: LCP 8.9s).
          768w su 390px@3x = ~2x effettivo: indistinguibile sotto gradient. */}
      <picture>
        <source
          media="(max-width: 640px)"
          srcSet="/hero/cantiere-480.webp 480w, /hero/cantiere-768.webp 768w"
          sizes="100vw"
        />
        <img
          ref={backgroundRef}
          // v8.6.121 — Hero image SELF-HOSTED in public/hero/ invece di Unsplash.
          // Vantaggi:
          //   • -1 preconnect a images.unsplash.com (risparmio handshake)
          //   • Servito da Cloudflare Pages same-origin (no CORS preflight)
          //   • Cache headers controllabili (immutable 1y)
          //   • PageSpeed flag "Use a CDN" → soddisfatto
          src="/hero/cantiere-1024.webp"
          srcSet="
            /hero/cantiere-480.webp 480w,
            /hero/cantiere-768.webp 768w,
            /hero/cantiere-1024.webp 1024w,
            /hero/cantiere-1440.webp 1440w,
            /hero/cantiere-1920.webp 1920w
          "
          sizes="100vw"
          alt="Cantiere edile italiano gestito con Edilizia in Cloud"
          {...{ fetchpriority: "high" }}
          loading="eager"
          decoding="async"
          width={1920}
          height={1080}
          className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none select-none"
          style={{ willChange: "transform" }}
        />
      </picture>

      {/* Gradient overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(135deg, rgba(17,17,17,0.92) 0%, rgba(15,29,53,0.88) 50%, rgba(17,17,17,0.85) 100%)",
        }}
      />

      {/* Grid overlay */}
      <div className="absolute inset-0 opacity-[0.04]" style={{
        backgroundImage: "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
      }} />

      {/* Floating construction icons */}
      {floatingIcons.map(({ Icon, top, left, right, size, delay, anim }, i) => (
        <div
          key={i}
          className={`absolute text-[#F97415] ${anim} hidden md:block`}
          style={{
            top, left, right,
            animationDelay: delay,
            opacity: 0.22,
            filter: `drop-shadow(0 0 ${Math.round(size / 5)}px rgba(249,116,21,0.55))`,
          }}
        >
          <Icon size={size} strokeWidth={1} />
        </div>
      ))}

      {/* Gradient orbs */}
      <div className="absolute top-1/4 left-1/4 w-48 h-48 md:w-96 md:h-96 bg-[#F97415]/[0.10] rounded-full blur-[120px]" />
      <div className="absolute bottom-1/4 right-1/4 w-40 h-40 md:w-80 md:h-80 bg-[#F97415]/[0.07] rounded-full blur-[100px]" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[#F97415]/[0.04] rounded-full blur-[80px]" />

      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
        {/* 1. Badge animato */}
        <div className="gsap-hero-item">
          <span className="inline-flex items-center gap-2 mb-6 px-3 md:px-5 py-2 rounded-full border border-[#F97415]/40 bg-[#F97415]/10 text-[#F97415] text-[10px] md:text-xs font-semibold uppercase tracking-wider md:tracking-widest relative overflow-hidden">
            <span className="absolute inset-0 animate-shimmer" style={{ backgroundImage: "linear-gradient(90deg, transparent 0%, rgba(249,116,21,0.15) 50%, transparent 100%)", backgroundSize: "200% 100%" }} />
            {/* Pulsing dot */}
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
            </span>
            <span className="relative">Gestionale n°1 per imprese edili — 150+ aziende già attive</span>
          </span>
        </div>

        {/* 2. Titolo con typing animation */}
        <div className="gsap-hero-item">
          <h1 className="mx-auto mb-4 max-w-6xl font-extrabold leading-[1.03] tracking-tight md:mb-5">
            <span className="block text-white text-[clamp(2.15rem,5.1vw,5.25rem)]">
              Aumenta margini, utili e guadagni.
            </span>
            <span className="mt-2 block text-[#F97415] text-[clamp(1.95rem,4.45vw,4.6rem)] md:mt-3">
              Controlla la tua azienda con l'AI per l'edilizia.
            </span>
          </h1>

          {/* Titolo con parola che cambia */}
          <div className="mb-3 text-lg font-bold text-white/90 sm:text-2xl md:text-3xl lg:text-4xl">
            Controlla{" "}
            <span
              className="inline-block min-w-[118px] text-[#F97415] transition-all duration-350 sm:min-w-[160px] md:min-w-[250px]"
              style={{
                opacity: fadeState === "in" ? 1 : 0,
                transform: fadeState === "in" ? "translateY(0)" : "translateY(-8px)",
                transition: "opacity 0.35s ease, transform 0.35s ease",
              }}
            >
              {displayWord}
            </span>{" "}
            in tempo reale
          </div>

          <p className="text-sm md:text-base text-white/70 mb-0 max-w-xl mx-auto">
            Il gestionale con AI costruito da zero per l'edilizia italiana: margini reali per commessa, cassa a 90 giorni, cantieri sotto controllo.
          </p>
        </div>

        {/* 3. CTA Buttons */}
        <div className="gsap-hero-item flex flex-col sm:flex-row items-center justify-center gap-4 mt-7 md:mt-8">
          <button
            type="button"
            onClick={() => { import("@/components/landing/QuickContactModal").then(m => m.openContactModal()); }}
            className="w-full sm:w-auto px-6 md:px-8 py-3 md:py-4 rounded-full bg-[#C94F06] text-white font-bold text-base md:text-lg hover:bg-[#A84305] hover:scale-105 transition-all duration-200 animate-pulse-glow shadow-lg shadow-[#C94F06]/30"
          >
            Inizia Gratis — 31 Giorni
          </button>
          <a
            href="#come-funziona"
            onClick={(e) => { e.preventDefault(); document.querySelector("#come-funziona")?.scrollIntoView({ behavior: "smooth" }); }}
            className="w-full sm:w-auto px-6 md:px-8 py-3 md:py-4 rounded-full border border-white/20 text-white font-semibold hover:bg-white/5 hover:border-white/40 transition-all duration-200"
          >
            Guarda come funziona
          </a>
        </div>

        {/* Micro-badges */}
        <div className="gsap-hero-item flex flex-wrap items-center justify-center gap-3 mt-5">
          {microBadges.map(({ Icon, label }, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/8 border border-white/12 text-white/60 text-[10px] md:text-xs font-medium"
            >
              <Icon size={12} className="text-[#F97415]" />
              {label}
            </span>
          ))}
        </div>

        {/* 3. La piattaforma vera, riprodotta: vedi PlatformMockup */}
        <PlatformMockup />

      </div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent md:h-24" />
    </section>
  );
}

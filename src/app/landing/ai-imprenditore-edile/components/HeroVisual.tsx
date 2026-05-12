import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Building2,
  CalendarDays,
  CheckCircle2,
  Euro,
  FileText,
  Hammer,
  MessageSquare,
  PackageCheck,
  Sparkles,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { motion } from "framer-motion";

const incomingSignals = [
  { label: "Preventivo aperto", value: "4 volte", icon: MessageSquare, tone: "orange" },
  { label: "DDT arrivato", value: "2 bancali", icon: PackageCheck, tone: "blue" },
  { label: "Cantiere in ritardo", value: "6 giorni", icon: Hammer, tone: "red" },
  { label: "Saldo cliente", value: "€18.400", icon: WalletCards, tone: "green" },
];

const actionCards = [
  { title: "Blocca margine", body: "Materiali + ore fuori stima", icon: AlertTriangle, badge: "Urgente" },
  { title: "Chiama cliente", body: "Offerta calda senza follow-up", icon: TrendingUp, badge: "+24h" },
  { title: "Prepara uscita", body: "Merce pronta per posa domani", icon: CalendarDays, badge: "OK" },
];

const bottomMetrics = [
  { label: "Margine protetto", value: "+18%", icon: Euro },
  { label: "Incassi 30g", value: "€84k", icon: WalletCards },
  { label: "Cantieri critici", value: "3", icon: Building2 },
];

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function HeroVisual() {
  const visualRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const motionPreference = gsap.matchMedia();

    motionPreference.add("(prefers-reduced-motion: reduce)", () => {
      if (visualRef.current) {
        gsap.set(visualRef.current, { opacity: 1, x: 0, y: 0, scale: 1, clearProps: "transform" });
      }
      gsap.set(
        ".hero-signal-card, .hero-action-card, .hero-ai-core, .hero-data-path, .hero-data-dot, .hero-command-line",
        { opacity: 1, x: 0, y: 0, scale: 1, clearProps: "transform" },
      );
    });

    motionPreference.add("(prefers-reduced-motion: no-preference)", () => {
      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: visualRef.current,
          start: "top 78%",
          once: true,
        },
        defaults: { ease: "power3.out" },
      });

      timeline
        .from(".hero-ai-core", { opacity: 0, scale: 0.82, y: 18, duration: 0.64 }, 0.18)
        .from(".hero-signal-card", { opacity: 0, x: -24, duration: 0.44, stagger: 0.07 }, 0.28)
        .from(".hero-action-card", { opacity: 0, x: 24, duration: 0.44, stagger: 0.07 }, 0.36)
        .from(".hero-command-line", { opacity: 0, y: 12, duration: 0.38, stagger: 0.04 }, 0.48)
        .from(".hero-data-path", { opacity: 0, strokeDashoffset: 820, duration: 1.1, stagger: 0.08 }, 0.42)
        .from(".hero-data-dot", { opacity: 0, scale: 0.2, transformOrigin: "center", duration: 0.34, stagger: 0.05 }, 0.64);

      gsap.to(".hero-ai-ring", {
        rotation: 360,
        transformOrigin: "center",
        duration: 18,
        repeat: -1,
        ease: "none",
      });

      gsap.to(".hero-ai-ring-reverse", {
        rotation: -360,
        transformOrigin: "center",
        duration: 24,
        repeat: -1,
        ease: "none",
      });

      gsap.to(".hero-data-path", {
        strokeDashoffset: "-=820",
        duration: 5.4,
        repeat: -1,
        ease: "none",
      });

      gsap.to(".hero-data-dot", {
        scale: 1.45,
        opacity: 0.34,
        transformOrigin: "center",
        duration: 1.5,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
        stagger: { each: 0.14, from: "center" },
      });

      gsap.to(".hero-ai-glow", {
        boxShadow: "0 0 70px rgba(249,115,22,0.38), inset 0 0 42px rgba(249,115,22,0.18)",
        duration: 1.8,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
    });

    return () => motionPreference.revert();
  }, { scope: visualRef });

  return (
    <motion.div
      ref={visualRef}
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.75, ease: "easeOut", delay: 0.16 }}
      className="hero-visual-shell relative mx-auto mt-8 w-full max-w-6xl overflow-hidden rounded-md border border-white/12 bg-white/[0.08] p-3 shadow-2xl shadow-black/30 backdrop-blur-xl md:mt-10 md:p-5"
      aria-label="Silvio AI collega segnali di cantiere, margini, incassi e priorità operative"
    >
      <div
        className="absolute inset-0 opacity-80"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 38%, rgba(249,115,22,.23), transparent 22%), radial-gradient(circle at 18% 76%, rgba(59,130,246,.18), transparent 26%), radial-gradient(circle at 88% 18%, rgba(16,185,129,.16), transparent 26%), linear-gradient(135deg, rgba(255,255,255,.08), rgba(255,255,255,0))",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.16) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.16) 1px, transparent 1px)",
          backgroundSize: "54px 54px",
        }}
      />

      <svg
        className="pointer-events-none absolute inset-0 z-[1] h-full w-full opacity-85"
        viewBox="0 0 1200 560"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="landing-ai-flow-gradient" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="rgba(249,115,22,0)" />
            <stop offset="46%" stopColor="rgba(249,115,22,0.9)" />
            <stop offset="100%" stopColor="rgba(56,189,248,0)" />
          </linearGradient>
          <filter id="landing-ai-flow-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path
          className="hero-data-path"
          d="M 68 122 C 246 116 302 230 512 224 C 690 220 792 112 1138 126"
          fill="none"
          stroke="url(#landing-ai-flow-gradient)"
          strokeWidth="2"
          strokeDasharray="18 22"
          strokeDashoffset="0"
          filter="url(#landing-ai-flow-glow)"
        />
        <path
          className="hero-data-path"
          d="M 58 438 C 254 404 310 332 524 340 C 724 348 808 438 1144 398"
          fill="none"
          stroke="url(#landing-ai-flow-gradient)"
          strokeWidth="2"
          strokeDasharray="14 20"
          strokeDashoffset="0"
          filter="url(#landing-ai-flow-glow)"
        />
        {[178, 440, 602, 790, 996].map((cx, index) => (
          <circle
            key={cx}
            className="hero-data-dot"
            cx={cx}
            cy={index % 2 === 0 ? 130 : 408}
            r="6"
            fill="#F97316"
            filter="url(#landing-ai-flow-glow)"
          />
        ))}
      </svg>

      <div className="relative z-[2] grid min-h-[420px] gap-4 rounded-md border border-white/10 bg-eic-navy-90/72 p-4 md:grid-cols-[0.86fr_1.22fr_0.92fr] md:p-6 lg:min-h-[460px]">
        <div className="flex flex-col justify-center gap-3">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-white/62">
            <Sparkles className="h-3.5 w-3.5 text-eic-orange" strokeWidth={1.5} />
            Segnali reali
          </div>
          {incomingSignals.map((item) => {
            const Icon = item.icon;
            const toneClass =
              item.tone === "red"
                ? "bg-red-500/12 text-red-200 ring-red-400/25"
                : item.tone === "green"
                  ? "bg-emerald-500/12 text-emerald-200 ring-emerald-300/25"
                  : item.tone === "blue"
                    ? "bg-sky-500/12 text-sky-200 ring-sky-300/25"
                    : "bg-eic-orange/14 text-orange-100 ring-eic-orange/25";

            return (
              <div
                key={item.label}
                className="hero-signal-card rounded-md border border-white/10 bg-white/[0.06] p-3 shadow-lg shadow-black/10"
              >
                <div className="flex items-center gap-3">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-md ring-1 ${toneClass}`}>
                    <Icon className="h-5 w-5" strokeWidth={1.5} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-white">{item.label}</p>
                    <p className="text-xs font-semibold text-white/52">{item.value}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="relative flex min-h-[360px] items-center justify-center py-4">
          <div className="hero-ai-core relative flex h-[310px] w-[310px] items-center justify-center sm:h-[360px] sm:w-[360px]">
            <div className="hero-ai-ring absolute inset-0 rounded-full border border-dashed border-eic-orange/45" />
            <div className="hero-ai-ring-reverse absolute inset-8 rounded-full border border-dashed border-sky-300/25" />
            <div className="absolute inset-16 rounded-full border border-white/10 bg-white/[0.04]" />

            <div className="hero-ai-glow relative z-[2] w-[240px] rounded-md border border-white/18 bg-white text-eic-ink shadow-2xl shadow-black/35 sm:w-[270px]">
              <div className="flex items-center justify-between border-b border-eic-navy/10 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-10 w-10 items-center justify-center rounded-md bg-eic-orange text-white shadow-lg shadow-eic-orange/25">
                    <Bot className="h-5 w-5" strokeWidth={1.5} />
                  </span>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-eic-navy/55">Silvio AI</p>
                    <p className="font-black text-eic-navy">Sala controllo</p>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">Live</span>
              </div>

              <div className="space-y-2 p-4">
                <div className="hero-command-line rounded-md bg-eic-navy px-3 py-3 text-white">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-eic-orange">Domanda del titolare</p>
                  <p className="mt-1 text-sm font-semibold">Dove rischio di perdere soldi questa settimana?</p>
                </div>
                <div className="hero-command-line rounded-md border border-eic-navy/10 bg-eic-cream px-3 py-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-eic-navy/52">Risposta operativa</p>
                  <p className="mt-1 text-sm text-eic-ink/72">
                    Controlla via Manzoni, incassa Rossi, prepara posa Neri.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {bottomMetrics.map((metric) => {
                    const Icon = metric.icon;
                    return (
                      <div key={metric.label} className="hero-command-line rounded-md border border-eic-navy/10 bg-white px-2 py-2">
                        <Icon className="h-4 w-4 text-eic-orange" strokeWidth={1.5} />
                        <p className="mt-1 text-sm font-black text-eic-navy">{metric.value}</p>
                        <p className="text-[10px] leading-tight text-eic-ink/50">{metric.label}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-center gap-3">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-100">
            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} />
            Azioni pronte
          </div>
          {actionCards.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="hero-action-card rounded-md border border-eic-orange/25 bg-eic-orange/10 p-3 shadow-lg shadow-eic-orange/5"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-eic-orange text-white shadow-lg shadow-eic-orange/20">
                    <Icon className="h-5 w-5" strokeWidth={1.5} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-black text-white">{item.title}</p>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black text-orange-100">
                        {item.badge}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-white/62">{item.body}</p>
                    <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-[0.12em] text-eic-orange">
                      Esegui
                      <ArrowRight className="h-3 w-3" strokeWidth={1.5} />
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  Hammer, HardHat, Ruler, Warehouse, Wrench, Building2, Blocks, ConeIcon,
  LayoutDashboard, ShoppingBag, Package, Calendar, Users, Settings,
  TrendingUp, Euro, AlertCircle, CheckCircle2, Star, Headphones,
  Shield, Zap, Lock,
} from "lucide-react";

const floatingIcons = [
  { Icon: HardHat, top: "10%", left: "5%", size: 48, delay: "0s", anim: "animate-float" },
  { Icon: Hammer, top: "20%", right: "8%", size: 40, delay: "1s", anim: "animate-float-slow" },
  { Icon: Ruler, top: "60%", left: "10%", size: 36, delay: "2s", anim: "animate-float" },
  { Icon: Warehouse, top: "70%", right: "12%", size: 44, delay: "0.5s", anim: "animate-float-slow" },
  { Icon: Wrench, top: "40%", left: "3%", size: 32, delay: "3s", anim: "animate-float" },
  { Icon: Building2, top: "15%", left: "80%", size: 52, delay: "1.5s", anim: "animate-float-slow" },
  { Icon: Blocks, top: "80%", left: "25%", size: 38, delay: "2.5s", anim: "animate-float" },
  { Icon: ConeIcon, top: "50%", right: "5%", size: 34, delay: "0.8s", anim: "animate-float-slow" },
] as const;

const sidebarItems = [
  { Icon: LayoutDashboard, label: "Dashboard", active: true },
  { Icon: ShoppingBag, label: "Ordini" },
  { Icon: Users, label: "Clienti" },
  { Icon: Package, label: "Magazzino" },
  { Icon: Calendar, label: "Calendario" },
  { Icon: Settings, label: "Impostazioni" },
];

const statsData = [
  { label: "Fatturato", value: "€ 284.500", icon: Euro, color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
  { label: "Margine", value: "€ 78.200", icon: TrendingUp, color: "#F97415", bg: "rgba(249,116,21,0.15)" },
  { label: "Incassato", value: "€ 196.000", icon: CheckCircle2, color: "#22c55e", bg: "rgba(34,197,94,0.15)" },
  { label: "Da Incassare", value: "€ 88.500", icon: AlertCircle, color: "#f59e0b", bg: "rgba(245,158,11,0.15)" },
];

const ordersData = [
  { code: "ORD-0147", client: "Rossi Mario", amount: "€ 42.800", status: "In Lavorazione", statusColor: "#3b82f6" },
  { code: "ORD-0146", client: "Bianchi & Figli", amount: "€ 28.350", status: "Completato", statusColor: "#22c55e" },
  { code: "ORD-0145", client: "Condominio Via Roma", amount: "€ 65.000", status: "In Attesa", statusColor: "#f59e0b" },
  { code: "ORD-0144", client: "Verdi Costruzioni", amount: "€ 18.900", status: "Sopralluogo", statusColor: "#8b5cf6" },
];

const chartBars = [
  { month: "Set", h: 45 },
  { month: "Ott", h: 62 },
  { month: "Nov", h: 38 },
  { month: "Dic", h: 70 },
  { month: "Gen", h: 55 },
  { month: "Feb", h: 80 },
];

const typingWords = ["i tuoi margini", "la tua cassa", "i tuoi cantieri", "il tuo marketing"];

const microBadges = [
  { Icon: Shield, label: "GDPR Compliant" },
  { Icon: Zap, label: "Setup in 48h" },
  { Icon: Star, label: "4.9/5 stelle" },
  { Icon: Lock, label: "Dati in Europa" },
];

gsap.registerPlugin(useGSAP, ScrollTrigger);

function DashboardMockup() {
  return (
    <div
      className="gsap-dashboard relative mt-10 mb-8 max-w-4xl mx-auto"
    >
      {/* Glow effect behind mockup */}
      <div className="absolute -inset-8 bg-[#F97415]/15 rounded-full blur-[80px] animate-pulse-glow pointer-events-none" />
      <div
        className="relative rounded-2xl border border-white/15 shadow-2xl shadow-black/40 overflow-hidden"
        style={{ transform: "perspective(1200px) rotateX(4deg)" }}
      >
        <div className="flex bg-[#111111]">
          {/* Sidebar */}
          <div className="w-14 md:w-16 bg-[#0a1222] border-r border-white/5 flex flex-col items-center py-3 gap-1 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-[#F97415] flex items-center justify-center mb-3">
              <Building2 size={14} className="text-white" />
            </div>
            {sidebarItems.map((item, i) => (
              <div
                key={i}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                  item.active ? "bg-[#F97415]/20 text-[#F97415]" : "text-white/60 hover:text-white/80"
                }`}
              >
                <item.Icon size={16} />
              </div>
            ))}
          </div>

          {/* Main content */}
          <div className="flex-1 p-3 md:p-4 min-w-0">
            {/* Header bar */}
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-white/70 text-[9px] md:text-[10px]">Benvenuto</p>
                <p className="text-white text-xs md:text-sm font-semibold">Dashboard</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-[#F97415]/20 flex items-center justify-center">
                  <span className="text-[#F97415] text-[8px] font-bold">F</span>
                </div>
              </div>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              {statsData.map((stat, i) => (
                <div key={i} className="gsap-card bg-white/[0.04] rounded-lg p-2 md:p-2.5 border border-white/5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: stat.bg }}>
                      <stat.icon size={10} style={{ color: stat.color }} />
                    </div>
                    <span className="text-white/70 text-[8px] md:text-[9px]">{stat.label}</span>
                  </div>
                  <p className="text-white text-xs md:text-sm font-bold">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Chart + Table row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 min-w-0">
              {/* Bar chart */}
              <div className="bg-white/[0.04] rounded-lg p-2.5 border border-white/5">
                <p className="text-white/70 text-[9px] mb-2 font-medium">Fatturato Mensile</p>
                <div className="flex items-end gap-1.5 h-16">
                  {chartBars.map((bar, i) => (
                    <div key={i} className="gsap-card flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-full rounded-sm"
                        style={{
                          height: `${bar.h}%`,
                          background: `linear-gradient(to top, #F97415, #F9741599)`,
                        }}
                      />
                      <span className="text-white/65 text-[7px]">{bar.month}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Orders table */}
              <div className="hidden md:block bg-white/[0.04] rounded-lg p-2.5 border border-white/5">
                <p className="text-white/70 text-[9px] mb-2 font-medium">Ultimi Ordini</p>
                <div className="space-y-1.5">
                  {ordersData.map((order, i) => (
                    <div key={i} className="gsap-card flex items-center justify-between text-[8px] md:text-[9px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[#F97415] font-mono font-medium shrink-0">{order.code}</span>
                        <span className="text-white/70 truncate">{order.client}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-white/70 font-medium">{order.amount}</span>
                        <span
                          className="px-1.5 py-0.5 rounded-full text-[7px] font-medium"
                          style={{ backgroundColor: `${order.statusColor}20`, color: order.statusColor }}
                        >
                          {order.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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

  useGSAP(() => {
    const motion = gsap.matchMedia();

    motion.add("(prefers-reduced-motion: reduce)", () => {
      gsap.set(".gsap-hero-item, .gsap-dashboard, .gsap-card", { opacity: 1, y: 0, scale: 1, clearProps: "transform" });
    });

    motion.add("(prefers-reduced-motion: no-preference)", () => {
      const timeline = gsap.timeline({ defaults: { ease: "power3.out" } });

      timeline
        .from(".gsap-hero-item", {
          opacity: 0,
          y: 28,
          duration: 0.72,
          stagger: 0.09,
          clearProps: "opacity,transform",
        })
        .from(".gsap-dashboard", {
          opacity: 0,
          y: 42,
          scale: 0.97,
          duration: 0.9,
          clearProps: "opacity,transform",
        }, 0.18)
        .from(".gsap-card", {
          opacity: 0,
          y: 14,
          duration: 0.42,
          stagger: 0.035,
          clearProps: "opacity,transform",
        }, 0.55);

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

    return () => motion.revert();
  }, { scope: sectionRef });

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden pt-20 md:pt-36 pb-14 md:pb-20"
    >
      {/* Real photo background with parallax — <img> tag for LCP eligibility */}
      <img
        ref={backgroundRef}
        src="https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1920&q=80"
        alt="Cantiere edile italiano gestito con Edilizia in Cloud"
        fetchpriority="high"
        loading="eager"
        decoding="sync"
        width={1920}
        height={1080}
        className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none select-none"
        style={{ willChange: "transform" }}
      />

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
          <h1 className="text-2xl sm:text-3xl md:text-6xl lg:text-7xl font-extrabold leading-tight mb-3 md:mb-4">
            <span className="text-white block">Finisci di lavorare a sensazione.</span>
            <span className="text-[#F97415] block">Inizia a guadagnare davvero.</span>
          </h1>

          {/* Titolo con parola che cambia */}
          <div className="text-xl sm:text-2xl md:text-4xl lg:text-5xl font-bold text-white/90 mb-3">
            Controlla{" "}
            <span
              className="text-[#F97415] inline-block min-w-[126px] sm:min-w-[160px] md:min-w-[300px] transition-all duration-350"
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
            L'unico gestionale costruito da zero per l'edilizia italiana.
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
            href="#moduli"
            onClick={(e) => { e.preventDefault(); document.querySelector("#moduli")?.scrollIntoView({ behavior: "smooth" }); }}
            className="w-full sm:w-auto px-6 md:px-8 py-3 md:py-4 rounded-full border border-white/20 text-white font-semibold hover:bg-white/5 hover:border-white/40 transition-all duration-200"
          >
            Vedi tutti i moduli
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

        {/* 3. Dashboard Mockup */}
        <DashboardMockup />

        {/* 4. Subtitle */}
        <p
          className="gsap-hero-item text-sm md:text-xl text-white/60 max-w-xs sm:max-w-sm md:max-w-2xl mx-auto mb-8 md:mb-10"
        >
          Cantieri, margini, cassa, HR, marketing e fatturazione elettronica — tutto in un'unica piattaforma. Nessun foglio Excel. Nessun commercialista che ti dà i dati a fine anno. Decidi in tempo reale, affiancato da un <span className="text-white font-semibold">Consulente dedicato</span> che ti aiuta a proteggere i margini e far crescere l'impresa.
        </p>

        {/* Social Proof */}
        <div className="gsap-hero-item flex flex-col sm:flex-row items-center justify-center gap-3 md:gap-6 mt-6 md:mt-8">
          <div className="flex items-center gap-2 text-white/70 text-xs md:text-sm">
            <Users size={16} className="text-[#F97415]" />
            <span>150+ Imprese Attive</span>
          </div>
          <div className="hidden sm:block w-px h-4 bg-white/20" />
          <div className="flex items-center gap-1.5 text-white/70 text-xs md:text-sm">
            {[...Array(5)].map((_, i) => (
              <Star key={i} size={14} className="text-[#F97415] fill-[#F97415]" />
            ))}
            <span className="ml-1">4.9/5 Soddisfazione</span>
          </div>
          <div className="hidden sm:block w-px h-4 bg-white/20" />
          <div className="flex items-center gap-2 text-white/70 text-xs md:text-sm">
            <Headphones size={16} className="text-[#F97415]" />
            <span>Supporto Italiano</span>
          </div>
        </div>

        {/* Partner Logos Marquee */}
        <div className="gsap-hero-item mt-6 md:mt-10">
          <p className="text-white/70 text-xs mb-4">Usato da imprenditori che lavorano con</p>
          <div
            className="overflow-hidden"
            style={{
              maskImage: "linear-gradient(90deg, transparent 0%, black 15%, black 85%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(90deg, transparent 0%, black 15%, black 85%, transparent 100%)",
            }}
          >
            <div className="flex animate-marquee whitespace-nowrap">
              {[...Array(2)].map((_, copy) => (
                <div key={copy} className="flex items-center shrink-0">
                  {["ANCE", "Confindustria Edilizia", "Cassa Edile", "Edilportale", "SAP Certified", "Collegio Geometri", "ANIEM", "FederCAM"].map((name) => (
                    <span key={`${copy}-${name}`} className="mx-4 md:mx-6 text-white/65 text-xs md:text-sm font-bold uppercase tracking-widest shrink-0">
                      {name}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-white to-transparent" />
    </section>
  );
}

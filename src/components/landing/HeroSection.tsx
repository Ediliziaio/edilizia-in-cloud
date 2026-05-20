import { useEffect, useRef, useState } from "react";
// GSAP + ScrollTrigger ora lazy: PageSpeed desktop flaggava 90KB di
// JS + 2.7s di Script Evaluation per animazioni decorative non critiche
// al LCP (testo "Aumenta margini..."). L'effetto è eseguito dopo il primo
// paint senza bloccare il TBT iniziale.
import {
  Hammer, HardHat, Ruler, Warehouse, Wrench, Building2, Blocks, ConeIcon,
  LayoutDashboard, ShoppingBag, Package, Calendar, Users, Settings,
  TrendingUp, Euro, AlertCircle, CheckCircle2, Star,
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

const statsData = [
  { label: "Margine protetto", value: "+€ 18.400", icon: TrendingUp, color: "#F97415", bg: "rgba(249,116,21,0.15)" },
  { label: "Incassi da seguire", value: "€ 88.500", icon: AlertCircle, color: "#f59e0b", bg: "rgba(245,158,11,0.15)" },
  { label: "Fatture pronte", value: "7 bozze", icon: Euro, color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
  { label: "Azioni oggi", value: "12 task", icon: CheckCircle2, color: "#22c55e", bg: "rgba(34,197,94,0.15)" },
];

const aiActionsData = [
  { action: "Sollecita incasso", target: "Rossi Mario", detail: "€ 18.900 scaduti", status: "Oggi", statusColor: "#f59e0b" },
  { action: "Genera rapportino", target: "Cantiere Via Roma", detail: "foto + nota vocale", status: "Pronto", statusColor: "#22c55e" },
  { action: "Prepara fattura", target: "SAL bagno Milano", detail: "bozza da € 12.400", status: "Bozza", statusColor: "#3b82f6" },
  { action: "Avvisa squadra", target: "Posa serramenti", detail: "materiale mancante", status: "Urgente", statusColor: "#ef4444" },
];

const chartBars = [
  { month: "Set", h: 38, value: "52k" },
  { month: "Ott", h: 58, value: "71k" },
  { month: "Nov", h: 45, value: "64k" },
  { month: "Dic", h: 72, value: "91k" },
  { month: "Gen", h: 64, value: "83k" },
  { month: "Feb", h: 86, value: "112k" },
];

const typingWords = ["i tuoi margini", "la tua cassa", "i tuoi cantieri", "il tuo marketing"];

const microBadges = [
  { Icon: Shield, label: "GDPR Compliant" },
  { Icon: Zap, label: "Setup in 48h" },
  { Icon: Star, label: "4.9/5 stelle" },
  { Icon: Lock, label: "Dati in Europa" },
];

const dashboardAreas = [
  {
    id: "regia",
    label: "Regia Silvio",
    Icon: Building2,
    eyebrow: "Centro di comando",
    title: "Silvio ha trovato 3 priorità",
    summaryTitle: "Silvio consiglia: proteggi il margine prima di accettare nuovi lavori.",
    summaryText: "2 commesse sotto target, 1 incasso scaduto, 4 rapportini da chiudere.",
    nextMove: "Invia solleciti e prepara fatture",
    chartTitle: "Margine previsto",
    chartBadge: "+18%",
    stats: statsData,
    actions: aiActionsData,
  },
  {
    id: "margini",
    label: "Margini",
    Icon: LayoutDashboard,
    eyebrow: "Controllo gestione",
    title: "Silvio controlla utili e costi nascosti",
    summaryTitle: "Commessa Via Roma: margine sceso al 14%, sotto la soglia minima.",
    summaryText: "Ore extra, materiale non previsto e sconto commerciale stanno consumando utile.",
    nextMove: "Apri analisi margine e blocca extra costo",
    chartTitle: "Margine commesse",
    chartBadge: "-6%",
    stats: [
      { label: "Sotto target", value: "2 lavori", icon: AlertCircle, color: "#ef4444", bg: "rgba(239,68,68,0.15)" },
      { label: "Costi extra", value: "€ 9.800", icon: Euro, color: "#f59e0b", bg: "rgba(245,158,11,0.15)" },
      { label: "Utile stimato", value: "€ 42.600", icon: TrendingUp, color: "#22c55e", bg: "rgba(34,197,94,0.15)" },
      { label: "Azioni margine", value: "5 task", icon: CheckCircle2, color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
    ],
    actions: [
      { action: "Blocca extra costo", target: "Via Roma", detail: "posa oltre budget", status: "Urge", statusColor: "#ef4444" },
      { action: "Ricalcola margine", target: "Bagno Milano", detail: "SAL aggiornato", status: "Oggi", statusColor: "#f59e0b" },
      { action: "Avvisa titolare", target: "Scala condominio", detail: "utile sotto soglia", status: "Pronto", statusColor: "#22c55e" },
      { action: "Controlla listino", target: "Fornitore Nord", detail: "aumento materiali", status: "Check", statusColor: "#3b82f6" },
    ],
  },
  {
    id: "vendite",
    label: "Vendite",
    Icon: ShoppingBag,
    eyebrow: "Pipeline commerciale",
    title: "Silvio spinge i preventivi caldi",
    summaryTitle: "3 offerte possono chiudere questa settimana se richiami nel momento giusto.",
    summaryText: "Silvio prepara follow-up WhatsApp, promemoria e proposta con valore chiaro.",
    nextMove: "Richiama clienti caldi e invia follow-up",
    chartTitle: "Preventivi caldi",
    chartBadge: "+12%",
    stats: [
      { label: "Preventivi caldi", value: "9", icon: ShoppingBag, color: "#F97415", bg: "rgba(249,116,21,0.15)" },
      { label: "Da richiamare", value: "6 clienti", icon: Users, color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
      { label: "Valore pipeline", value: "€ 184k", icon: Euro, color: "#22c55e", bg: "rgba(34,197,94,0.15)" },
      { label: "Follow-up pronti", value: "11", icon: CheckCircle2, color: "#f59e0b", bg: "rgba(245,158,11,0.15)" },
    ],
    actions: [
      { action: "Invia WhatsApp", target: "Laura Gialli", detail: "preventivo fermo da 5g", status: "Oggi", statusColor: "#f59e0b" },
      { action: "Prepara proposta", target: "Mario Bianchi", detail: "valore e garanzia", status: "Pronta", statusColor: "#22c55e" },
      { action: "Aggiorna forecast", target: "Pipeline maggio", detail: "probabilità chiusura", status: "Live", statusColor: "#3b82f6" },
      { action: "Render di supporto", target: "Infissi villa", detail: "prima/dopo", status: "AI", statusColor: "#8b5cf6" },
    ],
  },
  {
    id: "magazzino",
    label: "Magazzino",
    Icon: Package,
    eyebrow: "Materiali e DDT",
    title: "Silvio vede cosa manca prima della posa",
    summaryTitle: "Posa di venerdì: tapparelle non ancora arrivate e DDT da collegare.",
    summaryText: "Controlla ordini, lotti, DDT, uscite cantiere e avvisa ufficio o squadra.",
    nextMove: "Registra arrivo merce e prepara uscita",
    chartTitle: "Materiali pronti",
    chartBadge: "74%",
    stats: [
      { label: "In arrivo", value: "26 art.", icon: Package, color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
      { label: "Mancanti", value: "4 art.", icon: AlertCircle, color: "#ef4444", bg: "rgba(239,68,68,0.15)" },
      { label: "DDT da collegare", value: "3", icon: CheckCircle2, color: "#f59e0b", bg: "rgba(245,158,11,0.15)" },
      { label: "Uscite pronte", value: "2", icon: Warehouse, color: "#22c55e", bg: "rgba(34,197,94,0.15)" },
    ],
    actions: [
      { action: "Collega DDT", target: "Aluplast", detail: "3 bancali ricevuti", status: "Ora", statusColor: "#f59e0b" },
      { action: "Ordina materiale", target: "Tapparelle", detail: "posa venerdì", status: "Urge", statusColor: "#ef4444" },
      { action: "Genera DDT uscita", target: "Cantiere Neri", detail: "merce caricata", status: "Pronto", statusColor: "#22c55e" },
      { action: "Foto merce", target: "Bancale infissi", detail: "prova carico", status: "OK", statusColor: "#3b82f6" },
    ],
  },
  {
    id: "campo",
    label: "Campo",
    Icon: Calendar,
    eyebrow: "Campo e rapportini",
    title: "Silvio trasforma foto e note in lavoro chiaro",
    summaryTitle: "La squadra ha caricato 3 foto e una nota vocale: rapportino pronto.",
    summaryText: "Aggiorna diario lavori, ricorda attività aperte e manda promemoria ai collaboratori.",
    nextMove: "Genera rapportino e avvisa ufficio",
    chartTitle: "Attività completate",
    chartBadge: "82%",
    stats: [
      { label: "Foto lette", value: "18", icon: CheckCircle2, color: "#22c55e", bg: "rgba(34,197,94,0.15)" },
      { label: "Rapportini", value: "5", icon: LayoutDashboard, color: "#F97415", bg: "rgba(249,116,21,0.15)" },
      { label: "Squadre", value: "3", icon: Users, color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
      { label: "Ritardi", value: "1", icon: AlertCircle, color: "#f59e0b", bg: "rgba(245,158,11,0.15)" },
    ],
    actions: [
      { action: "Crea rapportino", target: "Via Manzoni", detail: "foto + vocale", status: "Pronto", statusColor: "#22c55e" },
      { action: "Ricorda squadra", target: "Marco operaio", detail: "chiudere attività", status: "Oggi", statusColor: "#f59e0b" },
      { action: "Aggiorna diario", target: "Cantiere piscina", detail: "avanzamento 68%", status: "Live", statusColor: "#3b82f6" },
      { action: "Avvisa cliente", target: "Ferretti", detail: "riepilogo lavori", status: "Bozza", statusColor: "#8b5cf6" },
    ],
  },
  {
    id: "ai",
    label: "AI e automazioni",
    Icon: Settings,
    eyebrow: "Silvio per tutti i reparti",
    title: "Una regia AI per vendite, cassa, campo e ufficio",
    summaryTitle: "Silvio coordina persone, documenti, clienti, fatture, solleciti e promemoria.",
    summaryText: "Non una chat isolata: ogni risposta nasce da dati reali della tua azienda.",
    nextMove: "Attiva automazioni su reparti critici",
    chartTitle: "Automazioni attive",
    chartBadge: "19 AI",
    stats: [
      { label: "Persone AI", value: "19", icon: Zap, color: "#F97415", bg: "rgba(249,116,21,0.15)" },
      { label: "Reparti coperti", value: "7", icon: LayoutDashboard, color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
      { label: "Azioni create", value: "42", icon: CheckCircle2, color: "#22c55e", bg: "rgba(34,197,94,0.15)" },
      { label: "Alert critici", value: "3", icon: AlertCircle, color: "#ef4444", bg: "rgba(239,68,68,0.15)" },
    ],
    actions: [
      { action: "CFO AI", target: "Cassa", detail: "incassi e pagamenti", status: "Live", statusColor: "#22c55e" },
      { action: "PM Cantiere AI", target: "Lavori", detail: "ritardi e squadre", status: "Live", statusColor: "#3b82f6" },
      { action: "Sales AI", target: "Preventivi", detail: "follow-up e offerte", status: "Live", statusColor: "#F97415" },
      { action: "Admin AI", target: "Fatture/DDT", detail: "bozze e controlli", status: "Live", statusColor: "#8b5cf6" },
    ],
  },
];

function DashboardMockup() {
  const [activeArea, setActiveArea] = useState(dashboardAreas[0]);

  return (
    <div
      className="gsap-dashboard relative mx-auto mb-8 mt-10 max-w-5xl"
    >
      {/* Glow effect behind mockup */}
      <div className="absolute -inset-8 bg-[#F97415]/15 rounded-full blur-[80px] animate-pulse-glow pointer-events-none" />
      <div
        className="relative overflow-hidden rounded-2xl border border-white/15 shadow-2xl shadow-black/40"
        style={{ transform: "perspective(1200px) rotateX(4deg)" }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(249,116,21,.22),transparent_26%),radial-gradient(circle_at_86%_72%,rgba(34,197,94,.14),transparent_26%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#F97415] to-transparent" />
        <div className="relative flex bg-[#0b0f17]/95">
          {/* Sidebar */}
          <div className="w-14 md:w-16 bg-[#0a1222] border-r border-white/5 flex flex-col items-center py-3 gap-1 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-[#F97415] flex items-center justify-center mb-3">
              <Building2 size={14} className="text-white" />
            </div>
            {dashboardAreas.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Apri schermata ${item.label}`}
                title={item.label}
                onClick={() => setActiveArea(item)}
                className={`group relative flex h-9 w-9 items-center justify-center rounded-lg transition ${
                  activeArea.id === item.id ? "bg-[#F97415]/25 text-[#F97415]" : "text-white/60 hover:bg-white/5 hover:text-white/90"
                }`}
              >
                <item.Icon size={16} />
                {activeArea.id === item.id && <span className="absolute -right-0.5 h-1.5 w-1.5 rounded-full bg-[#F97415] shadow-[0_0_10px_rgba(249,116,21,.9)]" />}
              </button>
            ))}
          </div>

          {/* Main content */}
          <div className="flex-1 p-3 md:p-4 min-w-0">
            {/* Header bar */}
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#F97415] md:text-[10px]">{activeArea.eyebrow}</p>
                <p className="text-sm font-black text-white md:text-base">{activeArea.title}</p>
              </div>
              <div className="hidden items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-200 sm:flex">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.85)]" />
                Live azienda
              </div>
            </div>

            {/* Silvio summary */}
            <div className="mb-3 grid gap-2 md:grid-cols-[1.15fr_0.85fr]">
              <div className="gsap-card rounded-xl border border-[#F97415]/25 bg-[#F97415]/10 p-3 text-left">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F97415] text-white shadow-lg shadow-orange-900/30">
                    <Zap size={17} />
                  </div>
                  <div>
                    <p className="text-xs font-black text-white md:text-sm">{activeArea.summaryTitle}</p>
                    <p className="mt-1 text-[10px] leading-4 text-white/70 md:text-[11px]">
                      {activeArea.summaryText}
                    </p>
                  </div>
                </div>
              </div>
              <div className="hidden rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left md:block">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/45">Prossima mossa</p>
                <p className="mt-1 text-sm font-black text-white">{activeArea.nextMove}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-[#F97415] to-emerald-400" />
                </div>
              </div>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              {activeArea.stats.map((stat, i) => (
                <div key={i} className="gsap-card rounded-lg border border-white/5 bg-white/[0.04] p-2 transition hover:border-[#F97415]/30 hover:bg-white/[0.07] md:p-2.5">
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
              <div className="rounded-lg border border-white/5 bg-white/[0.04] p-2.5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[9px] font-medium text-white/70">{activeArea.chartTitle}</p>
                  <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[7px] font-black text-emerald-300">{activeArea.chartBadge}</span>
                </div>
                <div className="flex items-end gap-1.5 h-16">
                  {chartBars.map((bar, i) => (
                    <div key={i} className="gsap-card flex-1 flex flex-col items-center gap-1">
                      <span className="text-[7px] font-bold text-white/45">{bar.value}</span>
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

              {/* AI actions table */}
              <div className="rounded-lg border border-white/5 bg-white/[0.04] p-2.5">
                <p className="mb-2 text-[9px] font-medium text-white/70">Azioni consigliate</p>
                <div className="space-y-1.5">
                  {activeArea.actions.map((item, i) => (
                    <div key={i} className="gsap-card flex items-center justify-between gap-2 rounded-md bg-black/10 px-1.5 py-1 text-[8px] md:text-[9px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#F97415]" />
                        <div className="min-w-0">
                          <p className="truncate font-bold text-white/80">{item.action}</p>
                          <p className="truncate text-white/45">{item.target} · {item.detail}</p>
                        </div>
                      </div>
                      <span
                        className="shrink-0 rounded-full px-1.5 py-0.5 text-[7px] font-black"
                        style={{ backgroundColor: `${item.statusColor}20`, color: item.statusColor }}
                      >
                        {item.status}
                      </span>
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
          Mobile (≤640px) carica 640w WebP ~30KB invece di 1920w JPEG ~387KB. */}
      <img
        ref={backgroundRef}
        // v8.6.101 — quality drasticamente ridotta perche l'immagine e' coperta
        // dal gradient overlay del 88-92% (vedi sotto). Risparmio LCP ~60 KiB su
        // mobile (q60->q40) senza differenza visiva percepibile sotto overlay.
        src="https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1024&q=40"
        srcSet="
          https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=480&q=30 480w,
          https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=768&q=35 768w,
          https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1024&q=40 1024w,
          https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1440&q=45 1440w,
          https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1920&q=50 1920w
        "
        sizes="100vw"
        alt="Cantiere edile italiano gestito con Edilizia in Cloud"
        fetchpriority="high"
        loading="eager"
        decoding="async"
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

      </div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent md:h-24" />
    </section>
  );
}

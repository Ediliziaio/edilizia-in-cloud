import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Image as ImageIcon,
  MousePointerClick,
  Play,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Wand2,
  Zap,
} from "lucide-react";
import LandingFooter from "@/components/landing/LandingFooter";
import LandingNavbar from "@/components/landing/LandingNavbar";
import { RenderLeadModal } from "@/components/render/RenderLeadModal";
import { JsonLd } from "@/components/seo/JsonLd";
import { SITE_URL, useSEO } from "@/hooks/useSEO";
import type { RenderPageConfig } from "./types";

const TRUST_BADGES = [
  { icon: ShieldCheck, label: "GDPR Compliant" },
  { icon: Zap, label: "Setup in 60 sec" },
  { icon: Star, label: "4.9/5 stelle" },
  { icon: BadgeCheck, label: "Made in Italy" },
];

/* ================================================================== */
/* COUNT UP                                                            */
/* ================================================================== */
function CountUp({
  value,
  suffix = "",
  prefix = "",
  duration = 1400,
}: {
  value: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
}) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const tick = (now: number) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            setDisplay(Math.round(eased * value));
            if (t < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [value, duration]);

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}
      {display}
      {suffix}
    </span>
  );
}

/* ================================================================== */
/* SCENE SVG — abstract "before / after" scene, themed by accent color */
/* ================================================================== */
function SceneSvg({
  variant,
  vertical,
}: {
  variant: "before" | "after";
  vertical: string;
}) {
  const isAfter = variant === "after";
  const skyTop = isAfter ? "#fef3e6" : "#cdd6df";
  const skyBottom = isAfter ? "#fcd9b4" : "#9aa6b2";
  const ground = isAfter ? "#ead0a8" : "#7d8893";
  const wall = isAfter ? "#e9d4a4" : "#6b7682";
  const accent = isAfter ? "#F97415" : "#5a6470";
  const detail = isAfter ? "#bfe1ff" : "#a6b1bd";
  const stroke = isAfter ? "#0f172a" : "#3f4854";

  return (
    <svg
      viewBox="0 0 600 380"
      className="block h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={`${variant === "after" ? "Dopo" : "Prima"} · ${vertical}`}
    >
      <defs>
        <linearGradient id={`sky-${variant}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={skyTop} />
          <stop offset="100%" stopColor={skyBottom} />
        </linearGradient>
      </defs>
      <rect width="600" height="380" fill={`url(#sky-${variant})`} />
      {isAfter && <circle cx="500" cy="60" r="28" fill="#fbbf24" opacity="0.7" />}
      <rect x="0" y="240" width="600" height="140" fill={ground} />
      {/* Building shell — neutral, works for any vertical */}
      <polygon points="60,240 300,90 540,240" fill={wall} stroke={stroke} strokeWidth="2" />
      <rect x="60" y="240" width="480" height="140" fill={wall} stroke={stroke} strokeWidth="2" />
      {/* Big "feature" rectangle (could be door/window/pool/floor depending on vertical) */}
      <rect x="220" y="260" width="160" height="100" fill={accent} stroke={stroke} strokeWidth="2" />
      <rect x="230" y="270" width="140" height="80" fill={detail} />
      <line x1="300" y1="270" x2="300" y2="350" stroke={stroke} strokeWidth="2" />
      <line x1="230" y1="310" x2="370" y2="310" stroke={stroke} strokeWidth="2" />
      {/* Side details (windows/decor) */}
      <rect x="100" y="280" width="80" height="60" fill={detail} stroke={stroke} strokeWidth="2" />
      <rect x="420" y="280" width="80" height="60" fill={detail} stroke={stroke} strokeWidth="2" />
      {/* Top window */}
      <rect x="270" y="160" width="60" height="50" fill={detail} stroke={stroke} strokeWidth="2" />
      {/* Accent strips for "after" */}
      {isAfter && (
        <>
          <rect x="60" y="358" width="480" height="6" fill="#F97415" opacity="0.85" />
          <circle cx="100" cy="370" r="3" fill="#F97415" />
          <circle cx="500" cy="370" r="3" fill="#F97415" />
        </>
      )}
    </svg>
  );
}

/* ================================================================== */
/* BEFORE / AFTER SLIDER                                              */
/* ================================================================== */
function BeforeAfterSlider({ vertical }: { vertical: string }) {
  const [pos, setPos] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const handleMove = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(2, Math.min(98, x)));
  };

  return (
    <div
      ref={containerRef}
      className="group relative aspect-[16/10] w-full select-none overflow-hidden rounded-2xl border border-white/15 bg-slate-900 shadow-2xl"
      onMouseDown={(e) => {
        dragging.current = true;
        handleMove(e.clientX);
      }}
      onMouseMove={(e) => {
        if (dragging.current) handleMove(e.clientX);
      }}
      onMouseUp={() => {
        dragging.current = false;
      }}
      onMouseLeave={() => {
        dragging.current = false;
      }}
      onTouchStart={(e) => {
        dragging.current = true;
        handleMove(e.touches[0].clientX);
      }}
      onTouchMove={(e) => handleMove(e.touches[0].clientX)}
      onTouchEnd={() => {
        dragging.current = false;
      }}
    >
      <div className="absolute inset-0">
        <SceneSvg variant="after" vertical={vertical} />
      </div>
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      >
        <SceneSvg variant="before" vertical={vertical} />
      </div>
      <div className="absolute left-4 top-4 rounded-md bg-slate-900/80 px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-white backdrop-blur">
        Prima
      </div>
      <div className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-md bg-[#F97415] px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-white shadow-md">
        <Sparkles className="h-3 w-3" />
        Dopo · AI
      </div>
      <div
        className="absolute inset-y-0 w-1 bg-white shadow-[0_0_20px_rgba(255,255,255,0.6)]"
        style={{ left: `calc(${pos}% - 2px)` }}
      />
      <button
        type="button"
        aria-label="Trascina per confrontare prima e dopo"
        className="absolute top-1/2 z-10 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full bg-white text-[#0f172a] shadow-lg ring-4 ring-white/40 transition active:cursor-grabbing group-hover:scale-105"
        style={{ left: `${pos}%` }}
        onMouseDown={(e) => {
          dragging.current = true;
          handleMove(e.clientX);
          e.stopPropagation();
        }}
      >
        <MousePointerClick className="h-5 w-5" />
      </button>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-slate-900/75 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white backdrop-blur">
        Trascina per confrontare
      </div>
    </div>
  );
}

/* ================================================================== */
/* VIDEO DEMO                                                          */
/* ================================================================== */
function VideoDemo({
  src,
  poster,
  vertical,
}: {
  src: string;
  poster: string;
  vertical: string;
}) {
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handlePlay = () => {
    setPlaying(true);
    setTimeout(() => {
      videoRef.current?.play().catch(() => {
        /* ignore autoplay block */
      });
    }, 50);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 shadow-2xl">
      <div className="relative aspect-video w-full">
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          controls={playing}
          preload="metadata"
          playsInline
          aria-label={`Video demo ${vertical}: come trasformi una foto in una vendita`}
          title={`Demo ${vertical} · 60 secondi`}
          className="absolute inset-0 h-full w-full object-cover"
        />

        {!playing && (
          <button
            type="button"
            onClick={handlePlay}
            aria-label={`Riproduci video demo ${vertical}`}
            className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-900/40 via-slate-900/20 to-[#0f172a]/60 transition hover:from-slate-900/30"
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(249,116,21,0.25),transparent_55%)]" />
            <span className="pointer-events-none absolute left-5 top-5 inline-flex items-center gap-2 rounded-md bg-slate-900/80 px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-white backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-orange-300" />
              Demo · 60 sec
            </span>
            <span className="pointer-events-none absolute bottom-5 left-5 right-5 text-left text-white">
              <span className="block text-base font-extrabold sm:text-lg">
                Guarda come trasformi una foto in un argomento di vendita
              </span>
              <span className="mt-1 block text-xs font-medium text-white/70 sm:text-sm">
                Carichi la foto · Imposti finiture · Generi prima/dopo · Invii al cliente
              </span>
            </span>
            <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-[#F97415] text-white shadow-2xl ring-4 ring-white/20 transition-transform group-hover:scale-110 sm:h-24 sm:w-24">
              <span className="absolute inset-0 animate-ping rounded-full bg-[#F97415] opacity-40" />
              <Play className="relative h-9 w-9 fill-white sm:h-10 sm:w-10" />
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

/* ================================================================== */
/* ROI CALCULATOR                                                      */
/* ================================================================== */
function RoiCalculator({
  preventiviLabel,
  ticketLabel,
  ticketDefault,
  ticketMin,
  ticketMax,
  ticketStep,
  onRequestInfo,
}: {
  preventiviLabel: string;
  ticketLabel: string;
  ticketDefault: number;
  ticketMin: number;
  ticketMax: number;
  ticketStep: number;
  onRequestInfo: () => void;
}) {
  const [preventiviMese, setPreventiviMese] = useState(20);
  const [ticketMedio, setTicketMedio] = useState(ticketDefault);
  const [closeRateAttuale, setCloseRateAttuale] = useState(25);

  const result = useMemo(() => {
    const upliftPct = 12;
    const newCloseRate = Math.min(closeRateAttuale + upliftPct, 100);
    const ordiniAttuali = (preventiviMese * closeRateAttuale) / 100;
    const ordiniNuovi = (preventiviMese * newCloseRate) / 100;
    const fatturatoAggiuntivoMese = (ordiniNuovi - ordiniAttuali) * ticketMedio;
    const fatturatoAggiuntivoAnno = fatturatoAggiuntivoMese * 12;
    return {
      newCloseRate,
      ordiniAggiuntivi: ordiniNuovi - ordiniAttuali,
      fatturatoAggiuntivoMese,
      fatturatoAggiuntivoAnno,
    };
  }, [preventiviMese, ticketMedio, closeRateAttuale]);

  const formatEuro = (n: number) =>
    new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <div className="rounded-2xl border border-orange-200 bg-white p-6 shadow-lg sm:p-8">
      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between text-sm font-bold text-[#0f172a]">
              <label htmlFor="preventivi-mese">{preventiviLabel}</label>
              <span className="text-[#D95E0B]">{preventiviMese}</span>
            </div>
            <input
              id="preventivi-mese"
              type="range"
              min={5}
              max={120}
              step={1}
              value={preventiviMese}
              onChange={(e) => setPreventiviMese(Number(e.target.value))}
              className="mt-3 w-full accent-[#F97415]"
            />
            <div className="mt-1 flex justify-between text-xs text-slate-500">
              <span>5</span>
              <span>120</span>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-sm font-bold text-[#0f172a]">
              <label htmlFor="ticket-medio">{ticketLabel}</label>
              <span className="text-[#D95E0B]">{formatEuro(ticketMedio)}</span>
            </div>
            <input
              id="ticket-medio"
              type="range"
              min={ticketMin}
              max={ticketMax}
              step={ticketStep}
              value={ticketMedio}
              onChange={(e) => setTicketMedio(Number(e.target.value))}
              className="mt-3 w-full accent-[#F97415]"
            />
            <div className="mt-1 flex justify-between text-xs text-slate-500">
              <span>{formatEuro(ticketMin)}</span>
              <span>{formatEuro(ticketMax)}</span>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-sm font-bold text-[#0f172a]">
              <label htmlFor="close-rate">Close rate attuale</label>
              <span className="text-[#D95E0B]">{closeRateAttuale}%</span>
            </div>
            <input
              id="close-rate"
              type="range"
              min={5}
              max={70}
              step={1}
              value={closeRateAttuale}
              onChange={(e) => setCloseRateAttuale(Number(e.target.value))}
              className="mt-3 w-full accent-[#F97415]"
            />
            <div className="mt-1 flex justify-between text-xs text-slate-500">
              <span>5%</span>
              <span>70%</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-orange-200 bg-gradient-to-br from-[#fff4e6] to-[#ffe9d2] p-6">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#D95E0B]">
            Stima conservativa
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            +12 punti di close rate ipotizzati grazie al prima/dopo in trattativa.
          </p>

          <div className="mt-5 space-y-4">
            <div className="rounded-lg bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Nuovo close rate
              </p>
              <p className="mt-1 text-2xl font-black text-[#0f172a]">{result.newCloseRate.toFixed(0)}%</p>
            </div>
            <div className="rounded-lg bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Ordini extra al mese
              </p>
              <p className="mt-1 text-2xl font-black text-[#0f172a]">+{result.ordiniAggiuntivi.toFixed(1)}</p>
            </div>
            <div className="rounded-lg bg-[#0f172a] p-4 text-white">
              <p className="text-xs font-bold uppercase tracking-wider text-orange-200">
                Fatturato aggiuntivo annuo
              </p>
              <p className="mt-1 text-3xl font-black tracking-tight text-white">
                {formatEuro(result.fatturatoAggiuntivoAnno)}
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-300">
                Pari a {formatEuro(result.fatturatoAggiuntivoMese)} al mese in più, a parità di lead.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onRequestInfo}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#F97415] px-5 py-3 text-sm font-extrabold text-white shadow-md transition hover:bg-[#D95E0B]"
          >
            Sblocca il render in demo
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* DASHBOARD MOCK                                                      */
/* ================================================================== */
function DashboardMock() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 rounded-[32px] bg-orange-500/15 blur-3xl" aria-hidden="true" />
      <div
        className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0a1222] shadow-2xl"
        style={{ transform: "perspective(1200px) rotateX(2deg)" }}
      >
        <div className="flex items-center gap-2 border-b border-white/5 bg-[#070d18] px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
          <span className="ml-3 text-[10px] font-mono text-white/50">app.ediliziaincloud.com / opportunità</span>
        </div>
        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
          {[
            { label: "Preventivi inviati", value: "47", trend: "+12%", color: "#3b82f6" },
            { label: "Render generati", value: "29", trend: "+38%", color: "#F97415" },
            { label: "Ordini chiusi", value: "16", trend: "+22%", color: "#22c55e" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-white/5 bg-white/[0.04] p-3">
              <p className="text-[9px] font-bold uppercase tracking-wider text-white/50">{s.label}</p>
              <div className="mt-2 flex items-end justify-between">
                <p className="text-xl font-black text-white">{s.value}</p>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[9px] font-black"
                  style={{ background: `${s.color}25`, color: s.color }}
                >
                  {s.trend}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 px-4 pb-4 md:grid-cols-[1.4fr_1fr]">
          <div className="rounded-lg border border-white/5 bg-white/[0.04] p-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold text-white/70">Conversione preventivi · ultimi 6 mesi</p>
              <span className="rounded bg-orange-500/20 px-1.5 py-0.5 text-[9px] font-black text-orange-200">
                con render
              </span>
            </div>
            <div className="mt-3 flex h-20 items-end gap-2">
              {[28, 31, 35, 41, 48, 52].map((h, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-sm"
                    style={{
                      height: `${(h / 60) * 100}%`,
                      background: "linear-gradient(to top, #F97415, #fbbf77)",
                    }}
                  />
                  <span className="text-[8px] text-white/50">{["Set", "Ott", "Nov", "Dic", "Gen", "Feb"][i]}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-white/5 bg-white/[0.04] p-3">
            <p className="text-[10px] font-bold text-white/70">Pipeline render → ordine</p>
            <div className="mt-3 space-y-2">
              {[
                { name: "Rossi M.", stage: "Render inviato", color: "#3b82f6" },
                { name: "Bianchi G.", stage: "Sopralluogo", color: "#f59e0b" },
                { name: "Verdi C.", stage: "Firmato", color: "#22c55e" },
              ].map((r) => (
                <div key={r.name} className="flex items-center justify-between text-[10px]">
                  <span className="truncate text-white/80">{r.name}</span>
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                    style={{ background: `${r.color}25`, color: r.color }}
                  >
                    {r.stage}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* MAIN PAGE TEMPLATE                                                  */
/* ================================================================== */
export default function RenderPageTemplate({ config }: { config: RenderPageConfig }) {
  const [leadModalOpen, setLeadModalOpen] = useState(false);
  const openLeadModal = () => setLeadModalOpen(true);
  useSEO({
    title: config.seo.title,
    description: config.seo.description,
    canonical: `/funzionalita/${config.slug}/`,
    keywords: config.seo.keywords,
    ogImage: config.seo.ogImage,
  });

  const pageUrl = `${SITE_URL}/funzionalita/${config.slug}/`;
  const videoSrc = config.videoSrc || `/videos/${config.slug}-demo.mp4`;
  const videoPoster = config.videoPoster || `/videos/${config.slug}-poster.jpg`;
  const videoUploadDate = "2026-04-27";

  // ROI calc defaults — tuned per vertical
  const roiDefaults = useMemo(() => {
    const slug = config.slug;
    if (slug === "render-piscine") return { default: 25000, min: 8000, max: 80000, step: 1000 };
    if (slug === "render-ristrutturazioni") return { default: 35000, min: 10000, max: 120000, step: 2000 };
    if (slug === "render-tetti") return { default: 18000, min: 5000, max: 60000, step: 1000 };
    if (slug === "render-bagni") return { default: 12000, min: 4000, max: 40000, step: 500 };
    if (slug === "render-pavimenti") return { default: 6000, min: 1500, max: 25000, step: 500 };
    if (slug === "render-stanza") return { default: 8000, min: 2000, max: 30000, step: 500 };
    return { default: 8000, min: 2000, max: 30000, step: 500 };
  }, [config.slug]);

  return (
    <div className="min-h-screen bg-white text-[#0f172a]">
      <JsonLd
        id={`jsonld-breadcrumb-${config.slug}`}
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
            { "@type": "ListItem", position: 2, name: "Funzionalita", item: `${SITE_URL}/funzionalita/` },
            { "@type": "ListItem", position: 3, name: config.productName, item: pageUrl },
          ],
        }}
      />
      <JsonLd
        id={`jsonld-software-${config.slug}`}
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: config.productName,
          applicationCategory: "BusinessApplication",
          applicationSubCategory: config.applicationSubCategory || "Sales Enablement",
          operatingSystem: "Web, iOS, Android",
          url: pageUrl,
          image: config.seo.ogImage,
          inLanguage: "it-IT",
          description: config.seo.description,
          provider: {
            "@type": "Organization",
            name: "Edilizia in Cloud",
            url: SITE_URL,
            logo: `${SITE_URL}/logo.png`,
          },
          audience: {
            "@type": "Audience",
            audienceType: config.audience,
            geographicArea: { "@type": "Country", name: "Italia" },
          },
          featureList: config.featureRows.map((f) => f.label),
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "EUR",
            availability: "https://schema.org/InStock",
            url: `${SITE_URL}/demo/`,
            description: `Accesso beta al modulo ${config.productName} per i primi 100 ${config.audienceShort} italiani. Cancelli quando vuoi, onboarding 1-a-1 incluso.`,
          },
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: "4.9",
            bestRating: "5",
            worstRating: "1",
            ratingCount: "37",
          },
        }}
      />
      <JsonLd
        id={`jsonld-video-${config.slug}`}
        data={{
          "@context": "https://schema.org",
          "@type": "VideoObject",
          name: `Demo ${config.productName} · Trasforma una foto in una vendita`,
          description: `Video demo di ${config.productName}: in 60 secondi carichi la foto del cliente, scegli finiture, generi il prima/dopo e lo invii direttamente su WhatsApp.`,
          thumbnailUrl: [`${SITE_URL}${videoPoster}`],
          uploadDate: videoUploadDate,
          contentUrl: `${SITE_URL}${videoSrc}`,
          embedUrl: `${pageUrl}#video-demo`,
          duration: "PT1M",
          publisher: {
            "@type": "Organization",
            name: "Edilizia in Cloud",
            logo: { "@type": "ImageObject", url: `${SITE_URL}/logo.png`, width: 600, height: 60 },
          },
        }}
      />
      <JsonLd
        id={`jsonld-howto-${config.slug}`}
        data={{
          "@context": "https://schema.org",
          "@type": "HowTo",
          name: `Come creare un render prima/dopo per ${config.vertical.toLowerCase()}`,
          description: `Procedura in 3 step per generare un render AI di ${config.vertical.toLowerCase()} partendo dalla foto reale del cliente e usarlo in trattativa.`,
          totalTime: "PT1M",
          tool: [{ "@type": "HowToTool", name: `Edilizia in Cloud · Modulo ${config.productName}` }],
          step: config.mechanismSteps.map((step, idx) => ({
            "@type": "HowToStep",
            position: idx + 1,
            name: step.title,
            text: step.text,
            url: `${pageUrl}#step-${idx + 1}`,
          })),
        }}
      />
      <JsonLd
        id={`jsonld-itemlist-${config.slug}`}
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `Famiglia Render AI · Moduli per ${config.audienceShort}`,
          itemListOrder: "https://schema.org/ItemListOrderAscending",
          numberOfItems: config.familyItems.length,
          itemListElement: config.familyItems.map((m, idx) => ({
            "@type": "ListItem",
            position: idx + 1,
            name: m.title,
            description: m.text,
            url: `${pageUrl}#famiglia-render`,
          })),
        }}
      />
      <JsonLd
        id={`jsonld-faq-${config.slug}`}
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: config.faqs.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
        }}
      />
      <JsonLd
        id={`jsonld-webpage-${config.slug}`}
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          "@id": pageUrl,
          url: pageUrl,
          name: config.productName,
          description: config.seo.description,
          inLanguage: "it-IT",
          isPartOf: { "@type": "WebSite", name: "Edilizia in Cloud", url: SITE_URL },
          primaryImageOfPage: config.seo.ogImage
            ? { "@type": "ImageObject", url: config.seo.ogImage, width: 1200, height: 630 }
            : undefined,
          about: { "@type": "Thing", name: `Render AI per ${config.vertical.toLowerCase()}` },
          audience: { "@type": "Audience", audienceType: config.audience },
        }}
      />

      <LandingNavbar />

      <noscript>
        <div style={{ padding: "24px", maxWidth: "960px", margin: "0 auto" }}>
          <h1>{config.heroH1}</h1>
          <p>{config.heroSubheadline}</p>
          <p>
            <strong>Provala con onboarding 1-a-1 incluso.</strong>
            <a href="#render-request">Richiedi informazioni</a> ·
            <a href="/funzionalita/">Tutte le funzionalità</a> ·
            <a href="/prezzi/">Prezzi</a>
          </p>
        </div>
      </noscript>

      <main className="pb-24 lg:pb-0">
        {/* HERO */}
        <section
          aria-labelledby="hero-title"
          className="relative overflow-hidden bg-gradient-to-br from-[#0b1220] via-[#0f1a2e] to-[#1a2540] px-6 pb-16 pt-28 text-white sm:pt-32"
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            aria-hidden="true"
            style={{
              backgroundImage:
                "linear-gradient(rgba(249,116,21,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(249,116,21,0.35) 1px, transparent 1px)",
              backgroundSize: "56px 56px",
              maskImage:
                "radial-gradient(ellipse 80% 60% at 50% 30%, black 40%, transparent 90%)",
              WebkitMaskImage:
                "radial-gradient(ellipse 80% 60% at 50% 30%, black 40%, transparent 90%)",
            }}
          />
          <div className="pointer-events-none absolute -top-20 -left-20 h-[120%] w-[60%] -rotate-12 bg-gradient-to-br from-orange-500/25 via-orange-500/5 to-transparent blur-2xl" />
          <div className="pointer-events-none absolute -bottom-32 -right-20 h-[100%] w-[55%] rotate-12 bg-gradient-to-tl from-orange-600/20 via-orange-500/5 to-transparent blur-3xl" />
          <div className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[480px] -translate-x-1/2 animate-pulse-glow rounded-full bg-orange-500/35 blur-[120px]" />
          <div className="pointer-events-none absolute top-32 right-10 h-72 w-72 animate-float-slow rounded-full bg-orange-500/25 blur-[100px]" />
          <div className="pointer-events-none absolute bottom-20 left-10 h-80 w-80 animate-float rounded-full bg-orange-600/20 blur-[110px]" />
          <div className="pointer-events-none absolute -bottom-32 right-1/3 h-72 w-72 rounded-full bg-amber-500/15 blur-3xl" />
          <div className="pointer-events-none absolute left-[8%] top-[18%] h-2 w-2 animate-float rounded-full bg-orange-300 shadow-[0_0_24px_8px_rgba(249,116,21,0.55)]" />
          <div className="pointer-events-none absolute right-[10%] top-[28%] h-1.5 w-1.5 animate-float-slow rounded-full bg-amber-200 shadow-[0_0_18px_6px_rgba(251,191,36,0.45)]" />
          <div className="pointer-events-none absolute left-[15%] top-[62%] h-1 w-1 animate-float rounded-full bg-orange-400 shadow-[0_0_14px_5px_rgba(249,116,21,0.55)]" />
          <div className="pointer-events-none absolute right-[18%] top-[68%] h-1.5 w-1.5 animate-float-slow rounded-full bg-orange-300 shadow-[0_0_16px_6px_rgba(249,116,21,0.5)]" />
          <div className="pointer-events-none absolute left-[40%] top-[12%] h-1 w-1 animate-float rounded-full bg-amber-300 shadow-[0_0_12px_5px_rgba(251,191,36,0.5)]" />
          <div className="pointer-events-none absolute -bottom-20 left-1/3 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />

          <div className="relative mx-auto max-w-5xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-orange-400/35 bg-orange-500/15 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.18em] text-orange-200">
              <Sparkles className="h-4 w-4" />
              {config.heroBadge}
            </div>
            <h1
              id="hero-title"
              className="mx-auto max-w-4xl text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl"
            >
              {config.heroH1}
            </h1>
            <p className="mx-auto mt-6 max-w-3xl text-lg font-medium leading-8 text-slate-200 sm:text-xl">
              {config.heroSubheadline}
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={openLeadModal}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#F97415] px-7 py-4 text-base font-extrabold text-white shadow-lg shadow-orange-950/30 transition hover:bg-[#D95E0B] sm:w-auto"
              >
                {config.heroPrimaryCta || "Prova GRATIS la Demo"}
                <ArrowRight className="h-5 w-5" />
              </button>
              <a
                href="#video-demo"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/25 bg-white/10 px-7 py-4 text-base font-bold text-white transition hover:bg-white/15 sm:w-auto"
              >
                <Play className="h-4 w-4 fill-white" />
                {config.heroSecondaryCta || "Guarda il video demo"}
              </a>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-semibold text-slate-300 sm:text-sm">
              {config.reassurancePoints.map((item) => (
                <span key={item} className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  {item}
                </span>
              ))}
            </div>

            <div className="mx-auto mt-12 max-w-5xl">
              <BeforeAfterSlider vertical={config.vertical} />
              <p className="mt-3 text-center text-[11px] font-medium uppercase tracking-wider text-white/50">
                {config.heroFooterDisclaimer ||
                  "Esempio dimostrativo · Il render reale parte dalla foto del cliente"}
              </p>
            </div>

            <div className="mx-auto mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
              {TRUST_BADGES.map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-2 text-xs font-bold text-slate-300/90"
                >
                  <Icon className="h-4 w-4 text-emerald-300" />
                  {label}
                </span>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {config.proofPoints.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-slate-100 sm:text-sm"
                >
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  {item}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* OBJECTIVE ROW */}
        <section className="border-b border-slate-200 bg-white px-6 py-7">
          <div className="mx-auto grid max-w-6xl gap-4 sm:grid-cols-3">
            {config.objectiveRow.map(([label, value]) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
                <p className="mt-2 text-base font-extrabold text-[#0f172a]">{value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* SCARCITY */}
        <section
          aria-labelledby="beta-title"
          className="relative overflow-hidden bg-gradient-to-r from-[#F97415] to-[#D95E0B] px-6 py-12 text-white"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_50%,rgba(255,255,255,0.18),transparent_55%)]" />
          <div className="relative mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs font-black uppercase tracking-[0.18em]">
                <Sparkles className="h-3.5 w-3.5" />
                Accesso Beta · Posti limitati
              </div>
              <h2 id="beta-title" className="mt-3 text-2xl font-black leading-tight sm:text-3xl">
                {config.betaH2}
              </h2>
              <p className="mt-3 text-base leading-7 text-orange-50">{config.betaBody}</p>
            </div>
            <button
              type="button"
              onClick={openLeadModal}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-white px-6 py-4 text-base font-extrabold text-[#D95E0B] shadow-lg transition hover:bg-orange-50"
            >
              Riserva il tuo posto
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </section>

        {/* SPEED STATS */}
        <section aria-labelledby="speed-title" className="bg-[#fff7ed] px-6 py-16">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">
                Risposta immediata
              </p>
              <h2
                id="speed-title"
                className="mt-3 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl"
              >
                {config.speedH2}
              </h2>
              <p className="mt-4 text-lg leading-8 text-slate-700">{config.speedSubheadline}</p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {config.speedStats.map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-orange-200 bg-white p-6 shadow-sm transition hover:shadow-md"
                >
                  <p className="text-5xl font-black tracking-tight text-[#D95E0B]">
                    <CountUp value={item.value} prefix={item.prefix} suffix={item.suffix} />
                  </p>
                  <p className="mt-3 text-sm font-semibold leading-6 text-slate-700">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* VIDEO DEMO */}
        <section id="video-demo" aria-labelledby="video-title" className="bg-white px-6 py-20">
          <div className="mx-auto max-w-5xl">
            <div className="mx-auto max-w-3xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#D95E0B]">
                <Play className="h-3.5 w-3.5 fill-[#D95E0B]" />
                Guarda il video demo
              </div>
              <h2
                id="video-title"
                className="mt-4 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl"
              >
                {config.videoH2}
              </h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">{config.videoSubheadline}</p>
            </div>
            <div className="mt-10">
              <VideoDemo src={videoSrc} poster={videoPoster} vertical={config.vertical} />
            </div>
            <p className="mt-4 text-center text-xs leading-6 text-slate-500">
              {config.videoDisclaimer ||
                "Vuoi provarlo sulla foto di un tuo cliente reale? Riserva il tuo accesso beta."}
            </p>
          </div>
        </section>

        {/* FAMIGLIA RENDER */}
        <section
          id="famiglia-render"
          aria-labelledby="famiglia-title"
          className="bg-gradient-to-b from-white to-[#fff7ed] px-6 py-20"
        >
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#D95E0B]">
                <Sparkles className="h-3.5 w-3.5" />
                Famiglia Render AI
              </div>
              <h2
                id="famiglia-title"
                className="mt-4 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl"
              >
                {config.familyH2}
              </h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">{config.familySubheadline}</p>
            </div>

            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {config.familyItems.map((m) => (
                <div
                  key={m.title}
                  className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-orange-300 hover:shadow-lg"
                >
                  <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-orange-500/10 blur-2xl transition group-hover:bg-orange-500/20" />
                  <div className="relative flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-orange-100 to-orange-200 text-[#D95E0B] shadow-sm">
                      <m.icon className="h-6 w-6" />
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                        m.available
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {m.available ? "Disponibile" : "In arrivo"}
                    </span>
                  </div>
                  <h3 className="relative mt-5 text-xl font-black text-[#0f172a]">{m.title}</h3>
                  <p className="relative mt-2 text-sm leading-7 text-slate-600">{m.text}</p>
                  <div className="relative mt-5 inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[#D95E0B]">
                    <Sparkles className="h-3 w-3" />
                    Prima/dopo · PDF · CRM
                  </div>
                </div>
              ))}

              <div className="relative overflow-hidden rounded-2xl border-2 border-[#F97415] bg-gradient-to-br from-[#0f172a] to-[#1a2540] p-6 text-white shadow-xl">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(249,116,21,0.35),transparent_55%)]" />
                <div className="relative">
                  <div className="inline-flex items-center gap-2 rounded-full bg-orange-500/20 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-orange-200">
                    <Sparkles className="h-3 w-3" />
                    Tutto in 1
                  </div>
                  <h3 className="mt-5 text-xl font-black">{config.familyBonusTitle}</h3>
                  <p className="mt-2 text-sm leading-7 text-slate-300">{config.familyBonusText}</p>
                  <button
                    type="button"
                    onClick={openLeadModal}
                    className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-[#F97415] px-4 py-2.5 text-xs font-extrabold text-white shadow-md transition hover:bg-[#D95E0B]"
                  >
                    Sblocca tutta la suite
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* PAIN */}
        <section className="bg-[#f8fafc] px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">
                {config.painKicker}
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                {config.painH2}
              </h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">{config.painSubheadline}</p>
            </div>

            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {config.painPoints.map((item) => (
                <div
                  key={item.title}
                  className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-50">
                    <item.icon className="h-6 w-6 text-[#F97415]" />
                  </div>
                  <h3 className="mt-5 text-xl font-black text-[#0f172a]">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* BEFORE/AFTER AREAS */}
        <section className="bg-white px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">
                {config.baKicker}
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                {config.baH2}
              </h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">{config.baSubheadline}</p>
            </div>

            <div className="mt-10 grid gap-5 md:grid-cols-2">
              {config.baAreas.map((area) => (
                <div
                  key={area.title}
                  className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
                >
                  <div className="grid min-h-[210px] md:grid-cols-2">
                    <div className="bg-slate-900 p-5 text-white">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Prima</p>
                      <h3 className="mt-4 text-xl font-black">{area.title}</h3>
                      <p className="mt-4 text-sm leading-7 text-slate-300">{area.before}</p>
                    </div>
                    <div className="bg-orange-50 p-5 text-[#0f172a]">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#D95E0B]">Dopo</p>
                      <h3 className="mt-4 text-xl font-black">Nuovo impatto visivo</h3>
                      <p className="mt-4 text-sm leading-7 text-slate-700">{area.after}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* MECHANISM */}
        <section id="meccanismo" aria-labelledby="meccanismo-title" className="bg-white px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">
                {config.mechanismKicker}
              </p>
              <h2
                id="meccanismo-title"
                className="mt-3 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl"
              >
                {config.mechanismH2}
              </h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">{config.mechanismSubheadline}</p>
            </div>

            <div className="relative mt-12">
              <div
                className="absolute left-0 right-0 top-6 hidden h-0.5 bg-gradient-to-r from-orange-200 via-orange-400 to-orange-200 md:block"
                aria-hidden="true"
              />
              <div className="grid gap-8 md:grid-cols-3">
                {config.mechanismSteps.map((step, index) => (
                  <div key={step.title} id={`step-${index + 1}`} className="relative">
                    <div className="relative z-10 mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#F97415] text-white shadow-lg shadow-orange-200">
                      <step.icon className="h-5 w-5" />
                    </div>
                    <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#D95E0B]">
                        Step {index + 1}
                      </p>
                      <h3 className="mt-2 text-lg font-black text-[#0f172a]">{step.title}</h3>
                      <p className="mt-2 text-sm leading-7 text-slate-600">{step.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-10 text-center">
              <button
                type="button"
                onClick={openLeadModal}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0f172a] px-7 py-4 text-sm font-extrabold text-white transition hover:bg-[#1e293b]"
              >
                {config.mechanismCta}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>

        {/* COMMERCIAL LEVERS */}
        <section className="bg-[#0f172a] px-6 py-20 text-white">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.2em] text-orange-300">
                  {config.commercialKicker}
                </p>
                <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                  {config.commercialH2}
                </h2>
                <p className="mt-5 text-lg leading-8 text-slate-300">{config.commercialBody}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {config.commercialLevers.map((item) => (
                  <div
                    key={item.title}
                    className="rounded-lg border border-white/10 bg-white/5 p-5 transition hover:bg-white/10"
                  >
                    <item.icon className="h-6 w-6 text-orange-300" />
                    <h3 className="mt-4 text-lg font-black">{item.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-slate-300">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* RISULTATI CON EDILIZIA IN CLOUD */}
        <section className="bg-gradient-to-br from-[#fff7ed] via-white to-[#fff1e0] px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#D95E0B]">
                <TrendingUp className="h-3.5 w-3.5" />
                {config.resultsKicker}
              </div>
              <h2 className="mt-4 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                {config.resultsH2}
              </h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">{config.resultsBody}</p>
            </div>

            <div className="mt-12 grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
              <DashboardMock />
              <div className="space-y-5">
                {config.integrationPillars.map((p) => (
                  <div
                    key={p.title}
                    className="rounded-xl border border-orange-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="flex gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-[#D95E0B]">
                        <p.icon className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-[#0f172a]">{p.title}</h3>
                        <p className="mt-1.5 text-sm leading-7 text-slate-600">{p.text}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {config.resultStats.map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm"
                >
                  <p className="text-4xl font-black tracking-tight text-[#0f172a]">
                    <CountUp value={item.value} prefix={item.prefix} suffix={item.suffix} />
                  </p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{item.label}</p>
                </div>
              ))}
            </div>

            <div className="mt-10 text-center">
              <button
                type="button"
                onClick={openLeadModal}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#F97415] px-7 py-4 text-base font-extrabold text-white shadow-lg shadow-orange-900/20 transition hover:bg-[#D95E0B]"
              >
                {config.resultsCta}
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </section>

        {/* ROI CALCULATOR */}
        <section className="bg-white px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#D95E0B]">
                <TrendingUp className="h-3.5 w-3.5" />
                {config.roiKicker}
              </div>
              <h2 className="mt-4 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                {config.roiH2}
              </h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">{config.roiSubheadline}</p>
            </div>
            <div className="mt-10">
              <RoiCalculator
                preventiviLabel={config.roiPreventiviLabel}
                ticketLabel={config.roiTicketLabel}
                ticketDefault={roiDefaults.default}
                ticketMin={roiDefaults.min}
                ticketMax={roiDefaults.max}
                ticketStep={roiDefaults.step}
                onRequestInfo={openLeadModal}
              />
            </div>
            <p className="mt-4 text-center text-xs leading-6 text-slate-500">
              Stima indicativa basata su benchmark di settore. Il risultato reale dipende da prodotto,
              prezzo, qualità del lead e processo commerciale.
            </p>
          </div>
        </section>

        {/* SALES IMPACT */}
        <section className="bg-[#f8fafc] px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">
                  {config.salesKicker}
                </p>
                <h2 className="mt-3 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                  {config.salesH2}
                </h2>
                <p className="mt-5 text-lg leading-8 text-slate-600">{config.salesBody}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {config.salesImpact.map((item) => (
                  <div
                    key={item.title}
                    className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
                  >
                    <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                    <h3 className="mt-4 text-lg font-black text-[#0f172a]">{item.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-slate-600">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* WHAT YOU DELIVER */}
        <section className="bg-white px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">
                {config.featureKicker}
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                {config.featureH2}
              </h2>
            </div>

            <div className="mt-10 overflow-hidden rounded-lg border border-slate-200">
              {config.featureRows.map((row, index) => (
                <div
                  key={row.label}
                  className={`grid gap-3 px-5 py-5 md:grid-cols-[0.36fr_0.64fr] ${
                    index % 2 === 0 ? "bg-slate-50" : "bg-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <ImageIcon className="h-5 w-5 text-[#F97415]" />
                    <p className="font-black text-[#0f172a]">{row.label}</p>
                  </div>
                  <p className="text-sm leading-7 text-slate-600">{row.value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SCENARIOS */}
        <section className="bg-[#f8fafc] px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">
                  {config.scenarioKicker}
                </p>
                <h2 className="mt-3 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                  {config.scenarioH2}
                </h2>
              </div>
              <div className="grid gap-4">
                {config.scenarios.map((item) => (
                  <div
                    key={item.title}
                    className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <h3 className="text-lg font-black text-[#0f172a]">{item.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-slate-600">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" aria-labelledby="faq-title" className="bg-white px-6 py-20">
          <div className="mx-auto max-w-5xl">
            <div className="text-center">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">
                {config.faqKicker}
              </p>
              <h2 id="faq-title" className="mt-3 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                {config.faqH2}
              </h2>
            </div>
            <div className="mt-10 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
              {config.faqs.map((item) => (
                <details key={item.q} className="group p-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-black text-[#0f172a]">
                    {item.q}
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-[#D95E0B] transition group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* INTERNAL LINKS */}
        <section aria-labelledby="approfondisci-title" className="bg-[#f8fafc] px-6 py-16">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">
                {config.internalLinksKicker}
              </p>
              <h2
                id="approfondisci-title"
                className="mt-3 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl"
              >
                {config.internalLinksH2}
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-600">{config.internalLinksBody}</p>
            </div>

            <nav
              aria-label="Pagine correlate"
              className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3"
            >
              {config.internalLinks.map((link) => {
                if (link.to === "/demo") {
                  return (
                    <button
                      key={`${link.title}-render-lead`}
                      type="button"
                      onClick={openLeadModal}
                      className="group flex flex-col rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md"
                    >
                      <span className="inline-flex items-center gap-2 text-base font-black text-[#0f172a] group-hover:text-[#D95E0B]">
                        {link.title}
                        <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                      </span>
                      <span className="mt-2 text-sm leading-6 text-slate-600">{link.text}</span>
                    </button>
                  );
                }

                return (
                  <Link
                    key={`${link.title}-${link.to}`}
                    to={link.to}
                    className="group flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md"
                  >
                    <span className="inline-flex items-center gap-2 text-base font-black text-[#0f172a] group-hover:text-[#D95E0B]">
                      {link.title}
                      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                    </span>
                    <span className="mt-2 text-sm leading-6 text-slate-600">{link.text}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </section>

        {/* FINAL CTA */}
        <section
          id="render-request"
          aria-labelledby="final-cta-title"
          className="bg-[#0b1220] px-6 py-20 text-center text-white"
        >
          <div className="mx-auto max-w-3xl">
            <Wand2 className="mx-auto h-10 w-10 text-orange-300" />
            <h2
              id="final-cta-title"
              className="mt-5 text-3xl font-black tracking-tight sm:text-4xl"
            >
              {config.finalCtaH2}
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-300">{config.finalCtaBody}</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3">
              <button
                type="button"
                onClick={openLeadModal}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#F97415] px-8 py-4 text-base font-extrabold text-white shadow-lg shadow-orange-900/30 transition hover:bg-[#D95E0B]"
              >
                {config.finalCtaButton}
                <ArrowRight className="h-5 w-5" />
              </button>
              <p className="text-xs font-medium text-slate-400">{config.finalCtaMicrocopy}</p>
            </div>
          </div>
        </section>
      </main>

      {/* STICKY MOBILE CTA */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={openLeadModal}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#F97415] px-5 py-3 text-sm font-extrabold text-white shadow-md transition hover:bg-[#D95E0B]"
        >
          {config.stickyCtaLabel}
          <ArrowRight className="h-4 w-4" />
        </button>
        <p className="mt-1 text-center text-[10px] font-semibold text-slate-500">
          {config.stickyCtaMicrocopy}
        </p>
      </div>

      <RenderLeadModal slug={config.slug} open={leadModalOpen} onOpenChange={setLeadModalOpen} />
      <LandingFooter />
    </div>
  );
}

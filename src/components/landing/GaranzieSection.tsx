import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, CalendarDays, Settings2, Target, RefreshCw } from "lucide-react";

interface GaranzieSectionProps {
  variant?: "full" | "compact";
}

const GARANZIE = [
  {
    num: "01",
    Icon: CalendarDays,
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    borderColor: "border-emerald-200",
    accentColor: "text-emerald-700",
    highlightBg: "bg-emerald-50 border-emerald-200",
    label: "Garanzia 1",
    title: "Prova 31 Giorni",
    tagline: "31 giorni gratis, senza carta di credito.",
    lines: [
      { bold: false, text: "Provi, vede come funziona, decide con calma." },
    ],
  },
  {
    num: "02",
    Icon: Settings2,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    borderColor: "border-blue-200",
    accentColor: "text-blue-700",
    highlightBg: "bg-blue-50 border-blue-200",
    label: "Garanzia 2",
    title: "Onboarding Dedicato",
    tagline: "Non la lasciamo sola davanti a uno schermo.",
    lines: [
      { bold: false, text: "La affianchiamo finché il software non diventa il suo strumento di lavoro." },
    ],
  },
  {
    num: "03",
    Icon: Target,
    iconBg: "bg-orange-50",
    iconColor: "text-[#F97316]",
    borderColor: "border-[#F97316]/40",
    accentColor: "text-[#F97316]",
    highlightBg: "bg-orange-50 border-orange-200",
    label: "Garanzia 3",
    title: "Risultato in 60 Giorni",
    tagline: "Risultato garantito o rimborso totale.",
    lines: [
      { bold: false, text: "Entro 60 giorni vede un miglioramento concreto nella gestione del suo cantiere — o le rimborsiamo ogni centesimo, senza domande." },
    ],
  },
  {
    num: "04",
    Icon: RefreshCw,
    iconBg: "bg-purple-50",
    iconColor: "text-purple-600",
    borderColor: "border-purple-200",
    accentColor: "text-purple-700",
    highlightBg: "bg-purple-50 border-purple-200",
    label: "Garanzia 4",
    title: "Rottamazione Gestionale",
    tagline: "Nessun doppio costo durante la transizione.",
    lines: [
      { bold: false, text: "Sta già pagando un altro gestionale? Le copriamo i costi di passaggio. Nessun doppio costo durante la transizione." },
    ],
  },
];

export default function GaranzieSection({ variant = "full" }: GaranzieSectionProps) {
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.08 });

  if (variant === "compact") {
    return (
      <div className="my-10 rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="bg-[#1E3A5F] px-6 py-4 flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-[#F97316] flex-shrink-0" />
          <div>
            <p className="text-[#F97316] text-xs font-bold uppercase tracking-widest">Garanzie — senza asterischi</p>
            <p className="text-white font-extrabold text-base mt-0.5">Il rischio è nostro. Non tuo.</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
          {GARANZIE.map((g, i) => {
            const Icon = g.Icon;
            return (
              <div key={i} className="p-5 bg-white hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`${g.iconBg} p-2 rounded-lg flex-shrink-0`}>
                    <Icon className={`w-4 h-4 ${g.iconColor}`} />
                  </div>
                  <div>
                    <p className={`text-[10px] font-bold uppercase tracking-widest ${g.accentColor}`}>{g.label}</p>
                    <p className="font-bold text-[#1E3A5F] text-sm">{g.title}</p>
                  </div>
                </div>
                <p className="text-gray-500 text-xs leading-relaxed">{g.lines[0].text}</p>
              </div>
            );
          })}
        </div>
        <div className="bg-gray-50 px-6 py-4 text-center border-t border-gray-100">
          <Link
            to="/demo"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#F97316] text-white font-bold text-sm hover:bg-[#e8650e] transition-all hover:scale-105 shadow-md shadow-[#F97316]/20"
          >
            Prova 31 giorni gratis <ArrowRight size={14} />
          </Link>
          <p className="text-gray-400 text-xs mt-2">Nessuna carta di credito. Cancelli quando vuoi.</p>
        </div>
      </div>
    );
  }

  return (
    <section
      className="relative overflow-hidden bg-gradient-to-b from-white via-slate-50 to-white"
      id="garanzie-section"
    >
      <style>{`
        @keyframes garanzia-fade-up {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes garanzie-shine {
          0%   { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
        @keyframes garanzie-pulse {
          0%, 100% { opacity: 0.7; }
          50%       { opacity: 1; }
        }

        .garanzia-card-anim {
          opacity: 0;
          animation: garanzia-fade-up 0.55s ease-out forwards;
        }
        .garanzia-card-anim.delay-1 { animation-delay: 80ms; }
        .garanzia-card-anim.delay-2 { animation-delay: 180ms; }
        .garanzia-card-anim.delay-3 { animation-delay: 280ms; }
        .garanzia-card-anim.delay-4 { animation-delay: 380ms; }
        .garanzia-card-anim.delay-cta { animation-delay: 500ms; }

        .garanzie-shine-text {
          background: linear-gradient(90deg, #F97316 0%, #ffb347 40%, #F97316 80%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: garanzie-shine 3s linear infinite;
        }

        .garanzia-card {
          transition: transform 0.3s cubic-bezier(0.4,0,0.2,1), box-shadow 0.3s cubic-bezier(0.4,0,0.2,1);
        }
        .garanzia-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 20px 48px rgba(30,58,95,0.10);
        }
        .garanzia-card-hero:hover {
          transform: translateY(-6px);
          box-shadow: 0 24px 64px rgba(249,115,22,0.18);
        }
      `}</style>

      {/* Decorative blobs */}
      <div
        className="absolute -top-32 -right-32 w-96 h-96 rounded-full blur-3xl pointer-events-none opacity-50"
        style={{ background: "radial-gradient(circle, rgba(249,115,22,0.08) 0%, transparent 70%)", animation: "garanzie-pulse 6s ease-in-out infinite" }}
      />
      <div
        className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full blur-3xl pointer-events-none opacity-40"
        style={{ background: "radial-gradient(circle, rgba(30,58,95,0.07) 0%, transparent 70%)", animation: "garanzie-pulse 8s ease-in-out infinite 1s" }}
      />

      <div
        ref={ref as React.RefObject<HTMLDivElement>}
        className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-28 lg:py-36"
      >
        {/* ── HEADER ── */}
        <div className={`text-center mb-14 md:mb-20 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
          <div className="inline-flex items-center gap-2 mb-5 px-4 py-2 rounded-full border border-[#F97316]/25 bg-[#F97316]/8">
            <ShieldCheck className="w-4 h-4 text-[#F97316]" />
            <span className="text-[#F97316] text-xs font-bold uppercase tracking-[0.18em]">
              4 Garanzie — senza asterischi
            </span>
          </div>

          <h2 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black text-[#1E3A5F] leading-[0.92] mb-4 tracking-tight">
            Il rischio{" "}
            <span className="garanzie-shine-text">è nostro.</span>
          </h2>
          <p className="text-3xl sm:text-4xl font-black text-[#1E3A5F]/20 mb-6 tracking-tight">Non tuo.</p>
          <p className="text-gray-500 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
            Puoi provare Edilizia in Cloud senza mettere soldi sul tavolo.{" "}
            <span className="text-[#1E3A5F] font-semibold">Se non funziona per te, esci. Punto.</span>
          </p>
        </div>

        {/* ── CARDS 2×2 ── */}
        <div className="grid md:grid-cols-2 gap-5 mb-5">
          {GARANZIE.slice(0, 2).map((g, i) => {
            const Icon = g.Icon;
            return (
              <div
                key={i}
                className={`garanzia-card ${isVisible ? `garanzia-card-anim delay-${i + 1}` : "opacity-0"}
                  relative rounded-2xl border ${g.borderColor} bg-white overflow-hidden`}
              >
                {/* Decorative number */}
                <span className="absolute top-3 right-5 text-[72px] font-black text-[#1E3A5F]/[0.04] leading-none select-none pointer-events-none">
                  {g.num}
                </span>

                <div className="p-6 md:p-8">
                  {/* Header */}
                  <div className="flex items-start gap-4 mb-5">
                    <div className={`${g.iconBg} p-3 rounded-xl flex-shrink-0`}>
                      <Icon className={`w-6 h-6 ${g.iconColor}`} />
                    </div>
                    <div>
                      <span className={`text-[10px] font-black uppercase tracking-[0.18em] ${g.accentColor}`}>
                        {g.label}
                      </span>
                      <h3 className="text-[#1E3A5F] font-extrabold text-lg md:text-xl leading-tight mt-0.5">
                        {g.title}
                      </h3>
                      <p className={`text-sm font-semibold mt-0.5 ${g.accentColor}`}>{g.tagline}</p>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className={`h-px mb-5 bg-gradient-to-r from-transparent via-current to-transparent ${g.accentColor} opacity-20`} />

                  {/* Content lines */}
                  <div className="space-y-2">
                    {g.lines.map((line, j) => (
                      <p
                        key={j}
                        className={
                          line.bold
                            ? "text-[#1E3A5F] font-semibold text-sm"
                            : "text-gray-500 text-sm leading-relaxed"
                        }
                      >
                        {line.text}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── G3 — HERO CARD full width ── */}
        <div
          className={`garanzia-card-hero ${isVisible ? "garanzia-card-anim delay-3" : "opacity-0"}
            relative rounded-2xl border-2 border-[#F97316]/40 bg-white overflow-hidden mb-5`}
          style={{ boxShadow: isVisible ? "0 8px 40px rgba(249,115,22,0.10)" : "none" }}
        >
          {/* Hero badge */}
          <div className="absolute top-4 right-4 md:top-5 md:right-5 px-3 py-1 bg-[#F97316] text-white text-[10px] font-black uppercase tracking-widest rounded-full shadow-lg shadow-[#F97316]/30">
            ★ La più forte
          </div>

          {/* Decorative number */}
          <span className="absolute bottom-0 right-6 text-[120px] font-black text-[#F97316]/[0.05] leading-none select-none pointer-events-none">
            03
          </span>

          {/* Top accent line */}
          <div className="h-1 bg-gradient-to-r from-transparent via-[#F97316] to-transparent" />

          <div className="p-6 md:p-10 md:grid md:grid-cols-5 md:gap-8 md:items-start">
            {/* Left col */}
            <div className="md:col-span-2 mb-6 md:mb-0">
              <div className="flex items-center gap-4 mb-5">
                <div className="bg-orange-50 p-3 rounded-xl flex-shrink-0">
                  <Target className="w-7 h-7 text-[#F97316]" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#F97316]">
                    Garanzia 3
                  </span>
                  <h3 className="text-[#1E3A5F] font-extrabold text-xl md:text-2xl leading-tight mt-0.5">
                    Risultato 60 Giorni
                  </h3>
                </div>
              </div>
              <p className="text-[#F97316] font-bold text-base leading-snug mb-5">
                O ti rimborsiamo ogni centesimo.<br />Senza discussioni.
              </p>
              <div className="p-4 rounded-xl bg-orange-50 border border-orange-100 inline-block">
                <p className="text-[#F97316] font-black text-4xl leading-none">60</p>
                <p className="text-gray-500 text-xs uppercase tracking-widest mt-1">giorni per i risultati</p>
              </div>
            </div>

            {/* Right col */}
            <div className="md:col-span-3">
              <p className="text-[#1E3A5F] font-bold text-base mb-4">Entro 60 giorni sai esattamente:</p>
              <div className="space-y-3 mb-5">
                {GARANZIE[2].lines.slice(1, 6).map((line, j) => (
                  <div key={j} className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-[#F97316]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-[#F97316] text-xs font-black">✓</span>
                    </span>
                    <p className="text-gray-600 text-sm leading-relaxed">{line.text}</p>
                  </div>
                ))}
              </div>
              <div className="p-4 rounded-xl bg-orange-50 border border-orange-100">
                <p className="text-[#1E3A5F] font-semibold text-sm leading-relaxed">
                  {GARANZIE[2].lines[6].text}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── G4 full width ── */}
        <div
          className={`garanzia-card ${isVisible ? "garanzia-card-anim delay-4" : "opacity-0"}
            relative rounded-2xl border border-purple-200 bg-white overflow-hidden mb-14 md:mb-16`}
        >
          <span className="absolute top-3 right-5 text-[72px] font-black text-[#1E3A5F]/[0.04] leading-none select-none pointer-events-none">04</span>
          <div className="p-6 md:p-8 md:grid md:grid-cols-3 md:gap-8 md:items-center">
            {/* Left */}
            <div className="flex items-start gap-4 mb-5 md:mb-0">
              <div className="bg-purple-50 p-3 rounded-xl flex-shrink-0">
                <RefreshCw className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-purple-700">Garanzia 4</span>
                <h3 className="text-[#1E3A5F] font-extrabold text-lg md:text-xl leading-tight mt-0.5">Rottamazione</h3>
                <p className="text-purple-700 font-semibold text-sm mt-0.5">Cambi. Non perdi niente.</p>
              </div>
            </div>
            {/* Content */}
            <div className="md:col-span-2 space-y-2">
              {GARANZIE[3].lines.map((line, j) => (
                <p key={j} className={line.bold ? "text-[#1E3A5F] font-semibold text-sm" : "text-gray-500 text-sm leading-relaxed"}>
                  {line.text}
                </p>
              ))}
            </div>
          </div>
        </div>

        {/* ── CTA ── */}
        <div className={`text-center ${isVisible ? "garanzia-card-anim delay-cta" : "opacity-0"}`}>
          <div className="inline-flex items-center gap-2 mb-5 px-4 py-2 rounded-full border border-[#F97316]/25 bg-[#F97316]/8">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <p className="text-[#F97316] text-sm font-bold">
              31 giorni gratis + onboarding dedicato — nessuna carta di credito
            </p>
          </div>
          <div>
            <Link
              to="/demo"
              className="inline-flex items-center gap-3 px-8 md:px-10 py-4 md:py-5 rounded-xl bg-[#F97316] text-white font-black text-base md:text-lg hover:bg-[#e8650e] hover:scale-105 transition-all shadow-xl shadow-[#F97316]/30"
            >
              Inizia la prova gratuita <ArrowRight size={20} />
            </Link>
          </div>
          <p className="text-gray-400 text-sm mt-4">
            Nessun contratto · Nessuna carta di credito · Cancelli quando vuoi — senza spiegazioni
          </p>
        </div>
      </div>
    </section>
  );
}

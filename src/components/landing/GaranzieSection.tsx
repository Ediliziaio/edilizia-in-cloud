import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck } from "lucide-react";

interface GaranzieSectionProps {
  variant?: "full" | "compact";
}

const GARANZIE = [
  {
    num: "01",
    emoji: "🔓",
    borderColor: "border-green-400",
    glowColor: "rgba(74,222,128,0.15)",
    labelColor: "text-green-400",
    badgeBg: "bg-green-400/10 border-green-400/30",
    circleBg: "bg-green-400/20",
    label: "Garanzia 1",
    title: "Prova 31 Giorni",
    tagline: "Entra. Usa. Decidi tu.",
    lines: [
      { bold: true, text: "31 giorni gratis. Nessuna carta di credito." },
      { bold: false, text: "Nessun commerciale che ti chiama." },
      { bold: false, text: "Entri, lo usi, decidi tu." },
      { bold: false, text: "Se non fa per te — esci." },
      { bold: true, text: "Nessuno ti chiede perché." },
    ],
  },
  {
    num: "02",
    emoji: "⚙️",
    borderColor: "border-blue-400",
    glowColor: "rgba(96,165,250,0.15)",
    labelColor: "text-blue-400",
    badgeBg: "bg-blue-400/10 border-blue-400/30",
    circleBg: "bg-blue-400/20",
    label: "Garanzia 2",
    title: "Onboarding Dedicato",
    tagline: "Non sei solo davanti allo schermo.",
    lines: [
      { bold: true, text: "Non ti lasciamo da solo davanti a uno schermo." },
      { bold: false, text: "Entro 48 ore dall'attivazione, un nostro tecnico configura tutto con te: cantieri, squadre, clienti, fornitori." },
      { bold: false, text: "Sei operativo dal primo giorno." },
      { bold: true, text: "O non ti addebitiamo nulla finché non lo sei." },
    ],
  },
  {
    num: "03",
    emoji: "🎯",
    borderColor: "border-[#F97415]",
    glowColor: "rgba(249,116,21,0.20)",
    labelColor: "text-[#F97415]",
    badgeBg: "bg-[#F97415]/10 border-[#F97415]/30",
    circleBg: "bg-[#F97415]/20",
    label: "Garanzia 3",
    title: "Risultato 60 Giorni",
    tagline: "O ti rimborsiamo tutto. Senza discussioni.",
    lines: [
      { bold: true, text: "Entro 60 giorni sai esattamente:" },
      { bold: false, text: "→ Quanto hai speso su ogni cantiere aperto" },
      { bold: false, text: "→ Dove sono le tue squadre e cosa stanno facendo" },
      { bold: false, text: "→ Quante ore hai pagato e quante erano in cantiere" },
      { bold: false, text: "→ Cosa devi incassare e da chi — senza aprire Excel" },
      { bold: false, text: "→ Se stai guadagnando o perdendo su ogni lavoro" },
      { bold: true, text: "Se dopo 60 giorni non hai tutto questo — ti rimborsiamo ogni centesimo. Senza discussioni." },
    ],
  },
  {
    num: "04",
    emoji: "🔄",
    borderColor: "border-purple-400",
    glowColor: "rgba(196,181,253,0.15)",
    labelColor: "text-purple-400",
    badgeBg: "bg-purple-400/10 border-purple-400/30",
    circleBg: "bg-purple-400/20",
    label: "Garanzia 4",
    title: "Rottamazione",
    tagline: "Cambi. Non perdi niente.",
    lines: [
      { bold: true, text: "Stai già pagando un altro gestionale?" },
      { bold: false, text: "Mandaci la prova dell'abbonamento attivo." },
      { bold: false, text: "Pensiamo noi a tutto — importiamo i tuoi dati, configuriamo insieme, ti mettiamo operativo senza perdere un giorno." },
      { bold: false, text: "E per ringraziarti del coraggio di cambiare, accedi a Edilizia in Cloud con uno sconto dedicato." },
      { bold: true, text: "Cambi. Non perdi niente." },
    ],
  },
];

export default function GaranzieSection({ variant = "full" }: GaranzieSectionProps) {
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.08 });

  if (variant === "compact") {
    return (
      <div className="my-10 rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="bg-[#111111] px-6 py-4 flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-[#F97415] flex-shrink-0" />
          <div>
            <p className="text-[#F97415] text-xs font-bold uppercase tracking-widest">Garanzie — senza asterischi</p>
            <p className="text-white font-extrabold text-base mt-0.5">Il rischio è nostro. Non tuo.</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
          {GARANZIE.map((g, i) => (
            <div key={i} className="p-5 bg-white hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{g.emoji}</span>
                <div>
                  <p className={`text-[10px] font-bold uppercase tracking-widest ${g.labelColor.replace("text-[#F97415]", "text-orange-500")}`}>{g.label}</p>
                  <p className="font-bold text-[#111111] text-sm">{g.title}</p>
                </div>
              </div>
              <p className="text-gray-500 text-xs leading-relaxed">{g.lines[0].text}</p>
            </div>
          ))}
        </div>
        <div className="bg-[#f8f9fa] px-6 py-4 text-center border-t border-gray-100">
          <Link to="/demo" className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#F97415] text-white font-bold text-sm hover:bg-[#e8650e] transition-all hover:scale-105 shadow-md shadow-[#F97415]/20">
            Prova 31 giorni gratis <ArrowRight size={14} />
          </Link>
          <p className="text-gray-400 text-xs mt-2">Nessuna carta di credito. Cancelli quando vuoi.</p>
        </div>
      </div>
    );
  }

  return (
    <section className="relative overflow-hidden" id="garanzie-florin"
      style={{ background: "linear-gradient(180deg, #0a0a0a 0%, #111111 40%, #0d0d0d 100%)" }}>

      {/* Animated CSS for glow pulse */}
      <style>{`
        @keyframes glow-pulse { 0%,100%{opacity:0.6} 50%{opacity:1} }
        @keyframes slide-up { from{opacity:0;transform:translateY(32px)} to{opacity:1;transform:translateY(0)} }
        @keyframes badge-shine { 0%{background-position:200% center} 100%{background-position:-200% center} }
        .garanzia-card { transition: transform 0.3s ease, box-shadow 0.3s ease; }
        .garanzia-card:hover { transform: translateY(-4px); }
        .garanzia-card-03:hover { transform: translateY(-6px); }
        .shine-text {
          background: linear-gradient(90deg, #F97415 0%, #fff 40%, #F97415 80%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: badge-shine 3s linear infinite;
        }
      `}</style>

      {/* Top gradient line */}
      <div className="absolute top-0 left-0 right-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent 0%, rgba(249,116,21,0.9) 35%, rgba(249,116,21,1) 50%, rgba(249,116,21,0.9) 65%, transparent 100%)" }} />

      {/* Background glow orbs */}
      <div className="absolute top-[-80px] left-[-100px] w-[500px] h-[500px] rounded-full blur-[180px] pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(249,116,21,0.12) 0%, transparent 70%)", animation: "glow-pulse 5s ease-in-out infinite" }} />
      <div className="absolute bottom-[-80px] right-[-80px] w-[400px] h-[400px] rounded-full blur-[160px] pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(74,222,128,0.08) 0%, transparent 70%)", animation: "glow-pulse 7s ease-in-out infinite 1s" }} />

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-20 md:py-32">

        {/* ── HEADER ── */}
        <div ref={ref as React.RefObject<HTMLDivElement>}
          className={`text-center mb-16 transition-all duration-1000 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"}`}>

          {/* Badge */}
          <div className="inline-flex items-center gap-2 mb-6 px-5 py-2 rounded-full border border-green-400/30 bg-green-400/10">
            <ShieldCheck className="w-4 h-4 text-green-400" />
            <span className="text-green-400 text-xs font-bold uppercase tracking-[0.2em]">
              Garanzie — senza asterischi
            </span>
          </div>

          {/* Headline */}
          <h2 className="text-4xl sm:text-6xl md:text-7xl font-black text-white leading-[0.9] mb-5 tracking-tight">
            Il rischio<br />
            <span className="shine-text">è nostro.</span>
          </h2>
          <p className="text-3xl sm:text-4xl font-black text-white/20 mb-6 tracking-tight">Non tuo.</p>
          <p className="text-white/50 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
            Puoi provare Edilizia in Cloud senza mettere soldi sul tavolo.<br className="hidden md:block" />
            <span className="text-white/70 font-semibold">Se non funziona per te, esci. Punto.</span>
          </p>
        </div>

        {/* ── CARDS GRID ── */}
        <div className="grid md:grid-cols-2 gap-5 mb-6">

          {/* G1 + G2 */}
          {GARANZIE.slice(0, 2).map((g, i) => (
            <div
              key={i}
              className={`garanzia-card relative rounded-3xl border ${g.borderColor} bg-white/[0.03] backdrop-blur-sm overflow-hidden
                transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
              style={{
                transitionDelay: `${200 + i * 120}ms`,
                boxShadow: isVisible ? `0 0 40px 0 ${g.glowColor}` : "none",
              }}
            >
              {/* Decorative number */}
              <span className="absolute top-4 right-5 text-[80px] font-black text-white/[0.04] leading-none select-none pointer-events-none">
                {g.num}
              </span>

              <div className="p-7 md:p-8">
                {/* Header */}
                <div className="flex items-start gap-4 mb-6">
                  <div className={`w-14 h-14 rounded-2xl ${g.circleBg} flex items-center justify-center text-2xl flex-shrink-0 shadow-inner`}>
                    {g.emoji}
                  </div>
                  <div>
                    <span className={`inline-block px-2.5 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-[0.2em] mb-2 ${g.badgeBg} ${g.labelColor}`}>
                      {g.label}
                    </span>
                    <h3 className="text-white font-extrabold text-xl leading-tight">{g.title}</h3>
                    <p className={`text-sm font-semibold mt-0.5 ${g.labelColor}`}>{g.tagline}</p>
                  </div>
                </div>

                {/* Divider */}
                <div className={`h-px mb-5 ${g.borderColor.replace("border-", "bg-").replace("[#F97415]", "[#F97415]")}`}
                  style={{ opacity: 0.2 }} />

                {/* Content */}
                <div className="space-y-2">
                  {g.lines.map((line, j) => (
                    <p key={j} className={line.bold ? "text-white font-semibold text-sm" : "text-white/50 text-sm leading-relaxed"}>
                      {line.text}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* G3 — HERO CARD — full width */}
        <div
          className={`garanzia-card-03 relative rounded-3xl border-2 ${GARANZIE[2].borderColor} overflow-hidden mb-5
            transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
          style={{
            transitionDelay: "440ms",
            background: "linear-gradient(135deg, rgba(249,116,21,0.08) 0%, rgba(249,116,21,0.03) 40%, rgba(0,0,0,0) 100%)",
            boxShadow: isVisible ? "0 0 80px 0 rgba(249,116,21,0.18), inset 0 1px 0 rgba(249,116,21,0.1)" : "none",
          }}
        >
          {/* Hero badge */}
          <div className="absolute top-5 right-5 px-3 py-1 bg-[#F97415] text-white text-[10px] font-black uppercase tracking-widest rounded-full shadow-lg shadow-[#F97415]/30">
            ★ La più forte
          </div>

          {/* Decorative number */}
          <span className="absolute bottom-0 right-8 text-[140px] font-black text-[#F97415]/[0.06] leading-none select-none pointer-events-none">
            03
          </span>

          <div className="p-7 md:p-10 md:grid md:grid-cols-5 md:gap-8 md:items-start">
            {/* Left col */}
            <div className="md:col-span-2 mb-6 md:mb-0">
              <div className="flex items-center gap-4 mb-5">
                <div className="w-16 h-16 rounded-2xl bg-[#F97415]/20 flex items-center justify-center text-3xl flex-shrink-0"
                  style={{ boxShadow: "0 0 30px rgba(249,116,21,0.3)" }}>
                  🎯
                </div>
                <div>
                  <span className="inline-block px-2.5 py-0.5 rounded-full border border-[#F97415]/30 bg-[#F97415]/10 text-[#F97415] text-[10px] font-black uppercase tracking-[0.2em] mb-1.5">
                    Garanzia 3
                  </span>
                  <h3 className="text-white font-extrabold text-2xl leading-tight">Risultato 60 Giorni</h3>
                </div>
              </div>
              <p className="text-[#F97415] font-bold text-base leading-snug">
                O ti rimborsiamo ogni centesimo.<br />Senza discussioni.
              </p>
              <div className="mt-5 p-4 rounded-xl bg-[#F97415]/10 border border-[#F97415]/20">
                <p className="text-[#F97415] font-black text-3xl">60</p>
                <p className="text-white/50 text-xs uppercase tracking-widest">giorni per vedere i risultati</p>
              </div>
            </div>

            {/* Right col */}
            <div className="md:col-span-3">
              <p className="text-white font-bold text-base mb-4">Entro 60 giorni sai esattamente:</p>
              <div className="space-y-3">
                {GARANZIE[2].lines.slice(1, 6).map((line, j) => (
                  <div key={j} className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-[#F97415]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-[#F97415] text-xs font-black">✓</span>
                    </span>
                    <p className="text-white/70 text-sm leading-relaxed">{line.text.replace("→ ", "")}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 p-4 rounded-xl bg-white/[0.03] border border-white/10">
                <p className="text-white font-semibold text-sm leading-relaxed">
                  {GARANZIE[2].lines[6].text}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* G4 — full width */}
        <div
          className={`garanzia-card relative rounded-3xl border ${GARANZIE[3].borderColor} bg-white/[0.03] backdrop-blur-sm overflow-hidden mb-12
            transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
          style={{
            transitionDelay: "560ms",
            boxShadow: isVisible ? `0 0 40px 0 ${GARANZIE[3].glowColor}` : "none",
          }}
        >
          <span className="absolute top-4 right-5 text-[80px] font-black text-white/[0.04] leading-none select-none pointer-events-none">04</span>
          <div className="p-7 md:p-8 md:grid md:grid-cols-3 md:gap-8 md:items-center">
            {/* Left */}
            <div className="flex items-start gap-4 mb-5 md:mb-0">
              <div className="w-14 h-14 rounded-2xl bg-purple-400/20 flex items-center justify-center text-2xl flex-shrink-0">🔄</div>
              <div>
                <span className="inline-block px-2.5 py-0.5 rounded-full border border-purple-400/30 bg-purple-400/10 text-purple-400 text-[10px] font-black uppercase tracking-[0.2em] mb-2">
                  Garanzia 4
                </span>
                <h3 className="text-white font-extrabold text-xl">Rottamazione</h3>
                <p className="text-purple-400 font-semibold text-sm mt-0.5">Cambi. Non perdi niente.</p>
              </div>
            </div>
            {/* Center */}
            <div className="md:col-span-2 space-y-2">
              {GARANZIE[3].lines.map((line, j) => (
                <p key={j} className={line.bold ? "text-white font-semibold text-sm" : "text-white/50 text-sm leading-relaxed"}>
                  {line.text}
                </p>
              ))}
            </div>
          </div>
        </div>

        {/* ── CTA ── */}
        <div className={`text-center transition-all duration-700 delay-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <div className="inline-flex items-center gap-2 mb-5 px-4 py-2 rounded-full border border-[#F97415]/30 bg-[#F97415]/10">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-ping" />
            <p className="text-[#F97415] text-sm font-bold">
              31 giorni gratis + onboarding dedicato — nessuna carta di credito
            </p>
          </div>
          <div>
            <Link
              to="/demo"
              className="inline-flex items-center gap-3 px-10 py-5 rounded-2xl bg-[#F97415] text-white font-black text-lg hover:bg-[#e8650e] hover:scale-105 transition-all shadow-2xl shadow-[#F97415]/40"
            >
              Inizia la prova gratuita <ArrowRight size={20} />
            </Link>
          </div>
          <p className="text-white/25 text-sm mt-4">
            Nessun contratto · Nessuna carta di credito · Cancelli quando vuoi — senza spiegazioni
          </p>
        </div>

      </div>

      {/* Bottom gradient line */}
      <div className="absolute bottom-0 left-0 right-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent 0%, rgba(249,116,21,0.4) 40%, rgba(249,116,21,0.6) 50%, rgba(249,116,21,0.4) 60%, transparent 100%)" }} />
    </section>
  );
}

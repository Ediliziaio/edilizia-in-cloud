import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Building2, Shield, Clock, Star, ArrowRight } from "lucide-react";
import { useState, useEffect } from "react";

const OFFER_DURATION_SECONDS = 23 * 3600 + 47 * 60 + 12; // 23h 47m 12s

function useCountdown(seconds: number) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const hh = String(Math.floor(remaining / 3600)).padStart(2, "0");
  const mm = String(Math.floor((remaining % 3600) / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  return { hh, mm, ss };
}

// Icone edilizia floating
const ctaIcons = [
  { path: "M6 22h20v2a1 1 0 01-1 1H7a1 1 0 01-1-1v-2zM6 22v-1a10 10 0 0120 0v1M16 8v4M11 10a6 6 0 0110 0M4 22h24", label: "caschetto", top: "12%", left: "5%",  size: 32, delay: "0s",   dur: "7s",  op: 0.22, rot: -8 },
  { path: "M4 4h24v24H4zM16 4v24M4 16h24M8 8v4M24 8v4M8 20v4M24 20v4", label: "infisso", top: "70%", left: "8%",  size: 28, delay: "2s",   dur: "8.5s", op: 0.18, rot: 6 },
  { path: "M2 8h28v16H2zM11 8v16M21 8v16M2 13h28M2 19h28M13 28h6M16 24v4", label: "fotovoltaico", top: "20%", right: "6%", size: 30, delay: "0.8s", dur: "6.5s", op: 0.20, rot: 10 },
  { path: "M4 13L16 3l12 10v16H4zM12 29V19h8v10M20 9l3 2.5M22 6v5M19 7h5", label: "casa", top: "75%", right: "10%",size: 26, delay: "2.5s", dur: "9s",   op: 0.16, rot: -5 },
  { path: "M10 28V6M10 6h16M26 6v10M26 16l-4 4M21 16H10M18 20v4M7 26h6M10 8l3 2M10 11l3 2M10 14l3 2", label: "gru", top: "8%",  left: "40%", size: 30, delay: "3.2s", dur: "7.5s", op: 0.14, rot: 0 },
  { path: "M2 5h10v6H2zM16 5h14v6H16zM2 14h14v6H2zM20 14h10v6H20zM2 23h10v6H2zM16 23h14v6H16z", label: "muro", top: "85%", left: "48%", size: 24, delay: "1.2s", dur: "6s",   op: 0.15, rot: 0 },
  { path: "M20 4a6 6 0 00-5.66 8L4 22.3 5.7 28l5.7-1.7L21 16.66A6 6 0 0020 4zM21 9a2 2 0 11-4 0 2 2 0 014 0z", label: "chiave", top: "40%", right: "22%",size: 24, delay: "4s",   dur: "8s",   op: 0.16, rot: 15 },
  { path: "M2 11h28v10H2zM7 11v4M12 11v6M17 11v4M22 11v6M27 11v4", label: "metro", top: "55%", left: "18%", size: 26, delay: "1.8s", dur: "7s",   op: 0.14, rot: -8 },
];

export default function FinalCtaSection() {
  const { ref, isVisible } = useScrollAnimation();
  const { hh, mm, ss } = useCountdown(OFFER_DURATION_SECONDS);

  return (
    <section
      id="cta-finale"
      className="py-16 md:py-32 relative overflow-hidden"
      style={{ background: "#0a0a0a" }}
    >
      {/* Bordo top luminoso */}
      <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
        style={{ background: "linear-gradient(90deg, transparent 0%, rgba(249,116,21,0.6) 40%, rgba(249,116,21,1) 50%, rgba(249,116,21,0.6) 60%, transparent 100%)" }} />

      {/* Icone edilizia floating */}
      {ctaIcons.map((p, i) => (
        <div
          key={i}
          className="absolute pointer-events-none animate-float hidden md:block"
          style={{
            top: p.top, left: (p as any).left, right: (p as any).right,
            width: p.size, height: p.size,
            color: "#F97415",
            opacity: p.op,
            animationDelay: p.delay,
            animationDuration: p.dur,
            transform: `rotate(${p.rot}deg)`,
            filter: `drop-shadow(0 0 ${Math.round(p.size / 4)}px rgba(249,116,21,0.5))`,
          }}
        >
          <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d={p.path} />
          </svg>
        </div>
      ))}

      {/* Glow orbs */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[700px] h-[250px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse at bottom, rgba(249,116,21,0.22) 0%, transparent 65%)", filter: "blur(40px)" }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] rounded-full blur-[130px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse, rgba(249,116,21,0.12) 0%, transparent 65%)" }} />
      <div className="absolute top-0 left-0 w-[400px] h-[400px] rounded-full blur-[150px] pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(249,116,21,0.10) 0%, transparent 65%)" }} />

      <div ref={ref} className="max-w-4xl mx-auto px-6 text-center relative z-10">

        {/* Headline */}
        <h2
          className={`text-4xl md:text-5xl lg:text-6xl font-extrabold text-white mb-5 leading-tight transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Pronto a smettere di lavorare{" "}
          <span className="text-[#F97415]">a sensazione?</span>
        </h2>
        <p
          className={`text-white/50 text-lg mb-10 max-w-2xl mx-auto transition-all duration-700 delay-150 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Unisciti alle 150+ imprese edili italiane che controllano i numeri ogni giorno.
        </p>

        {/* Countdown */}
        <div
          className={`inline-flex items-center gap-3 mb-10 transition-all duration-700 delay-200 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <span className="text-white/70 text-sm font-medium">Offerta valida ancora per:</span>
          <div className="flex items-center gap-1.5">
            {[hh, mm, ss].map((unit, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center w-12 h-10 rounded-lg bg-[#F97415]/10 border border-[#F97415]/20 text-[#F97415] font-mono font-bold text-lg">
                  {unit}
                </span>
                {i < 2 && <span className="text-[#F97415]/60 font-bold text-lg">:</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Central box */}
        <div
          className={`border border-[#F97415]/40 rounded-2xl md:rounded-3xl p-6 md:p-12 bg-[#F97415]/5 backdrop-blur max-w-3xl mx-auto transition-all duration-700 delay-300 ${
            isVisible ? "opacity-100 scale-100" : "opacity-0 scale-95"
          }`}
        >
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-2xl bg-[#F97415]/15 border border-[#F97415]/30 flex items-center justify-center animate-pulse-glow">
              <Building2 className="w-10 h-10 text-[#F97415]" />
            </div>
          </div>

          <p className="text-white/60 text-base mb-8 font-medium">
            Demo gratuita. Setup in 48h. Nessun impegno.
          </p>

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-10">
            <a
              href="https://calendly.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-6 md:px-8 py-3 md:py-4 rounded-xl bg-[#C94F06] hover:bg-[#A84305] text-white font-bold text-base md:text-lg hover:scale-105 transition-all duration-300 shadow-lg shadow-[#C94F06]/30"
            >
              Richiedi Demo Gratuita
              <ArrowRight className="w-5 h-5" />
            </a>
            <a
              href="#prezzi"
              onClick={(e) => {
                e.preventDefault();
                document.querySelector("#prezzi")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="inline-flex items-center justify-center gap-2 px-6 md:px-8 py-3 md:py-4 rounded-xl border border-white/20 text-white font-bold text-base md:text-lg hover:border-white/40 hover:bg-white/5 hover:scale-105 transition-all duration-300"
            >
              Vedi i Prezzi
            </a>
          </div>

          {/* Micro-promises */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-5 text-white/70 text-sm">
            <span className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#F97415]" />
              Dati al sicuro
            </span>
            <span className="hidden sm:block w-1 h-1 rounded-full bg-white/20" />
            <span className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#F97415]" />
              Risposta entro 24h
            </span>
            <span className="hidden sm:block w-1 h-1 rounded-full bg-white/20" />
            <span className="flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
              4.9/5 stelle
            </span>
          </div>
        </div>

        {/* PS notes */}
        <div
          className={`mt-14 space-y-5 text-left max-w-xl mx-auto transition-all duration-700 delay-500 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <p className="text-white/35 text-sm leading-relaxed">
            <strong className="text-white/55">P.S.</strong> Se stai leggendo fin qui, sai già che qualcosa deve cambiare. L'istinto ti ha portato dove sei oggi, ma non ti porterà dove vuoi essere domani. I numeri sì.
          </p>
          <p className="text-white/35 text-sm leading-relaxed">
            <strong className="text-white/55">P.P.S.</strong> Su un fatturato di 500.000€, anche solo il 5% di margine perso sono 2.083€/mese che stai regalando. Ogni mese senza controllo è un mese in perdita.
          </p>
          <p className="text-white/35 text-sm leading-relaxed">
            <strong className="text-white/55">P.P.P.S.</strong> 15 minuti di demo gratuita per vedere se fa per te. Zero rischi. Zero impegni. Solo chiarezza.
          </p>
        </div>
      </div>
    </section>
  );
}

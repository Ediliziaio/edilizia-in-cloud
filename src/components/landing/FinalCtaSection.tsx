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

// Decorative floating particle positions (pure CSS, no lib)
const particles = [
  { top: "8%",  left: "5%",  size: 80,  delay: "0s",   duration: "7s"  },
  { top: "15%", left: "85%", size: 120, delay: "1.5s",  duration: "9s"  },
  { top: "65%", left: "10%", size: 60,  delay: "0.8s",  duration: "6s"  },
  { top: "75%", left: "78%", size: 90,  delay: "2s",    duration: "8s"  },
  { top: "40%", left: "92%", size: 50,  delay: "3s",    duration: "10s" },
  { top: "88%", left: "48%", size: 70,  delay: "1s",    duration: "7s"  },
];

export default function FinalCtaSection() {
  const { ref, isVisible } = useScrollAnimation();
  const { hh, mm, ss } = useCountdown(OFFER_DURATION_SECONDS);

  return (
    <section
      id="cta-finale"
      className="py-24 md:py-32 relative overflow-hidden"
      style={{ background: "#0a0f1e" }}
    >
      {/* Floating particles */}
      {particles.map((p, i) => (
        <div
          key={i}
          className="absolute rounded-full pointer-events-none"
          style={{
            top: p.top,
            left: p.left,
            width: p.size,
            height: p.size,
            background: "radial-gradient(circle, rgba(15,166,140,0.06) 0%, transparent 70%)",
            animation: `float ${p.duration} ease-in-out infinite`,
            animationDelay: p.delay,
          }}
        />
      ))}

      {/* Main glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-[#0fa68c]/[0.04] rounded-full blur-[100px] pointer-events-none" />

      <div ref={ref} className="max-w-4xl mx-auto px-6 text-center relative z-10">

        {/* Headline */}
        <h2
          className={`text-4xl md:text-5xl lg:text-6xl font-extrabold text-white mb-5 leading-tight transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Pronto a smettere di lavorare{" "}
          <span className="text-[#0fa68c]">a sensazione?</span>
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
          <span className="text-white/40 text-sm font-medium">Offerta valida ancora per:</span>
          <div className="flex items-center gap-1.5">
            {[hh, mm, ss].map((unit, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center w-12 h-10 rounded-lg bg-[#0fa68c]/10 border border-[#0fa68c]/20 text-[#0fa68c] font-mono font-bold text-lg">
                  {unit}
                </span>
                {i < 2 && <span className="text-[#0fa68c]/60 font-bold text-lg">:</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Central box */}
        <div
          className={`border border-[#0fa68c]/40 rounded-3xl p-10 md:p-12 bg-[#0fa68c]/5 backdrop-blur max-w-3xl mx-auto transition-all duration-700 delay-300 ${
            isVisible ? "opacity-100 scale-100" : "opacity-0 scale-95"
          }`}
        >
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-2xl bg-[#0fa68c]/15 border border-[#0fa68c]/30 flex items-center justify-center animate-pulse-glow">
              <Building2 className="w-10 h-10 text-[#0fa68c]" />
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
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-[#0fa68c] hover:bg-[#0d9079] text-white font-bold text-lg hover:scale-105 transition-all duration-300 shadow-lg shadow-[#0fa68c]/30"
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
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl border border-white/20 text-white font-bold text-lg hover:border-white/40 hover:bg-white/5 hover:scale-105 transition-all duration-300"
            >
              Vedi i Prezzi
            </a>
          </div>

          {/* Micro-promises */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-5 text-white/40 text-sm">
            <span className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#0fa68c]" />
              Dati al sicuro
            </span>
            <span className="hidden sm:block w-1 h-1 rounded-full bg-white/20" />
            <span className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#0fa68c]" />
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

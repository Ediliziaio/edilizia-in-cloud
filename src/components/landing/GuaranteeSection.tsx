import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { ShieldCheck, Check, ArrowRight } from "lucide-react";

const guaranteePoints = [
  "Identifica dove perdi margine nei tuoi cantieri",
  "Setup completo e supporto dedicato inclusi",
  "Rimborso totale, zero domande, zero complicazioni",
];

export default function GuaranteeSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="py-24 md:py-32 bg-[#1a2744] relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#0fa68c]/[0.08] rounded-full blur-[150px] animate-pulse" />

      <div ref={ref} className="max-w-3xl mx-auto px-6 relative z-10">
        <div
          className={`relative p-1 rounded-3xl transition-all duration-700 ${
            isVisible ? "opacity-100 scale-100" : "opacity-0 scale-90"
          }`}
        >
          {/* Animated rotating border */}
          <div
            className="absolute inset-0 rounded-3xl"
            style={{
              background: "conic-gradient(from 0deg, #0fa68c, #0fa68c33, #0fa68c, #0fa68c33, #0fa68c)",
              animation: "rotateBorder 4s linear infinite",
            }}
          />
          
          {/* Inner card */}
          <div className="relative rounded-[22px] bg-[#1a2744] p-10 md:p-14 text-center overflow-hidden">
            {/* Shimmer overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#0fa68c]/[0.04] to-transparent animate-shimmer" style={{ backgroundSize: "200% 100%" }} />

            <div className="relative z-10">
              {/* Seal with concentric rings */}
              <div className="relative mx-auto w-28 h-28 mb-8">
                <div className="absolute inset-0 rounded-full border-2 border-[#0fa68c]/20 animate-ping" style={{ animationDuration: "3s" }} />
                <div className="absolute inset-2 rounded-full border border-[#0fa68c]/30" />
                <div className="absolute inset-4 rounded-full border border-[#0fa68c]/40" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-[#0fa68c]/20 flex items-center justify-center">
                    <ShieldCheck className="w-9 h-9 text-[#0fa68c] drop-shadow-[0_0_15px_rgba(15,166,140,0.5)]" />
                  </div>
                </div>
              </div>

              {/* Badge 30 giorni */}
              <div className="inline-flex items-center gap-2 mb-6">
                <span
                  className="relative inline-flex items-center justify-center px-6 py-2 rounded-full text-sm font-bold text-[#0fa68c] overflow-hidden"
                >
                  <span
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: "conic-gradient(from 0deg, #0fa68c, transparent, #0fa68c, transparent, #0fa68c)",
                      animation: "rotateBorder 3s linear infinite",
                    }}
                  />
                  <span className="absolute inset-[1px] rounded-full bg-[#1a2744]" />
                  <span className="relative">⏱ 30 GIORNI</span>
                </span>
              </div>

              <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-3">
                Garanzia "Margine o Rimborsato"
              </h2>
              <p className="text-white/50 mb-8 max-w-lg mx-auto">
                Se nei primi 30 giorni non riesci a identificare almeno UN'area dove stai perdendo margine,
                ti restituiamo l'intero importo.
              </p>

              {/* Bullet points */}
              <div className="space-y-3 max-w-md mx-auto mb-10 text-left">
                {guaranteePoints.map((point, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-3 transition-all duration-500 ${
                      isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-6"
                    }`}
                    style={{ transitionDelay: isVisible ? `${400 + i * 150}ms` : "0ms" }}
                  >
                    <div className="w-6 h-6 rounded-full bg-[#0fa68c]/20 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3.5 h-3.5 text-[#0fa68c]" />
                    </div>
                    <span className="text-white/70 text-sm">{point}</span>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <a
                href="#prezzi"
                className={`inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-[#0fa68c] hover:bg-[#0d9179] text-white font-bold text-lg shadow-lg shadow-[#0fa68c]/25 hover:shadow-[#0fa68c]/40 transition-all duration-300 hover:scale-105 ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}
                style={{ transitionDelay: isVisible ? "800ms" : "0ms" }}
              >
                Prova Senza Rischi
                <ArrowRight className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Keyframe for rotating border */}
      <style>{`
        @keyframes rotateBorder {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </section>
  );
}

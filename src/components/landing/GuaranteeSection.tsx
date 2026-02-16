import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { ShieldCheck, Wrench, TrendingUp, Check, ArrowRight } from "lucide-react";

const guarantees = [
  {
    icon: ShieldCheck,
    title: 'Margine o Rimborsato',
    days: "30",
    description: "Se nei primi 30 giorni non identifichi almeno un'area dove perdi margine, rimborso totale senza domande.",
    points: [
      "Identifica dove perdi margine nei tuoi cantieri",
      "Setup completo e supporto dedicato inclusi",
      "Rimborso totale, zero complicazioni",
    ],
  },
  {
    icon: Wrench,
    title: 'Setup Garantito',
    days: "60",
    description: "Se in 60 giorni il tuo team non è operativo sulla piattaforma, ti estendiamo gratis fino a quando non lo sei.",
    points: [
      "Onboarding guidato passo-passo",
      "Formazione inclusa per tutto il team",
      "Estensione gratuita senza limiti",
    ],
  },
  {
    icon: TrendingUp,
    title: 'ROI Garantito',
    days: "90",
    description: "Se in 90 giorni non hai recuperato almeno 3x il costo dell'abbonamento, ti rimborsiamo la differenza.",
    points: [
      "Tracciamento ROI integrato nella dashboard",
      "Report automatici di efficienza",
      "Rimborso proporzionale garantito",
    ],
  },
];

export default function GuaranteeSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="py-24 md:py-32 bg-[#1a2744] relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#0fa68c]/[0.08] rounded-full blur-[150px] animate-pulse" />

      <div ref={ref} className="max-w-5xl mx-auto px-6 relative z-10">
        <h2
          className={`text-3xl md:text-5xl font-extrabold text-white text-center mb-3 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          3 Garanzie. <span className="text-[#0fa68c]">Zero Rischi.</span>
        </h2>
        <p
          className={`text-white/50 text-center mb-14 text-lg transition-all duration-700 delay-150 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Non ti chiediamo di fidarti. Ti chiediamo di provare.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {guarantees.map((g, i) => {
            const Icon = g.icon;
            return (
              <div
                key={i}
                className={`relative p-[2px] rounded-3xl transition-all duration-700 ${
                  isVisible ? "opacity-100 scale-100" : "opacity-0 scale-90"
                }`}
                style={{ transitionDelay: isVisible ? `${300 + i * 150}ms` : "0ms" }}
              >
                {/* Rotating border */}
                <div
                  className="absolute inset-0 rounded-3xl"
                  style={{
                    background: "conic-gradient(from 0deg, #0fa68c, #0fa68c33, #0fa68c, #0fa68c33, #0fa68c)",
                    animation: `rotateBorder ${4 + i}s linear infinite`,
                  }}
                />

                <div className="relative rounded-[22px] bg-[#1a2744] p-8 text-center h-full flex flex-col">
                  {/* Badge */}
                  <span className="relative inline-flex items-center justify-center px-5 py-1.5 rounded-full text-xs font-bold text-[#0fa68c] mx-auto mb-6 overflow-hidden">
                    <span
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: "conic-gradient(from 0deg, #0fa68c, transparent, #0fa68c, transparent, #0fa68c)",
                        animation: `rotateBorder 3s linear infinite`,
                      }}
                    />
                    <span className="absolute inset-[1px] rounded-full bg-[#1a2744]" />
                    <span className="relative">⏱ {g.days} GIORNI</span>
                  </span>

                  {/* Icon with rings */}
                  <div className="relative mx-auto w-20 h-20 mb-6">
                    <div className="absolute inset-0 rounded-full border border-[#0fa68c]/20" />
                    <div className="absolute inset-2 rounded-full border border-[#0fa68c]/30" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-[#0fa68c]/20 flex items-center justify-center">
                        <Icon className="w-6 h-6 text-[#0fa68c] drop-shadow-[0_0_10px_rgba(15,166,140,0.5)]" />
                      </div>
                    </div>
                  </div>

                  <h3 className="text-xl font-bold text-white mb-3">"{g.title}"</h3>
                  <p className="text-white/50 text-sm mb-6 leading-relaxed">{g.description}</p>

                  <div className="space-y-2.5 text-left mt-auto">
                    {g.points.map((point, j) => (
                      <div key={j} className="flex items-center gap-2.5">
                        <div className="w-5 h-5 rounded-full bg-[#0fa68c]/20 flex items-center justify-center flex-shrink-0">
                          <Check className="w-3 h-3 text-[#0fa68c]" />
                        </div>
                        <span className="text-white/70 text-xs">{point}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div
          className={`text-center transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
          style={{ transitionDelay: isVisible ? "900ms" : "0ms" }}
        >
          <a
            href="#cta-finale"
            onClick={(e) => { e.preventDefault(); document.querySelector("#cta-finale")?.scrollIntoView({ behavior: "smooth" }); }}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-[#0fa68c] hover:bg-[#0d9179] text-white font-bold text-lg shadow-lg shadow-[#0fa68c]/25 hover:shadow-[#0fa68c]/40 transition-all duration-300 hover:scale-105"
          >
            Prova Senza Rischi
            <ArrowRight className="w-5 h-5" />
          </a>
        </div>
      </div>

      <style>{`
        @keyframes rotateBorder {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </section>
  );
}

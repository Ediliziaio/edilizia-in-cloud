import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { ShieldCheck, Check } from "lucide-react";

const points = [
  "Setup e onboarding inclusi",
  "Nessuna domanda al rimborso",
  "Garanzia scritta e firmata dal founder",
];

export default function GuaranteeSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="py-16 md:py-24 bg-white relative overflow-hidden">
      {/* subtle glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(249,116,21,0.08) 0%, transparent 70%)",
        }}
      />

      <div ref={ref} className="relative z-10 max-w-6xl mx-auto px-6">
        <div
          className={`max-w-4xl mx-auto rounded-3xl border-2 border-[#F97415]/30 bg-gradient-to-br from-white to-[#F97415]/5 p-8 md:p-14 shadow-xl transition-all duration-700 ${
            isVisible ? "opacity-100 scale-100" : "opacity-0 scale-95"
          }`}
        >
          <div className="grid md:grid-cols-[auto_1fr] gap-8 md:gap-12 items-center">
            {/* Circular badge */}
            <div className="flex justify-center md:justify-start">
              <div
                className={`relative w-44 h-44 md:w-52 md:h-52 rounded-full bg-[#F97415] text-white flex flex-col items-center justify-center shadow-2xl shadow-[#F97415]/40 transition-all duration-700 delay-200 ${
                  isVisible ? "opacity-100 rotate-0" : "opacity-0 -rotate-12"
                }`}
              >
                <ShieldCheck className="w-10 h-10 md:w-12 md:h-12 mb-2" strokeWidth={2.2} />
                <p className="text-center text-[11px] md:text-xs font-extrabold leading-tight uppercase tracking-wide px-4">
                  100%
                  <br />
                  Soddisfatti
                  <br />o Rimborsati
                </p>
                {/* dotted ring */}
                <span
                  className="absolute inset-0 rounded-full border-2 border-dashed border-white/40 animate-spin"
                  style={{ animationDuration: "20s" }}
                />
              </div>
            </div>

            {/* Content */}
            <div>
              <span className="inline-block mb-4 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest text-[#C2410C] bg-[#F97415]/10 border border-[#F97415]/20">
                La nostra promessa
              </span>
              <h2 className="text-3xl md:text-5xl font-extrabold text-[#111111] leading-tight mb-5">
                Garanzia ROI <span className="text-[#F97415]">90 giorni</span>
              </h2>
              <p className="text-base md:text-lg text-gray-700 leading-relaxed mb-6">
                Se in <strong>90 giorni</strong> non identifichi almeno{" "}
                <strong className="text-[#F97415]">5.000€ di sprechi</strong> nella tua impresa edile,
                ti restituiamo <strong>TUTTO</strong>. Senza domande.
              </p>

              <ul className="space-y-2.5">
                {points.map((p, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <Check className="w-5 h-5 text-[#F97415] flex-shrink-0 mt-0.5" />
                    <span className="text-sm md:text-base text-gray-700 font-medium">{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

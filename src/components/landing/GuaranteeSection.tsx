import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { ShieldCheck } from "lucide-react";

export default function GuaranteeSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="py-24 md:py-32 bg-[#1a2744]">
      <div ref={ref} className="max-w-3xl mx-auto px-6">
        <div
          className={`relative p-10 md:p-14 rounded-3xl border-2 border-[#0fa68c]/30 bg-[#0fa68c]/[0.05] text-center overflow-hidden transition-all duration-700 ${
            isVisible ? "opacity-100 scale-100" : "opacity-0 scale-90"
          }`}
        >
          {/* Shimmer effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#0fa68c]/[0.05] to-transparent animate-shimmer" style={{ backgroundSize: "200% 100%" }} />

          <div className="relative z-10">
            <ShieldCheck className="w-16 h-16 text-[#0fa68c] mx-auto mb-6 drop-shadow-[0_0_20px_rgba(15,166,140,0.3)]" />
            <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
              Garanzia "Margine o Rimborsato"
            </h2>
            <p className="text-xl text-[#0fa68c] font-bold mb-6">30 Giorni</p>
            <p className="text-white/60 leading-relaxed max-w-xl mx-auto">
              Se nei primi 30 giorni non riesci a identificare almeno UN'area dove stai perdendo margine,
              ti restituiamo l'intero importo. Nessuna domanda.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

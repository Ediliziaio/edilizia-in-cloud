import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { ShieldCheck } from "lucide-react";

export default function GuaranteeSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="py-24 md:py-32 bg-[#0a0a0a]">
      <div ref={ref} className="max-w-3xl mx-auto px-6">
        <div
          className={`p-10 md:p-14 rounded-3xl border-2 border-[#c8ee44]/30 bg-[#c8ee44]/[0.04] text-center transition-all duration-700 ${
            isVisible ? "opacity-100 scale-100" : "opacity-0 scale-95"
          }`}
        >
          <ShieldCheck className="w-16 h-16 text-[#c8ee44] mx-auto mb-6" />
          <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
            Garanzia "Margine o Rimborsato"
          </h2>
          <p className="text-xl text-[#c8ee44] font-bold mb-6">30 Giorni</p>
          <p className="text-gray-300 leading-relaxed max-w-xl mx-auto">
            Prova Edilizia in Cloud per 30 giorni. Se non riesci a identificare almeno un'area
            dove stavi perdendo margine, ti rimborsiamo l'intero importo. Senza domande, senza complicazioni.
          </p>
        </div>
      </div>
    </section>
  );
}

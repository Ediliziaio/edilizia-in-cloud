import { useScrollAnimation } from "@/hooks/useScrollAnimation";

const comparisons = [
  { item: "Commercialista / Controller part-time", cost: "15.000 – 40.000 €/anno" },
  { item: "Software ERP tradizionale", cost: "20.000 – 80.000 €/anno" },
  { item: "Consulente gestionale", cost: "10.000 – 30.000 €/anno" },
];

export default function PricingSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section id="prezzi" className="py-24 md:py-32 bg-[#f8f9fa]">
      <div ref={ref} className="max-w-4xl mx-auto px-6">
        <h2
          className={`text-3xl md:text-5xl font-extrabold text-gray-900 text-center mb-4 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          L'Investimento <span className="text-[#7ab800]">(e Perché NON è un Costo)</span>
        </h2>
        <p
          className={`text-gray-500 text-center mb-14 text-lg transition-all duration-700 delay-150 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Confronta quanto spenderesti con le alternative tradizionali:
        </p>

        <div
          className={`space-y-4 mb-10 transition-all duration-700 delay-300 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          {comparisons.map((c, i) => (
            <div key={i} className="flex items-center justify-between p-5 rounded-xl bg-white border border-gray-200 shadow-sm">
              <span className="text-gray-700">{c.item}</span>
              <span className="text-red-500 font-semibold whitespace-nowrap">{c.cost}</span>
            </div>
          ))}

          <div className="relative flex items-center justify-between p-6 rounded-xl bg-white border-2 border-[#c8ee44] shadow-[0_4px_30px_rgba(200,238,68,0.15)]">
            <div className="absolute -top-3 left-6 px-3 py-0.5 bg-[#c8ee44] text-[#0a0a0a] text-xs font-bold rounded-full uppercase tracking-wide">
              Consigliato
            </div>
            <div>
              <span className="text-gray-900 font-bold text-lg">Edilizia in Cloud</span>
              <p className="text-gray-500 text-sm mt-1">Tutto incluso. 7 moduli. Supporto dedicato.</p>
            </div>
            <span className="text-[#7ab800] font-extrabold text-2xl whitespace-nowrap">da 99 €/mese</span>
          </div>
        </div>

        <div
          className={`text-center transition-all duration-700 delay-500 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <a
            href="#cta-finale"
            onClick={(e) => { e.preventDefault(); document.querySelector("#cta-finale")?.scrollIntoView({ behavior: "smooth" }); }}
            className="inline-block px-10 py-4 rounded-lg bg-[#c8ee44] text-[#0a0a0a] font-bold text-lg hover:bg-[#d4f55a] hover:scale-105 transition-all duration-200 shadow-[0_0_30px_rgba(200,238,68,0.3)]"
          >
            Scopri il Piano Perfetto per Te
          </a>
        </div>
      </div>
    </section>
  );
}

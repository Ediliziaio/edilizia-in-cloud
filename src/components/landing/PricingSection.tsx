import { useScrollAnimation } from "@/hooks/useScrollAnimation";

const comparisons = [
  { item: "Commercialista esterno per controllo di gestione", cost: "1.000 – 3.000 €/mese" },
  { item: "Controller interno", cost: "2.500 – 4.000 €/mese + contributi" },
  { item: "Gestionale generico ERP", cost: "5.000 – 20.000 € setup + canone" },
  { item: "Continuare senza controllo", cost: "20.000 – 100.000 €/anno in margini persi" },
];

export default function PricingSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section id="prezzi" className="py-24 md:py-32 bg-white">
      <div ref={ref} className="max-w-4xl mx-auto px-6">
        <h2
          className={`text-3xl md:text-5xl font-extrabold text-[#1a2744] text-center mb-4 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          L'Investimento <span className="text-[#0fa68c]">(e Perché NON è un Costo)</span>
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
            <div key={i} className="flex items-center justify-between p-5 rounded-2xl bg-[#f8f9fa] border border-gray-200">
              <span className="text-[#1a2744]/80">{c.item}</span>
              <span className="text-red-500 font-semibold whitespace-nowrap text-sm">{c.cost}</span>
            </div>
          ))}

          <div className="relative flex items-center justify-between p-6 rounded-2xl bg-white border-2 border-[#0fa68c] shadow-lg shadow-[#0fa68c]/10">
            <div className="absolute -top-3 left-6 px-4 py-1 bg-[#0fa68c] text-white text-xs font-bold rounded-full uppercase tracking-wide">
              Consigliato
            </div>
            <div>
              <span className="text-[#1a2744] font-bold text-lg">Edilizia in Cloud</span>
              <p className="text-gray-500 text-sm mt-1">Tutto incluso. 7 moduli. Supporto dedicato.</p>
            </div>
            <span className="text-[#0fa68c] font-extrabold text-2xl whitespace-nowrap">da 99 €/mese</span>
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
            className="inline-block px-10 py-4 rounded-full bg-[#0fa68c] text-white font-bold text-lg hover:bg-[#0d9079] hover:scale-105 transition-all duration-200 shadow-lg shadow-[#0fa68c]/20"
          >
            Scopri il Piano Perfetto per Te
          </a>
        </div>
      </div>
    </section>
  );
}

import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Check, X, ArrowRight } from "lucide-react";

const comparisons = [
  { item: "Commercialista esterno per controllo di gestione", cost: "1.000 – 3.000 €/mese" },
  { item: "Controller interno", cost: "2.500 – 4.000 €/mese + contributi" },
  { item: "Gestionale generico ERP", cost: "5.000 – 20.000 € setup + canone" },
  { item: "Continuare senza controllo", cost: "20.000 – 100.000 €/anno in margini persi" },
];

const plans = [
  {
    name: "Starter",
    price: "99",
    description: "Per imprese fino a 500K €",
    highlighted: false,
    cta: "Inizia Gratis",
    ctaStyle: "outline" as const,
    features: [
      { text: "Fino a 50 commesse", included: true },
      { text: "3 utenti", included: true },
      { text: "4 moduli base", included: true },
      { text: "Supporto email", included: true },
      { text: "Report base", included: true },
      { text: "Forecast", included: false },
      { text: "Magazzino", included: false },
      { text: "Report avanzati", included: false },
    ],
  },
  {
    name: "Professional",
    price: "199",
    description: "Per imprese da 500K a 2M €",
    highlighted: true,
    cta: "Scegli Professional",
    ctaStyle: "filled" as const,
    features: [
      { text: "Commesse illimitate", included: true },
      { text: "10 utenti", included: true },
      { text: "Tutti i 7 moduli", included: true },
      { text: "Supporto prioritario", included: true },
      { text: "Report avanzati", included: true },
      { text: "Forecast", included: true },
      { text: "Magazzino", included: true },
      { text: "API", included: false },
    ],
  },
  {
    name: "Enterprise",
    price: "399",
    description: "Per imprese oltre 2M €",
    highlighted: false,
    cta: "Contattaci",
    ctaStyle: "outline" as const,
    features: [
      { text: "Commesse illimitate", included: true },
      { text: "Utenti illimitati", included: true },
      { text: "Tutti i 7 moduli + API", included: true },
      { text: "Supporto dedicato", included: true },
      { text: "Report custom", included: true },
      { text: "Forecast", included: true },
      { text: "Magazzino", included: true },
      { text: "Onboarding dedicato", included: true },
    ],
  },
];

export default function PricingSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section id="prezzi" className="py-24 md:py-32 bg-white">
      <div ref={ref} className="max-w-6xl mx-auto px-6">
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

        {/* Comparison table */}
        <div
          className={`max-w-3xl mx-auto space-y-3 mb-16 transition-all duration-700 delay-300 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          {comparisons.map((c, i) => (
            <div key={i} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-0 p-4 rounded-2xl bg-[#f8f9fa] border border-gray-200">
              <span className="text-[#1a2744]/80 text-sm">{c.item}</span>
              <span className="text-red-500 font-semibold whitespace-nowrap text-sm">{c.cost}</span>
            </div>
          ))}
        </div>

        {/* 3 Plans */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
          {plans.map((plan, i) => {
            const delay = plan.highlighted ? 400 : i === 0 ? 550 : 700;
            return (
              <div
                key={plan.name}
                className={`relative rounded-2xl border p-5 md:p-8 transition-all duration-700 ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
                } ${
                  plan.highlighted
                    ? "border-[#0fa68c] border-2 shadow-lg shadow-[#0fa68c]/15 lg:scale-105 z-10 bg-white"
                    : "border-gray-200 bg-white"
                }`}
                style={{ transitionDelay: isVisible ? `${delay}ms` : "0ms" }}
              >
                {plan.highlighted && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-5 py-1.5 bg-[#0fa68c] text-white text-xs font-bold rounded-full uppercase tracking-wide">
                    Più Popolare
                  </div>
                )}

                <h3 className="text-xl font-bold text-[#1a2744] mb-1">{plan.name}</h3>
                <p className="text-gray-500 text-sm mb-5">{plan.description}</p>

                <div className="mb-6">
                  <span className="text-4xl font-extrabold text-[#1a2744]">{plan.price} €</span>
                  <span className="text-gray-400 text-sm">/mese</span>
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-center gap-2.5 text-sm">
                      {f.included ? (
                        <Check className="w-4 h-4 text-[#0fa68c] flex-shrink-0" />
                      ) : (
                        <X className="w-4 h-4 text-gray-300 flex-shrink-0" />
                      )}
                      <span className={f.included ? "text-[#1a2744]/80" : "text-gray-400"}>{f.text}</span>
                    </li>
                  ))}
                </ul>

                <a
                  href="#cta-finale"
                  onClick={(e) => { e.preventDefault(); document.querySelector("#cta-finale")?.scrollIntoView({ behavior: "smooth" }); }}
                  className={`block w-full text-center py-3.5 rounded-xl font-bold transition-all duration-200 hover:scale-105 ${
                    plan.ctaStyle === "filled"
                      ? "bg-[#0fa68c] text-white hover:bg-[#0d9079] shadow-lg shadow-[#0fa68c]/20"
                      : "border-2 border-[#1a2744] text-[#1a2744] hover:bg-[#1a2744] hover:text-white"
                  }`}
                >
                  {plan.cta}
                </a>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

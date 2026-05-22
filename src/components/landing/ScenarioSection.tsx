import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { XCircle, CheckCircle } from "lucide-react";

const scenarioA = [
  "Stessa fatica, stessi problemi, stessa ansia a fine mese",
  "Continui a non sapere il margine reale dei tuoi cantieri",
  "La cassa resta un'incognita fino all'ultimo giorno",
  "Accetti lavori in perdita per paura di restare fermo",
];

const scenarioB = [
  "Sai esattamente quanto guadagni su ogni singolo cantiere",
  "Previsione di cassa a 90 giorni, sempre aggiornata",
  "Costi sotto controllo: sai dove tagliare e dove investire",
  "Prendi decisioni basate sui numeri, non sull'ansia",
];

function ScenarioIllustrationA() {
  return (
    <picture>
      <source srcSet="/landing/scenario-without-control.avif" type="image/avif" />
      <source srcSet="/landing/scenario-without-control.webp" type="image/webp" />
      <img
        src="/landing/scenario-without-control.webp"
        alt="Scenario senza controllo: confusione, fatture e margini in perdita"
        width={1792}
        height={768}
        loading="lazy"
        decoding="async"
        className="mb-5 h-40 w-full rounded-xl border border-red-200 object-cover object-center shadow-sm"
      />
    </picture>
  );
}

function ScenarioIllustrationB() {
  return (
    <picture>
      <source srcSet="/landing/scenario-with-control.avif" type="image/avif" />
      <source srcSet="/landing/scenario-with-control.webp" type="image/webp" />
      <img
        src="/landing/scenario-with-control.webp"
        alt="Scenario con Edilizia in Cloud: controllo dei cantieri e numeri aggiornati"
        width={1792}
        height={768}
        loading="lazy"
        decoding="async"
        className="mb-5 h-40 w-full rounded-xl border border-[#F97415]/25 object-cover object-center shadow-sm"
      />
    </picture>
  );
}

export default function ScenarioSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="py-24 md:py-32 bg-white">
      <div ref={ref} className="max-w-5xl mx-auto px-6">
        <h2
          className={`text-3xl md:text-5xl font-extrabold text-[#111111] text-center mb-4 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Ogni Mese che Aspetti, <span className="text-red-500">Perdi Soldi</span>
        </h2>
        <p
          className={`text-gray-500 text-center mb-14 text-lg transition-all duration-700 delay-150 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Due scenari. Quale scegli?
        </p>

        <div className="grid md:grid-cols-2 gap-8">
          <div
            className={`p-5 md:p-8 rounded-2xl border-2 border-red-200 bg-red-50/50 transition-all duration-700 ${
              isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-16"
            }`}
          >
            <h3 className="text-xl font-bold text-[#111111] mb-4 flex items-center gap-2">
              <XCircle className="w-6 h-6 text-red-500" />
              Scenario A — Senza controllo
            </h3>
            <ScenarioIllustrationA />
            <ul className="space-y-4">
              {scenarioA.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-600 text-sm">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div
            className={`p-5 md:p-8 rounded-2xl border-2 border-[#F97415]/30 bg-[#F97415]/5 transition-all duration-700 delay-200 ${
              isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-16"
            }`}
          >
            <h3 className="text-xl font-bold text-[#111111] mb-4 flex items-center gap-2">
              <CheckCircle className="w-6 h-6 text-[#F97415]" />
              Scenario B — Con Edilizia in Cloud
            </h3>
            <ScenarioIllustrationB />
            <ul className="space-y-4">
              {scenarioB.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-[#F97415] flex-shrink-0 mt-0.5" />
                  <span className="text-gray-600 text-sm">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

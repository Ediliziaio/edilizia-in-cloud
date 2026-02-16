import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { XCircle, CheckCircle } from "lucide-react";
import AIImage from "./AIImage";

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

export default function ScenarioSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="py-24 md:py-32 bg-white">
      <div ref={ref} className="max-w-5xl mx-auto px-6">
        <h2
          className={`text-3xl md:text-5xl font-extrabold text-[#1a2744] text-center mb-4 transition-all duration-700 ${
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
            className={`p-8 rounded-2xl border-2 border-red-200 bg-red-50/50 transition-all duration-700 ${
              isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-16"
            }`}
          >
            <h3 className="text-xl font-bold text-[#1a2744] mb-4 flex items-center gap-2">
              <XCircle className="w-6 h-6 text-red-500" />
              Scenario A — Senza controllo
            </h3>
            <AIImage
              prompt="Imprenditore preoccupato con espressione ansiosa che guarda fogli con numeri in rosso e conti negativi, stile illustrazione minimalista flat, toni rossi e grigi, sfondo chiaro, formato orizzontale 16:9"
              alt="Scenario senza controllo"
              className="w-full h-40 object-cover mb-5"
            />
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
            className={`p-8 rounded-2xl border-2 border-[#0fa68c]/30 bg-[#0fa68c]/5 transition-all duration-700 delay-200 ${
              isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-16"
            }`}
          >
            <h3 className="text-xl font-bold text-[#1a2744] mb-4 flex items-center gap-2">
              <CheckCircle className="w-6 h-6 text-[#0fa68c]" />
              Scenario B — Con Edilizia in Cloud
            </h3>
            <AIImage
              prompt="Imprenditore soddisfatto e sorridente che guarda uno schermo con grafici in crescita verdi e dashboard positiva, stile illustrazione minimalista flat, toni verdi e teal, sfondo chiaro, formato orizzontale 16:9"
              alt="Scenario con Edilizia in Cloud"
              className="w-full h-40 object-cover mb-5"
            />
            <ul className="space-y-4">
              {scenarioB.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-[#0fa68c] flex-shrink-0 mt-0.5" />
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

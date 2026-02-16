import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { XCircle, CheckCircle, TrendingDown, TrendingUp, AlertTriangle, BarChart3 } from "lucide-react";

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
    <div className="w-full h-40 rounded-xl bg-red-100 border border-red-200 flex items-center justify-center gap-6 mb-5 overflow-hidden relative">
      <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 10px, currentColor 10px, currentColor 11px)" }} />
      <div className="flex flex-col items-center gap-1 z-10">
        <AlertTriangle className="w-8 h-8 text-red-400" />
        <span className="text-[10px] text-red-400 font-semibold">Rischi</span>
      </div>
      <div className="flex flex-col items-end gap-1 z-10">
        <div className="flex items-end gap-1 h-16">
          {[40, 32, 28, 18, 10].map((h, i) => (
            <div key={i} className="w-3 rounded-t bg-red-300/70" style={{ height: `${h}px` }} />
          ))}
        </div>
        <TrendingDown className="w-5 h-5 text-red-400" />
      </div>
      <div className="flex flex-col items-center gap-1 z-10">
        <XCircle className="w-8 h-8 text-red-400" />
        <span className="text-[10px] text-red-400 font-semibold">Perdite</span>
      </div>
    </div>
  );
}

function ScenarioIllustrationB() {
  return (
    <div className="w-full h-40 rounded-xl bg-[#0fa68c]/10 border border-[#0fa68c]/25 flex items-center justify-center gap-6 mb-5 overflow-hidden relative">
      <div className="flex flex-col items-center gap-1 z-10">
        <CheckCircle className="w-8 h-8 text-[#0fa68c]" />
        <span className="text-[10px] text-[#0fa68c] font-semibold">Controllo</span>
      </div>
      <div className="flex flex-col items-end gap-1 z-10">
        <div className="flex items-end gap-1 h-16">
          {[10, 18, 28, 36, 48].map((h, i) => (
            <div key={i} className="w-3 rounded-t bg-[#0fa68c]/60" style={{ height: `${h}px` }} />
          ))}
        </div>
        <TrendingUp className="w-5 h-5 text-[#0fa68c]" />
      </div>
      <div className="flex flex-col items-center gap-1 z-10">
        <BarChart3 className="w-8 h-8 text-[#0fa68c]" />
        <span className="text-[10px] text-[#0fa68c] font-semibold">Margini</span>
      </div>
    </div>
  );
}

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
            className={`p-5 md:p-8 rounded-2xl border-2 border-red-200 bg-red-50/50 transition-all duration-700 ${
              isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-16"
            }`}
          >
            <h3 className="text-xl font-bold text-[#1a2744] mb-4 flex items-center gap-2">
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
            className={`p-5 md:p-8 rounded-2xl border-2 border-[#0fa68c]/30 bg-[#0fa68c]/5 transition-all duration-700 delay-200 ${
              isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-16"
            }`}
          >
            <h3 className="text-xl font-bold text-[#1a2744] mb-4 flex items-center gap-2">
              <CheckCircle className="w-6 h-6 text-[#0fa68c]" />
              Scenario B — Con Edilizia in Cloud
            </h3>
            <ScenarioIllustrationB />
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

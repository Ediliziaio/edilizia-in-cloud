/**
 * BrainOnboardingTour — tour guidato al primo accesso al Cervello AI.
 *
 * 4 step di tooltip animati che spiegano in 30 secondi cosa stai vedendo
 * e come navigare. Persiste lo stato "completed" in localStorage così
 * non riappare. Skippabile in qualsiasi momento.
 */

import { useState, useEffect } from "react";
import { Brain, Network, MousePointerClick, Sparkles, X, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "eic_brain_tour_completed_v1";

interface TourStep {
  icon: typeof Brain;
  title: string;
  text: string;
}

const STEPS: TourStep[] = [
  {
    icon: Brain,
    title: "Benvenuto nel tuo Cervello AI",
    text: "Ogni cerchio è una persona AI specializzata. La loro dimensione mostra quante memorie hanno. Quante più ne ha, più sa di quella area.",
  },
  {
    icon: Network,
    title: "Le linee arancio sono ponti",
    text: "Quando due personas condividono informazioni (es. su un cliente), una linea arancio le collega. Più la linea è spessa, più informazioni hanno in comune.",
  },
  {
    icon: MousePointerClick,
    title: "Click per esplorare",
    text: "Clicca su una persona per vedere tutte le sue memorie con grafici e statistiche. \"Espandi tutto\" mostra ogni singola memoria come nodo.",
  },
  {
    icon: Sparkles,
    title: "Modalità Nucleo 3D",
    text: "Premi \"Nucleo 3D\" nella toolbar per la visione cosmica rotante. La tua azienda come una galassia di conoscenza che ruota.",
  },
];

export function BrainOnboardingTour() {
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    // Mostra solo al primo accesso
    try {
      const completed = localStorage.getItem(STORAGE_KEY);
      if (!completed) {
        // Delay piccolo per permettere al grafo di renderizzare prima
        const t = setTimeout(() => setStep(0), 1200);
        return () => clearTimeout(t);
      }
    } catch { /* ignore localStorage errors */ }
  }, []);

  const skip = () => {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
    setStep(null);
  };

  const next = () => {
    if (step === null) return;
    if (step >= STEPS.length - 1) skip();
    else setStep(step + 1);
  };

  if (step === null) return null;
  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <>
      {/* Backdrop overlay leggero */}
      <div
        className="absolute inset-0 z-40 bg-black/40 backdrop-blur-[1px] animate-in fade-in duration-300"
        onClick={skip}
      />

      {/* Card centrale animata */}
      <div className="absolute inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 pointer-events-auto animate-in zoom-in-95 fade-in duration-300">
          {/* Skip button */}
          <button
            onClick={skip}
            className="absolute top-3 right-3 text-slate-400 hover:text-slate-700 transition-colors"
            aria-label="Salta tour"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Icona grande */}
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/30 mb-3">
            <Icon className="h-6 w-6 text-white" />
          </div>

          {/* Title + text */}
          <h3 className="text-lg font-bold text-slate-900 mb-1.5">{current.title}</h3>
          <p className="text-sm text-slate-600 leading-relaxed">{current.text}</p>

          {/* Footer: step indicator + actions */}
          <div className="flex items-center justify-between mt-5 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-1">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === step ? "bg-orange-500 w-6" : i < step ? "bg-orange-200 w-1.5" : "bg-slate-200 w-1.5",
                  )}
                />
              ))}
              <span className="text-[10px] text-slate-400 ml-2">
                {step + 1} di {STEPS.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={skip}
                className="text-[11px] text-slate-500 hover:text-slate-700 transition-colors px-2 py-1"
              >
                Salta
              </button>
              <button
                onClick={next}
                className="text-[11px] font-semibold text-white bg-orange-500 hover:bg-orange-600 px-3 py-1.5 rounded-md flex items-center gap-1 shadow-sm transition-colors"
              >
                {isLast ? "Inizia" : "Avanti"}
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

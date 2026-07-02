/**
 * AIExtractionProgress — loader a step animati per l'estrazione AI del
 * preventivo (foto/audio/testo). Sostituisce lo spinner nudo con una
 * timeline verticale: lo step attivo è in evidenza (scala piena + ombra),
 * i vicini sono attenuati; ogni step ha una barra di avanzamento verde.
 *
 * L'avanzamento è simulato sul tempo trascorso (l'edge non streamma
 * progressi): l'ultimo step non arriva mai al 100% da solo — si completa
 * solo quando il parent smonta il componente (estrazione finita).
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Loader2, Camera, Mic, FileText, Sparkles, SearchCheck, Euro } from "lucide-react";

type Mode = "foto" | "audio" | "testo" | "mixed";

interface Step {
  label: string;
  icon: typeof FileText;
  /** durata indicativa in secondi della fase */
  duration: number;
}

function buildSteps(mode: Mode): Step[] {
  const first: Step =
    mode === "foto" || mode === "mixed"
      ? { label: "Analisi delle foto", icon: Camera, duration: 5 }
      : mode === "audio"
        ? { label: "Trascrizione dell'audio", icon: Mic, duration: 6 }
        : { label: "Lettura del testo", icon: FileText, duration: 2.5 };
  return [
    first,
    { label: "Estrazione delle voci", icon: Sparkles, duration: 8 },
    { label: "Abbinamento al listino", icon: SearchCheck, duration: 7 },
    { label: "Prezzi e quantità", icon: Euro, duration: 5 },
  ];
}

export function AIExtractionProgress({ mode }: { mode: Mode }) {
  const [steps] = useState(() => buildSteps(mode));
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 0.15), 150);
    return () => clearInterval(t);
  }, []);

  // Avanzamento per step sul tempo trascorso; l'ultimo si ferma al 92%.
  let start = 0;
  const progress = steps.map((s, i) => {
    const raw = (elapsed - start) / s.duration;
    start += s.duration;
    const capped = i === steps.length - 1 ? Math.min(raw, 0.92) : raw;
    return Math.max(0, Math.min(1, capped));
  });
  const activeIndex = Math.min(
    progress.findIndex((p) => p < 1) === -1 ? steps.length - 1 : progress.findIndex((p) => p < 1),
    steps.length - 1,
  );

  return (
    <div className="max-w-sm mx-auto space-y-2 py-2" role="status" aria-live="polite">
      {steps.map((s, i) => {
        const done = progress[i] >= 1;
        const active = i === activeIndex && !done;
        const Icon = s.icon;
        return (
          <motion.div
            key={s.label}
            initial={false}
            animate={{
              opacity: active ? 1 : done ? 0.75 : 0.45,
              scale: active ? 1 : 0.96,
            }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className={`rounded-lg border bg-card px-3.5 py-2.5 space-y-2 ${
              active ? "shadow-md" : "shadow-none"
            }`}
          >
            <div className="flex items-center gap-2 text-sm">
              {done ? (
                <span className="h-4 w-4 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                  <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                </span>
              ) : active ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
              ) : (
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span className={active ? "font-medium" : done ? "text-muted-foreground" : "text-muted-foreground"}>
                {s.label}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-emerald-500"
                initial={false}
                animate={{ width: `${progress[i] * 100}%` }}
                transition={{ duration: 0.3, ease: "linear" }}
              />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

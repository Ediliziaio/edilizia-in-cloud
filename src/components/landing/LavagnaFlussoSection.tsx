import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { FLUSSI, grafoDa, type NomeFlusso } from "./flussiEic";

// La lavagna pesa: si scarica solo quando la sezione sta per entrare nello schermo.
const WorkflowBlueprint = lazy(() => import("@/components/ui/interactive-workflow-blueprint"));

const COLORI = {
  "--color-background": "#f8fafc",
  "--color-foreground": "#0f172a",
  "--color-card": "#ffffff",
  "--color-muted-foreground": "#64748b",
  "--color-border": "#d1d5db",
  "--color-primary": "#F97415",
  "--color-primary-foreground": "#ffffff",
  "--color-chart-2": "#2563eb",
  "--color-chart-3": "#10b981",
  "--wb-radius": "1.5rem",
} as CSSProperties;

/**
 * «Silvio al lavoro»: un flusso vero di Edilizia in Cloud che gira da solo, un
 * passaggio dopo l'altro, con il registro di cosa succede. Il flusso cambia per
 * pagina (vedi `flussiEic.ts`); in home è quello del margine.
 */
export default function LavagnaFlussoSection({ nome = "margine", sfondo = "bg-white" }: { nome?: NomeFlusso; sfondo?: string }) {
  const f = FLUSSI[nome];
  const grafo = useMemo(() => grafoDa(f.passi), [f]);
  const box = useRef<HTMLDivElement>(null);
  const [vicino, setVicino] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setVicino(true);
        io.disconnect();
      }
    }, { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section className={`${sfondo} px-4 py-12 sm:py-20`}>
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-block rounded-full bg-orange-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#F97415]">{f.eyebrow}</span>
          <h2 className="mt-4 text-3xl font-bold leading-tight text-slate-900 sm:text-4xl">{f.titolo}</h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600 sm:text-lg">{f.testo}</p>
        </div>
        <div ref={box} className="mt-10 min-h-[600px]">
          {vicino && (
            <Suspense fallback={<div className="h-[600px] rounded-3xl border border-slate-200 bg-slate-50" />}>
              <WorkflowBlueprint key={nome} vetrina title={f.lavagna} subtitle="Esempio · Silvio al lavoro" initialGraph={grafo} apps={[]} style={COLORI} oraInizio={f.oraInizio} />
            </Suspense>
          )}
        </div>
      </div>
    </section>
  );
}

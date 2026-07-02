import { cn } from "@/lib/utils";

/**
 * HeroAurora — sfondo "vivo" per gli hero navy dell'area admin: blob luminosi
 * arancio+blu che derivano lenti in blend additivo (mix-blend-screen → i colori
 * si sommano al navy e brillano), una griglia tech e uno sheen che scorre. Dà
 * profondità e movimento d'impatto senza distrarre dal contenuto. Puro CSS,
 * `pointer-events-none`, e si ferma con `prefers-reduced-motion`.
 *
 * Uso: primo figlio di un contenitore `relative overflow-hidden`, col contenuto
 * reale in un wrapper `relative z-10`.
 */
export function HeroAurora({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 z-0 overflow-hidden [isolation:isolate]", className)}>
      {/* Blob arancione (brand) — alto a sinistra, luminoso */}
      <div className="absolute -left-16 -top-24 h-72 w-72 rounded-full bg-orange-500/50 blur-[70px] mix-blend-screen animate-aurora-a motion-reduce:animate-none" />
      {/* Blob blu — basso a destra */}
      <div className="absolute -bottom-32 right-4 h-80 w-80 rounded-full bg-blue-500/45 blur-[75px] mix-blend-screen animate-aurora-b motion-reduce:animate-none" />
      {/* Accento ciano — centro/destra */}
      <div className="absolute right-1/4 top-0 h-52 w-52 rounded-full bg-sky-400/40 blur-[65px] mix-blend-screen animate-aurora-c motion-reduce:animate-none" />
      {/* Accento ambra caldo — centro basso */}
      <div className="absolute bottom-0 left-1/3 h-44 w-44 rounded-full bg-amber-400/35 blur-[60px] mix-blend-screen animate-aurora-a motion-reduce:animate-none" style={{ animationDelay: "-6s" }} />
      {/* Griglia tech finissima */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
          backgroundSize: "38px 38px",
        }}
      />
      {/* Sheen diagonale che scorre */}
      <div
        className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/[0.08] to-transparent motion-reduce:animate-none"
        style={{ backgroundSize: "200% 100%" }}
      />
      {/* Filo di luce in alto */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
    </div>
  );
}

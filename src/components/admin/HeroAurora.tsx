import { cn } from "@/lib/utils";

/**
 * HeroAurora — sfondo "vivo" per gli hero navy dell'area admin: blob arancio+blu
 * che fluttuano lenti, una griglia tech sottile e uno sheen diagonale che scorre.
 * Dà profondità e movimento ambientale senza distrarre. Puro CSS (nessun JS),
 * `pointer-events-none`, e si ferma con `prefers-reduced-motion`.
 *
 * Uso: mettere come primo figlio di un contenitore `relative overflow-hidden`,
 * col contenuto reale in un wrapper `relative z-10`.
 */
export function HeroAurora({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 z-0 overflow-hidden", className)}>
      {/* Blob arancione (brand) — alto a sinistra */}
      <div
        className="absolute -left-12 -top-20 h-64 w-64 rounded-full bg-orange-500/30 blur-3xl animate-float-slow motion-reduce:animate-none"
      />
      {/* Blob blu — basso a destra */}
      <div
        className="absolute -bottom-28 right-8 h-72 w-72 rounded-full bg-blue-500/25 blur-3xl animate-float motion-reduce:animate-none"
        style={{ animationDelay: "-2.5s" }}
      />
      {/* Accento ciano — centro/destra */}
      <div
        className="absolute right-1/3 top-4 h-44 w-44 rounded-full bg-sky-400/20 blur-3xl animate-float-slow motion-reduce:animate-none"
        style={{ animationDelay: "-5s" }}
      />
      {/* Griglia tech finissima */}
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
          backgroundSize: "38px 38px",
        }}
      />
      {/* Sheen diagonale che scorre */}
      <div
        className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/[0.06] to-transparent motion-reduce:animate-none"
        style={{ backgroundSize: "200% 100%" }}
      />
      {/* Filo di luce in alto */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
    </div>
  );
}

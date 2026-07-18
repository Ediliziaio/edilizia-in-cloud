import { cn } from "@/lib/utils";

/**
 * HeroAurora — texture sobria e STATICA per gli hero navy dell'area admin.
 *
 * v2 (2026-07-18): rimossi i "super glow" (richiesta utente) — via i 4 blob
 * colorati additivi (mix-blend-screen) animati + lo sheen scorrevole, che
 * facevano "brillare" l'hero in modo eccessivo. Resta solo profondità discreta:
 * una griglia tech finissima, un accento morbido neutro (niente colore/blend →
 * niente glow) e il filo di luce in alto. Puro CSS, `pointer-events-none`.
 *
 * Uso: primo figlio di un contenitore `relative overflow-hidden`, col contenuto
 * reale in un wrapper `relative z-10`.
 */
export function HeroAurora({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 z-0 overflow-hidden", className)}>
      {/* Accento morbido, statico e neutro: un filo di profondità senza glow. */}
      <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-white/[0.04] blur-3xl" />
      {/* Griglia tech finissima, statica */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      {/* Filo di luce in alto */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
    </div>
  );
}

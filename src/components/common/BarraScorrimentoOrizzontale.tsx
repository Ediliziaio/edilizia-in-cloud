import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/utils";

/**
 * Barra di scorrimento orizzontale "vera" da mettere sotto una board larga
 * (kanban). Quella di sistema su macOS è sovrapposta e sparisce: con molte
 * colonne non si capisce che c'è altro da vedere. Questa è sempre presente
 * quando il contenuto esce dallo schermo, si trascina col dito o col mouse, e un
 * clic sulla pista salta in quel punto.
 *
 * Si passa l'elemento che scorre (`contenitore`). Il suo PRIMO figlio deve essere
 * il contenuto largo (`w-max`): è lui che cambia larghezza quando una colonna si
 * comprime, e la barra si riallinea da sola.
 */
export function BarraScorrimentoOrizzontale({
  contenitore,
  className,
}: {
  contenitore: HTMLElement | null;
  className?: string;
}) {
  const [barra, setBarra] = useState({ visibile: false, sinistraPct: 0, larghezzaPct: 100 });
  const pistaRef = useRef<HTMLDivElement | null>(null);
  const trascina = useRef<{ startX: number; startScroll: number; larghezzaPista: number } | null>(null);

  const aggiorna = useCallback(() => {
    const el = contenitore;
    if (!el) return;
    const scorribile = el.scrollWidth > el.clientWidth + 4;
    const larghezzaPct = scorribile ? (el.clientWidth / el.scrollWidth) * 100 : 100;
    const sinistraPct = scorribile ? (el.scrollLeft / el.scrollWidth) * 100 : 0;
    setBarra((prec) =>
      prec.visibile === scorribile &&
      Math.abs(prec.sinistraPct - sinistraPct) < 0.1 &&
      Math.abs(prec.larghezzaPct - larghezzaPct) < 0.1
        ? prec
        : { visibile: scorribile, sinistraPct, larghezzaPct },
    );
  }, [contenitore]);

  useEffect(() => {
    if (!contenitore) return;
    aggiorna();
    contenitore.addEventListener("scroll", aggiorna, { passive: true });
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(aggiorna);
      ro.observe(contenitore);
      if (contenitore.firstElementChild) ro.observe(contenitore.firstElementChild);
    }
    return () => {
      contenitore.removeEventListener("scroll", aggiorna);
      ro?.disconnect();
    };
  }, [contenitore, aggiorna]);

  const inizia = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const pista = pistaRef.current;
      if (!contenitore || !pista) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      trascina.current = {
        startX: e.clientX,
        startScroll: contenitore.scrollLeft,
        larghezzaPista: pista.clientWidth,
      };
    },
    [contenitore],
  );

  const muovi = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const stato = trascina.current;
      if (!stato || !contenitore || stato.larghezzaPista === 0) return;
      // Un pixel di pista vale scrollWidth / larghezzaPista pixel di contenuto.
      contenitore.scrollLeft =
        stato.startScroll + (e.clientX - stato.startX) * (contenitore.scrollWidth / stato.larghezzaPista);
    },
    [contenitore],
  );

  const finisci = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    trascina.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* già rilasciato */
    }
  }, []);

  // Clic sullo sfondo della pista (non sul pollice): salta a quel punto.
  const salta = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return;
      const pista = pistaRef.current;
      if (!contenitore || !pista) return;
      const rect = pista.getBoundingClientRect();
      const rapporto = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      contenitore.scrollTo({
        left: rapporto * (contenitore.scrollWidth - contenitore.clientWidth),
        behavior: "smooth",
      });
    },
    [contenitore],
  );

  if (!barra.visibile) return null;

  return (
    <div className={cn("shrink-0 px-1 pt-1", className)}>
      <div
        ref={pistaRef}
        onPointerDown={salta}
        className="relative h-2.5 w-full rounded-full bg-muted/50"
      >
        <div
          role="scrollbar"
          aria-label="Scorri le colonne"
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(barra.sinistraPct)}
          onPointerDown={inizia}
          onPointerMove={muovi}
          onPointerUp={finisci}
          onPointerCancel={finisci}
          className="absolute top-0 h-full min-w-[24px] touch-none cursor-grab rounded-full bg-muted-foreground/50 transition-colors hover:bg-muted-foreground/70 active:cursor-grabbing active:bg-muted-foreground/80"
          style={{ left: `${barra.sinistraPct}%`, width: `${barra.larghezzaPct}%` }}
        />
      </div>
    </div>
  );
}

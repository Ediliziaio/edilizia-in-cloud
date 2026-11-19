import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const LARGHEZZA_A4_PX = 210 * 96 / 25.4;

export function FoglioFatturaAdattabile({ children, className }: { children: ReactNode; className?: string }) {
  const contenitore = useRef<HTMLDivElement>(null);
  const [scala, setScala] = useState(0.45);
  useEffect(() => {
    const nodo = contenitore.current;
    if (!nodo) return;
    const adatta = () => {
      if (nodo.clientWidth > 0) setScala(Math.min(1, nodo.clientWidth / LARGHEZZA_A4_PX));
    };
    adatta();
    if (typeof ResizeObserver === "undefined") return;
    const osservatore = new ResizeObserver(adatta);
    osservatore.observe(nodo);
    return () => osservatore.disconnect();
  }, []);
  return (
    <div ref={contenitore} className={cn("min-w-0 w-full overflow-x-hidden bg-muted/50", className)}>
      <div className="mx-auto" style={{ zoom: scala, width: "210mm" }}>
        {children}
      </div>
    </div>
  );
}

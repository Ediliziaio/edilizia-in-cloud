import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface DettagliTelefonoProps {
  /** La riga che apre il gruppo, es. «Dettagli di posa». */
  titolo?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Telefono: raccoglie le scelte tecniche dei moduli render — quelle che hanno
 * già un valore sensato (direzione di posa, fughe, bisellatura…) — in una riga
 * chiusa. Sul computer i figli restano esattamente dove sono, senza contenitore.
 */
export function DettagliTelefono({ titolo = "Altri dettagli", children, className }: DettagliTelefonoProps) {
  const isMobile = useIsMobile();
  const [aperto, setAperto] = useState(false);

  if (!isMobile) return <>{children}</>;

  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      <button
        type="button"
        aria-expanded={aperto}
        onClick={() => setAperto((valore) => !valore)}
        className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left text-[13px] font-medium"
      >
        {titolo}
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", aperto && "rotate-180")} />
      </button>
      {aperto && <div className="space-y-3 border-t px-3 py-3">{children}</div>}
    </div>
  );
}

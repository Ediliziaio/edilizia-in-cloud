// src/components/orders/generali/PercorsoGenerale.tsx
// In cima a una commessa che sta dentro una generale: «Parte di …», con il link.
// Se la colonna non c'è ancora o la lettura fallisce, non mostra niente.
import { Link } from "react-router-dom";
import { Layers } from "lucide-react";
import { useGeneraleDellaCommessa } from "@/hooks/useCommesseGenerali";

export function PercorsoGenerale({ orderId }: { orderId: string }) {
  const { data: g } = useGeneraleDellaCommessa(orderId);
  if (!g) return null;
  return (
    <div className="px-3 pt-2 sm:px-6">
      <Link
        to={`/azienda/ordini/${g.id}`}
        className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">Parte di <span className="font-medium text-foreground">{[g.codice, g.nome].filter(Boolean).join(" · ")}</span></span>
      </Link>
    </div>
  );
}

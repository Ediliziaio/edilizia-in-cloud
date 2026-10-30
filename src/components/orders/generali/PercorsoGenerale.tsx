// src/components/orders/generali/PercorsoGenerale.tsx
// In cima a una commessa che sta dentro una generale: la strada per tornare alla generale
// e per passare alle commesse sorelle (precedente, successiva, oppure una qualsiasi dall'elenco).
// Se la commessa non è dentro una generale, o la lettura fallisce, non mostra niente.
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGeneraleDellaCommessa } from "@/hooks/useCommesseGenerali";
import { DEFINIZIONI_MODELLI } from "@/lib/orders/commesseGenerali";

export function PercorsoGenerale({ orderId }: { orderId: string }) {
  const { data: g } = useGeneraleDellaCommessa(orderId);
  const navigate = useNavigate();
  if (!g) return null;

  const def = g.modello ? DEFINIZIONI_MODELLI[g.modello] : null;
  const indice = g.sorelle.findIndex((s) => s.id === orderId);
  const prima = indice > 0 ? g.sorelle[indice - 1] : null;
  const dopo = indice >= 0 && indice < g.sorelle.length - 1 ? g.sorelle[indice + 1] : null;
  const etichetta = (s: { codice: string | null; nome: string }) => [s.codice, s.nome].filter(Boolean).join(" · ");
  const vai = (id: string) => navigate(`/azienda/ordini/${id}`);

  return (
    <nav aria-label="Commessa generale" className="px-3 pt-2 sm:px-6">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-2 py-1.5">
        <Link
          to={`/azienda/ordini/${g.id}`}
          className="inline-flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs hover:bg-muted"
        >
          <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">
            <span className="text-muted-foreground">{def ? `${def.nome}: ` : "Parte di "}</span>
            <span className="font-medium">{[g.codice, g.nome].filter(Boolean).join(" · ")}</span>
          </span>
        </Link>

        {g.sorelle.length > 1 && indice >= 0 && (
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost" size="icon" className="h-7 w-7"
              disabled={!prima} onClick={() => prima && vai(prima.id)}
              aria-label={prima ? `Precedente: ${etichetta(prima)}` : "Nessuna precedente"}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Select value={orderId} onValueChange={vai}>
              <SelectTrigger className="h-7 w-auto min-w-[7rem] max-w-[16rem] gap-1 text-xs" aria-label={`Vai a un altro ${def?.figlia.una ?? "lavoro"}`}>
                <SelectValue>
                  {indice + 1} di {g.sorelle.length}
                  <span className="hidden sm:inline"> · {def?.figlia.tante.toLowerCase() ?? "commesse"}</span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="end" className="max-h-80">
                {g.sorelle.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">{etichetta(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost" size="icon" className="h-7 w-7"
              disabled={!dopo} onClick={() => dopo && vai(dopo.id)}
              aria-label={dopo ? `Successiva: ${etichetta(dopo)}` : "Nessuna successiva"}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </nav>
  );
}

/**
 * Drawer drill-down per (codice voce CE, mese).
 *
 * Replica la granularità Excel "OTP | Flusso Finanziario":
 *   TIPOLOGIA (CE)  →  DESCRIZIONE (raggruppamento per voce_chiave / cliente)
 *                   →  Sub-righe (singoli movimenti: fatture, costi, cedolini…)
 */

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ErrorBlock } from "@/components/controllo-gestione/ui/ErrorBlock";
import {
  useDettaglioVoceMese,
  type DettaglioRiga,
} from "@/hooks/controlloGestione/useDettaglioVoceMese";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  anno: number;
  mese: number | null;
  codice: string | null;
  /** Etichetta voce CE (es. "Costi commerciali"), opzionale per fallback. */
  labelFallback?: string;
}

const MESI_FULL = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

const SOURCE_LABELS: Record<DettaglioRiga["source_table"], string> = {
  company_costs: "Costo aziendale",
  bank_transactions: "Banca",
  prima_nota: "Prima nota",
  invoices: "Fattura",
  orders: "Commessa",
  cedolini: "Cedolino",
  cespiti: "Cespite",
};

export function DettaglioVoceMeseSheet({
  open, onOpenChange, anno, mese, codice, labelFallback,
}: Props) {
  const q = useDettaglioVoceMese(anno, mese, codice);

  const titolo = q.data?.meta.label ?? labelFallback ?? "Dettaglio voce";
  const sottotitolo =
    mese !== null ? `${MESI_FULL[mese - 1]} ${anno}` : `Anno ${anno} (totale)`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-2xl"
      >
        <SheetHeader>
          <SheetTitle className="text-xl">{titolo}</SheetTitle>
          <p className="text-sm text-muted-foreground">{sottotitolo}</p>
          {q.data?.meta.totale != null && (
            <p className="pt-1 text-2xl font-bold tabular-nums">
              {formatCurrency(q.data.meta.totale)}
            </p>
          )}
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {q.isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          )}

          {q.isError && <ErrorBlock onRetry={() => q.refetch()} />}

          {q.data && q.data.righe.length === 0 && (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nessun movimento registrato per questa voce nel mese di{" "}
              {sottotitolo}.
            </div>
          )}

          {q.data && q.data.raggruppamento.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Sub-righe (per categoria)
              </h3>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                        Categoria
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                        N°
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                        Totale
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.data.raggruppamento.map((g) => (
                      <tr key={g.etichetta} className="border-t">
                        <td className="px-3 py-2">{g.etichetta}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">
                          {g.count}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2 text-right tabular-nums font-medium",
                            g.totale < 0 && "text-destructive",
                          )}
                        >
                          {formatCurrency(g.totale)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {q.data && q.data.righe.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Movimenti ({q.data.righe.length})
              </h3>
              <ul className="divide-y rounded-xl border">
                {q.data.righe.map((r) => (
                  <li key={`${r.source_table}-${r.id}`} className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {r.descrizione}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDate(r.data)}
                          {r.controparte ? ` · ${r.controparte}` : ""}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge variant="outline" className="text-[10px]">
                            {SOURCE_LABELS[r.source_table] ?? r.source_table}
                          </Badge>
                          {r.voce_chiave && (
                            <Badge variant="secondary" className="text-[10px]">
                              {r.voce_chiave}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <p
                        className={cn(
                          "shrink-0 text-right tabular-nums text-sm font-semibold",
                          r.importo < 0 && "text-destructive",
                        )}
                      >
                        {formatCurrency(r.importo)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { useMaterialProcurement, useUnmappedPurchaseOrders } from "@/hooks/useMaterialProcurement";
import { planMaterial, type ProcurementItem } from "@/lib/orders/materialProcurement";
import { cn } from "@/lib/utils";

export function OrderMaterialsSummary({ items, orderId }: { items: ProcurementItem[]; orderId: string }) {
  const coverage = useMaterialProcurement(items);
  const unmapped = useUnmappedPurchaseOrders(orderId);
  const [aperta, setAperta] = useState<string | null>(null);
  if (!items.length) return (
    <section aria-label="Flusso materiali" className="rounded-lg border bg-muted/20 p-4 space-y-1">
      <h3 className="font-medium">Organizza i materiali della commessa</h3>
      <p className="text-sm text-muted-foreground">Aggiungi gli articoli e scegli il fornitore oppure la giacenza. Poi prepara l’ordine, registra le ricezioni e collega le uscite verso il cantiere.</p>
    </section>
  );
  if (coverage.isPending || coverage.isError || unmapped.isPending || unmapped.isError) return null; // The actionable panel owns loading/errors.
  const plans = items.map(i => planMaterial(i, coverage.data ?? []));
  const blocked = new Set((unmapped.data ?? []).map(o => o.supplier_id));
  const counts = [
    ["Da acquistare", plans.filter(p => p.canOrder && !blocked.has(p.item.supplier_id ?? ""))],
    ["In bozza OdA", plans.filter(p => p.drafted > 0)],
    ["In attesa di ricezione", plans.filter(p => p.issued > p.received)],
    ["Ricevuti", plans.filter(p => p.ricevuto)],
    ["Da verificare", plans.filter(p => p.review || p.overOrdered || blocked.has(p.item.supplier_id ?? ""))],
  ] as const;
  const elenco = counts.find(([label]) => label === aperta)?.[1] ?? [];
  return (
    <section aria-label="Riepilogo materiali" className="rounded-lg border bg-background p-4 max-sm:p-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        {counts.map(([label, righe]) => (
          <button key={label} type="button" disabled={righe.length === 0} aria-pressed={aperta === label}
            onClick={() => setAperta(aperta === label ? null : label)}
            className={cn("rounded-md border border-transparent p-2 text-left transition-colors enabled:hover:bg-accent", aperta === label && "border-primary bg-primary/5")}>
            <span className="block text-xs text-muted-foreground">{label}</span>
            <span className="mt-1 block text-lg font-semibold tabular-nums">{righe.length}</span>
          </button>
        ))}
      </div>
      {elenco.length > 0 && (
        <ul aria-label={`Articoli: ${aperta}`} className="mt-2 divide-y rounded-md border text-sm">
          {elenco.map(p => (
            <li key={p.item.id ?? p.item.name} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2">
              <span className="min-w-0 font-medium">{p.item.name}</span>
              <span className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                <span className="tabular-nums">{p.item.quantity} {p.item.unita_misura || "pz"}</span>
                {p.ordini.map(o => <Link key={o.id} to={`/azienda/ordini-acquisto/${o.id}`} className="font-mono underline underline-offset-2">{o.oda_number}</Link>)}
              </span>
              {aperta === "Da verificare" && <span className="w-full text-xs text-muted-foreground">{p.review ?? (p.overOrdered ? "Quantità ordinata superiore al previsto" : "Il fornitore ha un ordine da riconciliare")}</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted-foreground max-sm:hidden">Conteggio per articolo: una riga può essere acquistata o ricevuta in più parti. La bozza non è un ordine inviato; la ricezione non è il consumo in cantiere.</p>
    </section>
  );
}

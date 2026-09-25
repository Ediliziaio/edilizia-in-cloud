import { useMaterialProcurement, useUnmappedPurchaseOrders } from "@/hooks/useMaterialProcurement";
import { planMaterial, type ProcurementItem } from "@/lib/orders/materialProcurement";

export function OrderMaterialsSummary({ items, orderId }: { items: ProcurementItem[]; orderId: string }) {
  const coverage = useMaterialProcurement(items);
  const unmapped = useUnmappedPurchaseOrders(orderId);
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
    ["Da acquistare", plans.filter(p => p.canOrder && !blocked.has(p.item.supplier_id ?? "")).length],
    ["In bozza OdA", plans.filter(p => p.drafted > 0).length],
    ["In attesa di ricezione", plans.filter(p => p.issued > p.received).length],
    ["Da verificare", plans.filter(p => p.review || p.overOrdered || blocked.has(p.item.supplier_id ?? "")).length],
  ];
  return (
    <section aria-label="Riepilogo materiali" className="rounded-lg border bg-background p-4">
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {counts.map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd></div>)}
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">Conteggio per articolo: una riga può essere acquistata o ricevuta in più parti. La bozza non è un ordine inviato; la ricezione non è il consumo in cantiere.</p>
    </section>
  );
}

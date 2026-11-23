import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { isSottoScorta, type StockItem } from "@/types/warehouse";
import type { InArrivoArticolo } from "@/hooks/useMagazzinoRiepilogo";
import { formatCurrency } from "@/lib/formatters";

export function StockItemOverview({ item, supplierName, sectionName, inArrivo, arriviUnavailable, canViewCosts }: {
  item: StockItem;
  supplierName?: string;
  sectionName?: string;
  inArrivo?: InArrivoArticolo;
  arriviUnavailable?: boolean;
  canViewCosts: boolean;
}) {
  const quantity = (n: number) => Number(n).toLocaleString("it-IT", { maximumFractionDigits: 6 });
  return <section aria-label="Situazione articolo" className="space-y-4 rounded-xl border bg-slate-50 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm text-muted-foreground">{item.internal_code || item.barcode || "Codice non indicato"}</span>
      <Badge variant={isSottoScorta(item) ? "destructive" : "secondary"}>{isSottoScorta(item) ? "Sotto scorta" : Number(item.quantity_available ?? item.quantity) > 0 ? "Disponibile" : "Non disponibile"}</Badge>
    </div>
    {/* I tre numeri su una riga, con l'unità accanto; l'unità da sola non occupa più un riquadro
        («Non indicata» a 18px al posto di un numero — collaudo 23/11/2026). */}
    <dl className="grid grid-cols-3 gap-2 sm:gap-3">
      {[
        ["Giacenza fisica", quantity(item.quantity)],
        ["Impegnato", quantity(item.quantity_reserved ?? 0)],
        ["Disponibile", quantity(item.quantity_available ?? item.quantity)],
      ].map(([label, value]) => <div key={label} className="min-w-0 rounded-lg border bg-white p-3 max-sm:p-2"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-lg font-semibold tabular-nums max-sm:text-base">{value}{item.unita_misura ? <span className="ml-1 text-xs font-normal text-muted-foreground">{item.unita_misura}</span> : null}</dd></div>)}
    </dl>
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      <div><dt className="text-muted-foreground">Fornitore</dt><dd>{supplierName || "Non indicato"}</dd></div>
      <div><dt className="text-muted-foreground">Ubicazione / zona</dt><dd>{sectionName || "Non indicata"}</dd></div>
      <div><dt className="text-muted-foreground">Scorta minima</dt><dd>{quantity(item.min_stock_level ?? 0)}</dd></div>
      <div><dt className="text-muted-foreground">Unità di misura</dt><dd>{item.unita_misura || "Non indicata"}</dd></div>
      {canViewCosts && <div><dt className="text-muted-foreground">Costo unitario</dt><dd>{item.prezzo_da_definire ? "Da definire" : formatCurrency(item.unit_cost)}</dd></div>}
    </dl>
    {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
    <div className="border-t pt-3 text-sm">
      <h3 className="font-medium">Ordini in arrivo</h3>
      {arriviUnavailable ? <p className="text-muted-foreground">Arrivi non verificati: consulta gli ordini fornitore.</p> : !inArrivo || inArrivo.quantita <= 0 ? <p className="text-muted-foreground">Nessun arrivo da ordini fornitore aperti.</p> : <>
        <p>{quantity(inArrivo.quantita)} {item.unita_misura || "unità"} previste, escluse dalla giacenza disponibile.</p>
        <ul className="mt-1 flex flex-wrap gap-3">{inArrivo.ordini.map((order) => <li key={order.id}><Link className="text-primary hover:underline" to={`/azienda/ordini-acquisto/${order.id}`}>{order.numero}</Link>{order.consegna && <span className="text-muted-foreground"> · {new Date(`${order.consegna.slice(0, 10)}T12:00:00`).toLocaleDateString("it-IT")}</span>}</li>)}</ul>
      </>}
    </div>
  </section>;
}

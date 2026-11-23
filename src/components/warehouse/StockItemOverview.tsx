import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { isSottoScorta, type StockItem } from "@/types/warehouse";
import type { InArrivoArticolo } from "@/hooks/useMagazzinoRiepilogo";
import { formatCurrency } from "@/lib/formatters";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

export function StockItemOverview({ item, supplierName, sectionName, inArrivo, arriviUnavailable, canViewCosts }: {
  item: StockItem;
  supplierName?: string;
  sectionName?: string;
  inArrivo?: InArrivoArticolo;
  arriviUnavailable?: boolean;
  canViewCosts: boolean;
}) {
  const t = useT();
  const quantity = (n: number) => Number(n).toLocaleString(intlCampo(), { maximumFractionDigits: 6 });
  return <section aria-label={t("Situazione articolo")} className="space-y-4 rounded-xl border bg-slate-50 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm text-muted-foreground">{item.internal_code || item.barcode || t("Codice non indicato")}</span>
      <Badge variant={isSottoScorta(item) ? "destructive" : "secondary"}>{isSottoScorta(item) ? t("Sotto scorta") : Number(item.quantity_available ?? item.quantity) > 0 ? t("Disponibile") : t("Non disponibile")}</Badge>
    </div>
    {/* I tre numeri su una riga, con l'unità accanto; l'unità da sola non occupa più un riquadro
        («Non indicata» a 18px al posto di un numero — collaudo 23/11/2026). */}
    <dl className="grid grid-cols-3 gap-2 sm:gap-3">
      {[
        ["Giacenza fisica", quantity(item.quantity)],
        ["Impegnato", quantity(item.quantity_reserved ?? 0)],
        ["Disponibile", quantity(item.quantity_available ?? item.quantity)],
      ].map(([label, value]) => <div key={label} className="min-w-0 rounded-lg border bg-white p-3 max-sm:p-2"><dt className="text-xs text-muted-foreground">{t(String(label))}</dt><dd className="mt-1 text-lg font-semibold tabular-nums max-sm:text-base">{value}{item.unita_misura ? <span className="ml-1 text-xs font-normal text-muted-foreground">{item.unita_misura}</span> : null}</dd></div>)}
    </dl>
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      <div><dt className="text-muted-foreground">{t("Fornitore")}</dt><dd>{supplierName || t("Non indicato")}</dd></div>
      <div><dt className="text-muted-foreground">{t("Ubicazione / zona")}</dt><dd>{sectionName || t("Non indicata")}</dd></div>
      <div><dt className="text-muted-foreground">{t("Scorta minima")}</dt><dd>{quantity(item.min_stock_level ?? 0)}</dd></div>
      <div><dt className="text-muted-foreground">{t("Unità di misura")}</dt><dd>{item.unita_misura || t("Non indicata")}</dd></div>
      {canViewCosts && <div><dt className="text-muted-foreground">{t("Costo unitario")}</dt><dd>{item.prezzo_da_definire ? t("Da definire") : formatCurrency(item.unit_cost)}</dd></div>}
    </dl>
    {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
    <div className="border-t pt-3 text-sm">
      <h3 className="font-medium">{t("Ordini in arrivo")}</h3>
      {arriviUnavailable ? <p className="text-muted-foreground">{t("Arrivi non verificati: consulta gli ordini fornitore.")}</p> : !inArrivo || inArrivo.quantita <= 0 ? <p className="text-muted-foreground">{t("Nessun arrivo da ordini fornitore aperti.")}</p> : <>
        <p>{t("{quantita} {unita} previste, escluse dalla giacenza disponibile.", { quantita: quantity(inArrivo.quantita), unita: item.unita_misura || t("unità") })}</p>
        <ul className="mt-1 flex flex-wrap gap-3">{inArrivo.ordini.map((order) => <li key={order.id}><Link className="text-primary hover:underline" to={`/azienda/ordini-acquisto/${order.id}`}>{order.numero}</Link>{order.consegna && <span className="text-muted-foreground"> · {new Date(`${order.consegna.slice(0, 10)}T12:00:00`).toLocaleDateString(intlCampo())}</span>}</li>)}</ul>
      </>}
    </div>
  </section>;
}

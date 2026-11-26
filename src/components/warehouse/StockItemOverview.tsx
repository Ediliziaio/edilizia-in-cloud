import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { isSottoScorta, type StockItem } from "@/types/warehouse";
import type { InArrivoArticolo } from "@/hooks/useMagazzinoRiepilogo";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

/**
 * Situazione di un articolo nella finestra di dettaglio del magazzino.
 *
 * 26/11/2026: sei numeri in fila (giacenza, impegnato, disponibile, in arrivo, scorta minima,
 * valore) e l'anagrafica su tre colonne — codice, barcode, magazzino, zona, fornitore, unità,
 * costo, IVA, tracciamento, garanzia, ultimo aggiornamento. Prima c'erano tre numeri e cinque
 * voci, e per il resto bisognava aprire «Modifica articolo».
 */
export function StockItemOverview({ item, supplierName, sectionName, warehouseName, inArrivo, arriviUnavailable, canViewCosts }: {
  item: StockItem;
  supplierName?: string;
  sectionName?: string;
  warehouseName?: string;
  inArrivo?: InArrivoArticolo;
  arriviUnavailable?: boolean;
  canViewCosts: boolean;
}) {
  const t = useT();
  const quantity = (n: number) => Number(n).toLocaleString(intlCampo(), { maximumFractionDigits: 6 });
  const um = item.unita_misura || "";
  const disponibile = Number(item.quantity_available ?? item.quantity);
  const sottoScorta = isSottoScorta(item);
  const arrivo = !arriviUnavailable && inArrivo && inArrivo.quantita > 0 ? inArrivo.quantita : 0;
  const numeri: Array<{ label: string; value: string; unita?: boolean; tono?: string }> = [
    { label: "Giacenza fisica", value: quantity(item.quantity), unita: true },
    { label: "Impegnato", value: quantity(item.quantity_reserved ?? 0), unita: true },
    { label: "Disponibile", value: quantity(disponibile), unita: true, tono: sottoScorta ? "text-amber-700" : disponibile > 0 ? "text-emerald-700" : undefined },
    { label: "In arrivo", value: arriviUnavailable ? "—" : quantity(arrivo), unita: !arriviUnavailable },
    { label: "Scorta minima", value: item.min_stock_level ? quantity(item.min_stock_level) : "—", unita: !!item.min_stock_level },
  ];
  if (canViewCosts) numeri.push({ label: "Valore totale", value: item.prezzo_da_definire ? t("Da valorizzare") : formatCurrency(Number(item.unit_cost) * Number(item.quantity)) });
  const data = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(intlCampo()) : "—");
  // Il codice è già in testa al riquadro; il barcode compare qui solo se è un altro codice.
  const voci: Array<[string, string]> = [
    ...(item.internal_code && item.barcode ? [["Barcode", item.barcode] as [string, string]] : []),
    ["Unità di misura", um || t("Non indicata")],
    ["Magazzino", warehouseName || t("Non indicato")],
    ["Ubicazione / zona", sectionName || t("Non indicata")],
    ["Fornitore", supplierName || t("Non indicato")],
  ];
  if (canViewCosts) {
    voci.push(["Costo unitario", item.prezzo_da_definire ? t("Da definire") : formatCurrency(item.unit_cost)]);
    voci.push(["IVA", item.vat_rate != null ? `${item.vat_rate}%` : "—"]);
  }
  voci.push(["Tracciamento", item.tracking_mode === "serialized" ? t("Con matricola") : t("A quantità")]);
  if (item.requires_warranty || item.default_warranty_months) voci.push(["Garanzia", item.default_warranty_months ? t("{n} mesi", { n: item.default_warranty_months }) : t("Obbligatoria")]);
  voci.push(["Ultimo aggiornamento", data(item.updated_at)]);

  return <section aria-label={t("Situazione articolo")} className="space-y-3 rounded-xl border bg-slate-50 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="font-mono text-xs text-muted-foreground">{item.internal_code || item.barcode || ""}</span>
      <Badge variant={sottoScorta ? "destructive" : "secondary"}>{sottoScorta ? t("Sotto scorta") : disponibile > 0 ? t("Disponibile") : t("Non disponibile")}</Badge>
    </div>
    <dl className="grid grid-cols-3 gap-2 md:grid-cols-6">
      {numeri.map((n) => <div key={n.label} className="min-w-0 rounded-lg border bg-white px-2.5 py-1.5">
        <dt className="truncate text-[11px] text-muted-foreground">{t(n.label)}</dt>
        <dd className={cn("mt-0.5 truncate text-base font-semibold tabular-nums", n.tono)}>{n.value}{n.unita && um ? <span className="ml-1 text-xs font-normal text-muted-foreground">{um}</span> : null}</dd>
      </div>)}
    </dl>
    <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {voci.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{t(label)}</dt><dd className="truncate" title={value}>{value}</dd></div>)}
    </dl>
    {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
    <div className="border-t pt-2 text-sm">
      <h3 className="font-medium">{t("Ordini in arrivo")}</h3>
      {arriviUnavailable ? <p className="text-muted-foreground">{t("Arrivi non verificati: consulta gli ordini fornitore.")}</p> : !inArrivo || inArrivo.quantita <= 0 ? <p className="text-muted-foreground">{t("Nessun arrivo da ordini fornitore aperti.")}</p> : <>
        <p>{t("{quantita} {unita} previste, escluse dalla giacenza disponibile.", { quantita: quantity(inArrivo.quantita), unita: item.unita_misura || t("unità") })}</p>
        <ul className="mt-1 flex flex-wrap gap-3">{inArrivo.ordini.map((order) => <li key={order.id}><Link className="text-primary hover:underline" to={`/azienda/ordini-acquisto/${order.id}`}>{order.numero}</Link>{order.consegna && <span className="text-muted-foreground"> · {new Date(`${order.consegna.slice(0, 10)}T12:00:00`).toLocaleDateString(intlCampo())}</span>}</li>)}</ul>
      </>}
    </div>
  </section>;
}

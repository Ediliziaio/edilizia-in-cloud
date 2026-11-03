/**
 * «Seriali e garanzie» nella pagina commessa: gli articoli che hanno una matricola, con quanti
 * seriali sono assegnati e «Gestisci seriali» (manuale + scanner).
 *
 * Una matricola ce l'hanno gli articoli di magazzino tracciati pezzo per pezzo o con garanzia
 * obbligatoria, e quelli che ne hanno già una assegnata. Le righe libere della commessa (quasi
 * tutte: non sono collegate al magazzino) non si sa: restano sotto «Altri articoli».
 *
 * Una query sola per tutte le righe (batched), non una per riga.
 */
import { useMemo, useState } from "react";
import { Package, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RiquadroCommessa, StatoPill, TabellaCommessa, type ColonnaTabella } from "@/components/orders/TabellaCommessa";
import { AssignSerialsDialog } from "@/components/warehouse/AssignSerialsDialog";
import { useArticoliConSeriale, useStockUnitsByOrderItemIds } from "@/hooks/warehouse/useStockUnits";
import type { OrderItemData } from "@/lib/orderUtils";

interface OrderSerialsTrackingCardProps {
  orderId: string;
  orderItems: OrderItemData[];
}

export function OrderSerialsTrackingCard({ orderId, orderItems }: OrderSerialsTrackingCardProps) {
  const [altriAperti, setAltriAperti] = useState(false);
  const [gestito, setGestito] = useState<OrderItemData | null>(null);

  // Solo materiali fisici con quantità positiva possono avere matricole.
  const trackableItems = useMemo(
    () => orderItems.filter((it) => (!it.natura_riga || it.natura_riga === "materiale") && (it.quantity ?? 0) > 0),
    [orderItems],
  );
  const itemIds = useMemo(() => trackableItems.map((it) => it.id), [trackableItems]);
  const { data: serialsByItem = new Map() } = useStockUnitsByOrderItemIds(itemIds);
  const { data: conSeriale = new Set<string>() } = useArticoliConSeriale(trackableItems.map((it) => it.stock_item_id ?? ""));

  if (trackableItems.length === 0) return null;

  const assegnati = (it: OrderItemData): number => (serialsByItem.get(it.id) ?? []).length;
  const daSeguire = trackableItems.filter((it) => (it.stock_item_id && conSeriale.has(it.stock_item_id)) || assegnati(it) > 0);
  const altri = trackableItems.filter((it) => !daSeguire.includes(it));
  const complete = daSeguire.filter((it) => assegnati(it) >= (it.quantity ?? 0)).length;

  const colonne: ColonnaTabella<OrderItemData>[] = [
    { titolo: "Articolo", principale: true, cella: (it) => (
      <span className="flex flex-wrap items-center gap-2 font-medium">
        {it.name}
        {it.product_code && <span className="font-mono text-xs font-normal text-muted-foreground">{it.product_code}</span>}
      </span>
    ) },
    { titolo: "Seriali", cella: (it) => {
      const n = assegnati(it);
      const q = it.quantity ?? 0;
      return <StatoPill tono={n >= q ? "verde" : n > 0 ? "ambra" : "grigio"}>{n} / {q}</StatoPill>;
    } },
    { titolo: "Azione", intestazione: <span className="sr-only">Azione</span>, destra: true, cella: (it) => (
      <Button variant="outline" size="sm" className="h-8" onClick={() => setGestito(it)}>
        <ScanLine className="mr-1.5 h-3.5 w-3.5" aria-hidden />Gestisci seriali
      </Button>
    ) },
  ];

  return (
    <RiquadroCommessa icona={<Package className="h-4 w-4 text-orange-600" aria-hidden />} titolo="Seriali e garanzie" conteggio={daSeguire.length}
      riassunto={daSeguire.length > 0 ? `${complete} su ${daSeguire.length} completi` : undefined}>
      <div className="space-y-3">
        {daSeguire.length > 0
          ? <TabellaCommessa etichetta="Seriali degli articoli" colonne={colonne} righe={daSeguire} chiave={(it) => it.id} />
          : <p className="text-sm text-muted-foreground">Nessun articolo del magazzino prevede una matricola in questa commessa.</p>}
        {altri.length > 0 && (
          <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" aria-expanded={altriAperti} onClick={() => setAltriAperti((v) => !v)}>
            {altriAperti ? "Nascondi gli altri articoli" : `Altri articoli (${altri.length})`}
          </Button>
        )}
        {altriAperti && <TabellaCommessa etichetta="Altri articoli" colonne={colonne} righe={altri} chiave={(it) => it.id} />}
      </div>
      {gestito && (
        <AssignSerialsDialog
          open
          onOpenChange={(aperto) => { if (!aperto) setGestito(null); }}
          orderId={orderId}
          orderItemId={gestito.id}
          expectedQty={gestito.quantity ?? 0}
          itemLabel={gestito.product_code ? `${gestito.name} · ${gestito.product_code}` : gestito.name}
        />
      )}
    </RiquadroCommessa>
  );
}

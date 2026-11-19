import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useWarehouseOperation, useWarehouseProtocol } from "@/hooks/warehouse/useWarehouseOperations";
import { useReturnCandidates } from "@/hooks/warehouse/useReturnCandidates";
import { supabase } from "@/integrations/supabase/client";
import { readAllOrderRows } from "@/lib/orders/listScope";
import { leggiQuantitaNonNegativa, formattaQuantitaMovimento as fmt } from "@/lib/magazzino/quantitaMovimento";
import { unitaConsumoConfrontabile } from "@/lib/distinta/consumiMateriali";
import type { StockItem } from "@/types/warehouse";
import { OrderSelectCombobox } from "./OrderSelectCombobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface OrderLine {
  id: string; name: string; quantity: number; status: string | null;
  fulfillment_status: string | null; warehouse_reserved_quantity: number | null;
}

/** Prenota una riga materiali già collegata all'articolo. Nessun carico/scarico implicito. */
export function ReserveStockDialog({ items, initialItem, warehouseNames = {}, onClose }: {
  items: StockItem[]; initialItem?: StockItem | null; warehouseNames?: Record<string, string>; onClose: () => void;
}) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const permissions = usePermissions();
  const canWrite = !permissions.isLoading && permissions.canEditWarehouse && permissions.canEditOrders;
  const protocol = useWarehouseProtocol(companyId);
  const operation = useWarehouseOperation("reserve");
  const flight = useRef(false);
  const [stockId, setStockId] = useState(initialItem?.id ?? "");
  const [orderId, setOrderId] = useState<string>();
  const [orderCode, setOrderCode] = useState("");
  const [lineId, setLineId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [review, setReview] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stock = useQuery({
    queryKey: ["warehouse", "reserve-stock", companyId, stockId], enabled: !!companyId && !!stockId,
    staleTime: 0, retry: false,
    queryFn: async (): Promise<StockItem> => {
      const { data, error } = await supabase.from("warehouse_stock").select("id,company_id,warehouse_id,name,quantity,quantity_reserved,quantity_available,unita_misura,tracking_mode").eq("id", stockId).eq("company_id", companyId!).single();
      if (error) throw error;
      return data as StockItem;
    },
  });
  const lines = useQuery({
    queryKey: ["warehouse", "reservation-lines", companyId, orderId, stockId],
    enabled: !!companyId && !!stockId && !!orderId && protocol.data?.atomic_reservations === true,
    staleTime: 0, retry: false,
    queryFn: async () => readAllOrderRows<OrderLine>((from, to) => {
      const query = supabase.from("order_items")
        .select("id,name,quantity,status,fulfillment_status,warehouse_reserved_quantity,order:orders!inner(company_id)")
        .eq("order_id", orderId!).eq("stock_item_id", stockId).eq("order.company_id", companyId!).order("id").range(from, to);
      return query as unknown as PromiseLike<{ data: OrderLine[] | null; error: unknown }>;
    }),
  });
  const returns = useReturnCandidates(companyId, orderId);
  const line = lines.data?.find((row) => row.id === lineId) ?? (lines.data?.length === 1 ? lines.data[0] : undefined);
  const item = stock.data;
  const ownReserved = line?.fulfillment_status === "received" ? Number(line.warehouse_reserved_quantity ?? line.quantity) : 0;
  const physical = Number(item?.quantity ?? 0);
  const reserved = Number(item?.quantity_reserved ?? 0);
  const available = physical - reserved;
  const issued = returns.data?.filter((r) => r.orderItemId === line?.id)
    .reduce((sum, r) => sum + Math.max(0, r.usciti - r.rientrati), 0) ?? 0;
  const maxQuantity = line ? Math.max(0, Math.min(Number(line.quantity) - issued, available + ownReserved)) : 0;
  const q = leggiQuantitaNonNegativa(quantity);
  const whole = item?.tracking_mode === "serialized" || unitaConsumoConfrontabile(item?.unita_misura) === "pz";
  const loading = stock.isLoading || lines.isLoading || returns.isLoading || protocol.isLoading || stock.isFetching || lines.isFetching || returns.isFetching;
  const historicalUnknown = returns.data?.some((r) => (r.orderItemId === line?.id || r.id === line?.id) && r.verified === false) ?? false;
  const unavailable = stock.isError || lines.isError || returns.isError || protocol.isError || historicalUnknown;
  const quantityProblem = !quantity.trim() ? null : q === null ? "Inserisci un numero valido, anche con la virgola."
    : whole && !Number.isInteger(q) ? "Per questo articolo servono quantità intere."
    : q > maxQuantity ? `Puoi prenotare al massimo ${fmt(maxQuantity)} ${item?.unita_misura || "unità"}.`
    : q === ownReserved ? "Questa quantità è già prenotata: non ci sono modifiche da salvare." : null;
  const valid = canWrite && !loading && !unavailable && !!item && !!line && protocol.data?.atomic_reservations === true
    && line.status !== "installato" && line.fulfillment_status !== "delivered"
    && q !== null && q >= 0 && q <= maxQuantity && (!whole || Number.isInteger(q)) && q !== ownReserved;
  const afterReserved = q === null ? reserved : reserved - ownReserved + q;
  async function confirm() {
    if (!valid || !review || flight.current || !line || q === null) return;
    flight.current = true; setError(null);
    try {
      await operation.mutateAsync({ rpc: "warehouse_reserve_v2", payload: { p_order_item_id: line.id, p_quantity: q } });
      setSaved(true);
    } catch (e) { const message = e && typeof e === "object" && "message" in e ? String(e.message) : "Prenotazione non salvata. Riprova."; setError(message); }
    finally { flight.current = false; }
  }
  const title = saved ? "Prenotazione salvata" : review ? "Conferma prenotazione" : "Prenota per commessa";
  return <Dialog open onOpenChange={(open) => { if (!open && !operation.isPending) onClose(); }}>
    <DialogContent className="max-h-[90svh] max-w-2xl overflow-y-auto">
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{saved ? `${q === 0 ? "Impegno liberato per" : "Materiale riservato a"} ${orderCode}. La giacenza fisica non cambia.` : "Riserva il materiale a una commessa: resta nel deposito e viene sottratto alla disponibilità libera."}</DialogDescription></DialogHeader>
      {!review && !saved && <div className="space-y-4">
        <div className="space-y-2"><Label htmlFor="reserve-stock">Articolo di magazzino</Label><Select value={stockId} onValueChange={(id) => { setStockId(id); setLineId(""); setQuantity(""); setError(null); }}><SelectTrigger id="reserve-stock"><SelectValue placeholder="Scegli un articolo" /></SelectTrigger><SelectContent>{items.map((row) => <SelectItem key={row.id} value={row.id}>{row.name}{warehouseNames[row.warehouse_id ?? ""] ? ` · ${warehouseNames[row.warehouse_id ?? ""]}` : ""}{row.internal_code ? ` · ${row.internal_code}` : ""}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Commessa</Label><OrderSelectCombobox companyId={companyId} value={orderId} ariaLabel="Commessa della prenotazione" filtroIniziale="all" onChange={(id, order) => { setOrderId(id); setOrderCode(order.order_code); setLineId(""); setQuantity(""); setError(null); }} /></div>
        {lines.data && lines.data.length > 1 && <div className="space-y-2"><Label htmlFor="reserve-line">Riga materiali della commessa</Label><Select value={lineId} onValueChange={(id) => { setLineId(id); setQuantity(""); }}><SelectTrigger id="reserve-line"><SelectValue placeholder="Scegli la riga da prenotare" /></SelectTrigger><SelectContent>{lines.data.map((row) => <SelectItem key={row.id} value={row.id}>{row.name} · {fmt(Number(row.quantity))} {item?.unita_misura}</SelectItem>)}</SelectContent></Select></div>}
        {!!orderId && !!stockId && lines.data?.length === 0 && !lines.isLoading && <p className="rounded-lg border p-3 text-sm">Questo articolo non è ancora nei materiali della commessa. <Link className="text-primary underline" to={`/azienda/ordini/${orderId}`}>Apri la commessa e associalo alla riga materiali</Link>, poi riapri la prenotazione.</p>}
        {quantityProblem && <p role="status" className="text-sm text-amber-800">{quantityProblem}</p>}
        {line && <div className="space-y-2"><Label htmlFor="reserve-quantity">Totale da tenere prenotato ({item?.unita_misura || "unità"})</Label><Input id="reserve-quantity" inputMode={whole ? "numeric" : "decimal"} value={quantity} onChange={(e) => { setQuantity(e.target.value); setError(null); }} aria-invalid={!!quantityProblem} placeholder="Inserisci la quantità" aria-describedby="reserve-quantity-help" /><p id="reserve-quantity-help" className="text-xs text-muted-foreground">Già prenotati su questa riga: {fmt(ownReserved)}. Massimo prenotabile: {fmt(maxQuantity)}. Inserisci 0 per liberare l’impegno.{whole ? " Per questo articolo servono quantità intere." : " Sono ammesse quantità frazionarie."}</p></div>}
      </div>}
      {loading && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Verifica quantità e materiali…</p>}
      {item && (!saved || (!stock.isFetching && !stock.isError)) && <div className="space-y-2 rounded-xl border bg-slate-50 p-4"><p className="font-medium">{item.name}{orderCode ? ` · ${orderCode}` : ""}</p><table className="w-full text-sm"><caption className="sr-only">Effetto della prenotazione sulle quantità</caption><thead><tr><th className="text-left">Quantità ({item.unita_misura || "unità"})</th><th className="text-right">{saved ? "Attuale" : "Prima"}</th>{!saved && q !== null && line && <th className="text-right">Dopo</th>}</tr></thead><tbody>{[["Giacenza", physical, physical], ["Impegnato", reserved, afterReserved], ["Disponibile", available, physical - afterReserved]].map(([label, before, after]) => <tr key={label}><th className="py-1 text-left font-normal">{label}</th><td className="text-right tabular-nums">{fmt(Number(before))}</td>{!saved && q !== null && line && <td className="text-right font-semibold tabular-nums">{fmt(Number(after))}</td>}</tr>)}</tbody></table></div>}
      {item?.tracking_mode === "serialized" && <p className="text-xs text-muted-foreground">La prenotazione riserva la quantità. Le matricole vengono verificate al prelievo.</p>}
      {protocol.data && !protocol.data.atomic_reservations && <Alert><AlertDescription>Il servizio non supporta ancora le prenotazioni protette. Nessuna quantità viene modificata.</AlertDescription></Alert>}
      {unavailable && <Alert variant="destructive"><AlertDescription>Non è possibile verificare quantità o materiali. <Button variant="outline" size="sm" onClick={() => { void stock.refetch(); void lines.refetch(); void returns.refetch(); void protocol.refetch(); }}>Riprova verifica</Button></AlertDescription></Alert>}
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {!canWrite && <p role="alert" className="text-sm text-destructive">Servono i permessi di modifica del Magazzino e delle commesse.</p>}
      <DialogFooter>{saved ? <Button onClick={onClose}>Chiudi</Button> : <><Button variant="outline" disabled={operation.isPending} onClick={() => review ? setReview(false) : onClose()}>{review ? "Modifica dati" : "Annulla"}</Button><Button disabled={!valid || operation.isPending} onClick={() => review ? void confirm() : setReview(true)}>{operation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{review ? "Conferma prenotazione" : "Controlla prenotazione"}</Button></>}</DialogFooter>
    </DialogContent>
  </Dialog>;
}

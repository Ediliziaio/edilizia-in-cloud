import { useRef, useState, useSyncExternalStore } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { queryKeys } from "@/lib/queryKeys";
import { refreshMaterialQueries } from "@/lib/orders/refreshMaterialQueries";
import { WAREHOUSE_REQUEST_CHANGED, warehouseResponseVerified, WarehouseRequestSlot, warehouseRequestScope, warehouseRequestStorage, warehouseRpc, type PendingWarehouseRequest } from "@/lib/magazzino/protocolloMovimenti";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const operations = [
  { operation: "reserve", label: "Prenotazione per commessa", rpc: "warehouse_reserve_v2" },
  { operation: "reserve-operation-material", label: "Riserva materiali della generale", rpc: "commessa_riserva_materiale" },
  { operation: "oda-receive", label: "Ricezione da ODA", rpc: "warehouse_receive_oda_v3" },
  { operation: "goods-receive", label: "Ricezione merce", rpc: "warehouse_goods_receipt_v3" },
  { operation: "import", label: "Importazione articoli", rpc: "warehouse_import_stock_v3" },
  { operation: "carico", label: "Carico merce", rpc: "warehouse_register_carico_v2" },
  { operation: "uscita", label: "Prelievo / uscita merce", rpc: "warehouse_register_uscita_v2" },
  { operation: "reso", label: "Reso da cantiere", rpc: "warehouse_return_material_v2" },
  { operation: "transfer", label: "Trasferimento tra magazzini", rpc: "warehouse_transfer_v3" },
  { operation: "inventory-count", label: "Conteggio inventario", rpc: "warehouse_inventory_count_v3" },
  { operation: "inventory-apply", label: "Rettifica inventario", rpc: "warehouse_inventory_apply_v3" },
  { operation: "reorder", label: "Bozza di riordino", rpc: "warehouse_reorder_v3" },
] as const;
interface Recovery extends PendingWarehouseRequest { operation: string; label: string; rpc: string; scope: string }
function subscribe(listener: () => void) {
  window.addEventListener(WAREHOUSE_REQUEST_CHANGED, listener);
  window.addEventListener("storage", listener);
  window.addEventListener("focus", listener);
  return () => {
    window.removeEventListener(WAREHOUSE_REQUEST_CHANGED, listener);
    window.removeEventListener("storage", listener);
    window.removeEventListener("focus", listener);
  };
}
/** Riapre la richiesta confermata, anche quando il popup o la pagina sono stati chiusi.
 * Non inventa una seconda operazione: ripete dati e chiave originali alla stessa RPC.
 */
export function WarehousePendingOperations() {
  const { effectiveCompany, user } = useAuth();
  return effectiveCompany?.id && user?.id ? <PendingOperationsSession key={`${effectiveCompany.id}:${user.id}`} /> : null;
}
function PendingOperationsSession() {
  const t = useT();
  const { effectiveCompany, user } = useAuth();
  const permissions = usePermissions();
  const qc = useQueryClient();
  const flight = useRef(false);
  const [selected, setSelected] = useState<Recovery | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<string | null>(null);
  const snapshot = useSyncExternalStore(subscribe, () => JSON.stringify(!effectiveCompany?.id || !user?.id ? [] : operations.flatMap(operation => {
    const scope = warehouseRequestScope(effectiveCompany.id, user.id, operation.operation);
    const pending = new WarehouseRequestSlot(scope, warehouseRequestStorage()).pendingRequest();
    return pending ? [{ ...operation, scope, ...pending }] : [];
  })), () => "[]");
  const pending = JSON.parse(snapshot) as Recovery[];
  const canRecover = (r: Recovery) => !permissions.isLoading && permissions.canEditWarehouse
    && (!["reso", "reserve", "reserve-operation-material"].includes(r.operation) || permissions.canEditOrders)
    && (r.operation !== "reorder" || permissions.canManagePurchasing)
    && (r.operation !== "carico" || !(r.payload.p_scans as Array<{ company_cost?: unknown }> | undefined)?.[0]?.company_cost || permissions.canViewCosts);
  async function recover() {
    if (!selected || flight.current || !canRecover(selected)) return;
    flight.current = true; setBusy(true); setError(null);
    const slot = new WarehouseRequestSlot(selected.scope, warehouseRequestStorage());
    try {
      if (slot.pendingRequest()?.id !== selected.id) throw new Error(t("Questa richiesta è già stata verificata. Aggiorna l’elenco."));
      const result = await warehouseRpc(selected.rpc, { ...selected.payload, p_request_id: selected.id });
      if (result.error) throw result.error;
      if (!warehouseResponseVerified(selected.operation, result.data, selected.payload)) throw new Error(t("La risposta non è ancora verificabile. I dati della richiesta restano conservati."));
      slot.succeeded(); setResolved(selected.label); setSelected(null);
      if (selected.operation === "reserve-operation-material") refreshMaterialQueries(qc);
      for (const key of [queryKeys.warehouse.all, ["warehouse-stock"], ["warehouse-uscite"], ["warehouse-movements"], ["stock-movements"], ["warehouse-transfers"], ["magazzino-live"], ["purchase-orders"], ["order-items"], ["uscita-order-items-prefill"], ["consumi-materiali"], ["materiali-per-fase"], ["order-material-usage"]]) void qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      setError((e as Error).message || t("Operazione non verificata. Riprova senza registrare una nuova richiesta."));
    } finally { flight.current = false; setBusy(false); }
  }
  if (!pending.length && !resolved) return null;
  return <>
    <section aria-label={t("Operazioni da verificare")} className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 print:hidden">
      {pending.length > 0 && <>
        <h2 className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />{t("Operazioni da verificare")}</h2>
        <p className="mt-1 text-sm">{t("Una registrazione non ha ancora un esito confermato. Verificala prima di ripetere il lavoro.")}</p>
        <ul className="mt-3 space-y-2">{pending.map(r => <li key={r.scope} className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium">{t(r.label)}</span><Button size="sm" variant="outline" disabled={!canRecover(r) || busy} onClick={() => { setError(null); setSelected(r); }}>{t("Verifica {label}", { label: t(r.label).toLocaleLowerCase("it-IT") })}</Button></li>)}</ul>
      </>}
      {resolved && <p role="status" className="mt-2 flex items-center gap-2 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4" />{t("{operazione}: registrazione verificata. Consulta l’elenco aggiornato.", { operazione: t(resolved) })}</p>}
    </section>
    <Dialog open={!!selected} onOpenChange={open => { if (!open && !busy) setSelected(null); }}>
      <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{t("Verifica la registrazione precedente")}</DialogTitle><DialogDescription>{t("{label}. Recuperiamo i dati che avevi già confermato: se la registrazione è già presente, non viene ripetuta; se manca, viene completata.", { label: selected ? t(selected.label) : "" })}</DialogDescription></DialogHeader>
        <p className="text-sm">{t("Dopo la verifica controlla il risultato nell’elenco e nello storico del Magazzino.")}</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setSelected(null)}>{t("Chiudi")}</Button><Button disabled={busy || !selected || !canRecover(selected)} onClick={() => void recover()}>{busy ? t("Verifica in corso…") : t("Verifica / completa registrazione")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

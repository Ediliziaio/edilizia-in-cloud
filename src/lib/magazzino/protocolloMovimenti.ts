import { supabase } from "@/integrations/supabase/client";

export interface WarehouseCapabilities {
  version: 1 | 2 | 3;
  atomic_reservations?: boolean;
  atomic_transfers?: boolean;
  atomic_import?: boolean;
  idempotent_oda_receipts?: boolean;
  idempotent_goods_receipts?: boolean;
  inventory_counts?: boolean;
  reorder?: boolean;
  idempotent_uscite?: boolean;
  idempotent_carichi?: boolean;
  atomic_company_cost?: boolean;
  fractional_returns?: boolean;
  serial_returns?: boolean;
}

type RpcError = { code?: string; message: string; details?: string; hint?: string };
type WarehouseRpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: RpcError | null }>;
export const warehouseRpc: WarehouseRpc = (nome, parametri) => (supabase.rpc as unknown as WarehouseRpc)(nome, parametri);

/** Le richieste di prova non possono bloccare o riusare richieste del gestionale. */
export function warehouseRequestScope(companyId: string | undefined, actorId: string | undefined, operation: string): string {
  const local = import.meta.env.DEV && typeof window !== "undefined" && ["127.0.0.1", "localhost", "::1"].includes(window.location.hostname)
    && warehouseRequestStorage()?.getItem("eic-magazzino-local-preview") === "1";
  return `${local ? "warehouse-local-request" : "warehouse-request"}:${companyId}:${actorId}:${operation}`;
}

/** Solo una funzione assente significa servizio precedente. Errori di rete o permessi si propagano. */
export async function warehouseCapabilities(companyId: string): Promise<WarehouseCapabilities> {
  const { data, error } = await warehouseRpc("warehouse_capabilities_v2", { p_company_id: companyId });
  if (error) {
    if (["PGRST202", "42883"].includes(error.code ?? "") && /warehouse_capabilities_v2/.test(error.message)) return { version: 1 };
    throw error;
  }
  const capabilities = data as WarehouseCapabilities | null;
  if (capabilities?.version !== 2 && capabilities?.version !== 3) throw new Error("Impossibile verificare le funzioni del magazzino. Riprova senza registrare un nuovo movimento.");
  return capabilities;
}

export function movementOutcomeUnknown(error: unknown): boolean {
  const e = error as { code?: string; message?: string };
  // Anche cancellazione e problemi gateway possono arrivare dopo il commit.
  return !e?.code || /^(08|57|PGRST00)/.test(e.code) || /fetch|network|timeout|timed out|connessione|esito .*non disponibile/i.test(e.message ?? "");
}

export interface PendingWarehouseRequest { id: string; payload: Record<string, unknown> }
interface PendingOperation { id: string; payload: string; uncertain: boolean }
const pendingMemory = new Map<string, PendingOperation>();
export const WAREHOUSE_REQUEST_CHANGED = "warehouse-request-changed";
export function warehouseRequestStorage(): Storage | undefined {
  try { return typeof window === "undefined" ? undefined : window.sessionStorage; } catch { return undefined; }
}
/** La chiave e i dati confermati restano recuperabili dopo la chiusura del popup.
 * Ogni istanza rilegge lo storage: un recupero eseguito altrove sblocca anche gli
 * hook già montati. Senza storage resta una protezione in memoria nella pagina.
 */
export class WarehouseRequestSlot {
  private pending: PendingOperation | null = null;
  constructor(private scope: string, private storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">) { this.restore(); }
  private restore() {
    this.pending = pendingMemory.get(this.scope) ?? null;
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(this.scope);
      const value = raw ? JSON.parse(raw) as Partial<PendingOperation> : null;
      this.pending = value && typeof value.id === "string" && typeof value.payload === "string"
        ? { id: value.id, payload: value.payload, uncertain: value.uncertain === true } : null;
      if (this.pending) pendingMemory.set(this.scope, this.pending); else pendingMemory.delete(this.scope);
    } catch { /* mantieni l'identità in memoria se lo storage non è disponibile */ }
  }
  private persist() {
    if (this.pending) pendingMemory.set(this.scope, this.pending); else pendingMemory.delete(this.scope);
    try { if (this.pending) this.storage?.setItem(this.scope, JSON.stringify(this.pending)); else this.storage?.removeItem(this.scope); } catch { /* protezione in memoria */ }
    if (typeof window !== "undefined") window.dispatchEvent(new Event(WAREHOUSE_REQUEST_CHANGED));
  }
  request(payload: unknown): string {
    this.restore();
    const value = JSON.stringify(payload);
    if (this.pending?.payload !== value) {
      if (this.pending?.uncertain) throw new Error("Una richiesta precedente ha esito da verificare. Usa ‘Operazioni da verificare’ nel Magazzino prima di registrarne un’altra.");
      this.pending = { id: crypto.randomUUID(), payload: value, uncertain: true };
    }
    this.pending!.uncertain = true; this.persist();
    return this.pending!.id;
  }
  pendingRequest(): PendingWarehouseRequest | null {
    this.restore();
    if (!this.pending) return null;
    try {
      const payload: unknown = JSON.parse(this.pending.payload);
      return payload && typeof payload === "object" && !Array.isArray(payload) ? { id: this.pending.id, payload: payload as Record<string, unknown> } : null;
    } catch { return null; }
  }
  hasPending() { this.restore(); return !!this.pending; }
  succeeded() { this.pending = null; this.persist(); }
  failed(error: unknown) { if (!movementOutcomeUnknown(error)) this.succeeded(); }
}

/** Una risposta non nulla può comunque essere incompleta: non liberare la chiave. */
export function warehouseResponseVerified(operation: string, response: unknown, payload?: Record<string, unknown>): boolean {
  const data = Array.isArray(response) ? response[0] : response;
  if (!data || typeof data !== "object") return false;
  const row = data as Record<string, unknown>;
  const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  switch (operation) {
    case "oda-receive": return count(row.shipped_items) && count(row.created_units) && typeof row.oda_now_complete === "boolean" && Array.isArray(row.errors);
    case "goods-receive": return typeof row.receipt_id === "string" && /^[0-9a-f-]{36}$/i.test(row.receipt_id);
    case "carico": {
      const scans = payload?.p_scans as Array<{ company_cost?: unknown }> | undefined;
      return count(row.created_movements) && count(row.created_units) && Array.isArray(row.errors)
        && (!scans?.[0]?.company_cost || (typeof row.company_cost_id === "string" && /^[0-9a-f-]{36}$/i.test(row.company_cost_id) && typeof row.company_cost_amount === "number" && row.company_cost_amount > 0));
    }
    case "uscita": return typeof row.uscita_id === "string" && typeof row.numero === "string" && count(row.created_movements);
    case "reserve-operation-material":
    case "reserve": return typeof row.order_item_id === "string" && /^[0-9a-f-]{36}$/i.test(row.order_item_id)
      && typeof row.reserved === "number" && Number.isFinite(row.reserved) && row.reserved >= 0
      && (!payload || (row.order_item_id === payload.p_order_item_id && row.reserved === payload.p_quantity));
    case "reso": return typeof row.quantita === "number" && Number.isFinite(row.quantita) && row.quantita > 0;
    case "transfer": return typeof row.transfer_id === "string" && row.status === "ricevuto";
    case "inventory-count": return typeof row.id === "string" && typeof row.difference === "number" && Number.isFinite(row.difference);
    case "inventory-apply": return typeof row.id === "string" && row.adjustment_applied === true;
    case "import": return count(row.inserted);
    case "reorder": return count(row.righe) && Array.isArray(row.gia_in_ordine) && (row.righe === 0 || (typeof row.purchase_order_id === "string" && typeof row.oda_number === "string"));
    default: return false;
  }
}

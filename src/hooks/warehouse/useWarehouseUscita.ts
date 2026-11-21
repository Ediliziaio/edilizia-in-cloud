/**
 * useWarehouseUscita — uscita merce a 2 FASI (doppio controllo).
 *
 *  Fase 1 (useRegisterUscita): registra l'uscita → RPC register_warehouse_uscita
 *    (scarico movimenti + giacenza + seriali). Nessun DDT.
 *  Fase 2 (useCreateDdtFromUscita): dall'uscita registrata genera il DDT bozza
 *    → RPC create_ddt_from_uscita.
 *  useWarehouseUscite: elenco uscite (per la sezione "Uscite" del magazzino).
 *
 * Destinatario: cliente (customers) | cantiere (orders) | libero (manuale).
 * I tipi delle nuove tabelle/RPC non sono ancora in types.ts → cast mirati.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { warehouseCapabilities, warehouseRpc, warehouseRequestScope, warehouseRequestStorage, WarehouseRequestSlot } from "@/lib/magazzino/protocolloMovimenti";
import { queryKeys } from "@/lib/queryKeys";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import type { ClienteSnapshot } from "@/types/fatturazione";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export interface UscitaScan {
  stock_item_id: string;
  quantity: number;
  serial_numbers?: string[];
  raw_code?: string;
}

export interface UscitaDestinatario {
  tipo: "cliente" | "cantiere" | "libero";
  customer_id?: string | null;
  order_id?: string | null;
  /** Per 'libero': dati digitati a mano. */
  libero?: { ragione_sociale?: string; indirizzo?: string; partita_iva?: string } | null;
  /** Snapshot anagrafico per il DDT (compilato dal cliente o dai dati liberi). */
  cliente_snapshot?: Partial<ClienteSnapshot> | null;
}

export type VettoreJson =
  | { tipo: "mittente" }
  | { tipo: "subappaltatore"; subappaltatore_id: string; ragione_sociale?: string; vat_number?: string; conducente_nome?: string; conducente_telefono?: string }
  | { tipo: "terzo"; ragione_sociale: string; vat_number?: string | null; address?: string | null };

export interface UscitaRow {
  id: string;
  numero: string;
  data: string;
  destinatario_tipo: "cliente" | "cantiere" | "libero";
  customer_id: string | null;
  order_id: string | null;
  destinatario_libero: { ragione_sociale?: string } | null;
  cliente_snapshot: Partial<ClienteSnapshot> | null;
  vettore: VettoreJson | null;
  righe: Array<{
    descrizione: string;
    quantita: number;
    prezzo_unitario?: number | null;
    imponibile?: number | null;
    totale_riga?: number | null;
  }>;
  stato: "registrata" | "ddt_creato" | "annullata";
  documento_id: string | null;
  note: string | null;
  warehouse_id: string | null;
  created_at: string;
}

/** Valore netto fotografato nell'uscita; compatibile anche con righe storiche. */
export function valoreUscita(righe: UscitaRow["righe"] | null | undefined): number {
  return (righe ?? []).reduce((totale, riga) => {
    const imponibile = Number(riga.imponibile ?? riga.totale_riga);
    if (Number.isFinite(imponibile)) return totale + imponibile;
    const quantita = Number(riga.quantita ?? 0);
    const prezzo = Number(riga.prezzo_unitario ?? 0);
    return totale + (Number.isFinite(quantita) ? quantita : 0) * (Number.isFinite(prezzo) ? prezzo : 0);
  }, 0);
}

/** Fase 1 — registra l'uscita (nessun DDT). */
export function useRegisterUscita() {
  const { effectiveCompany, user } = useAuth();
  const slots = useRef(new Map<string, WarehouseRequestSlot>());
  const [recoverableScope, setRecoverableScope] = useState<string | null>(null);
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (args: {
      warehouseId: string;
      destinatario: UscitaDestinatario;
      scans: UscitaScan[];
      vettore?: VettoreJson | null;
      note?: string | null;
    }) => {
      if (!effectiveCompany?.id) throw new Error("Seleziona un’azienda.");
      const protocol = await warehouseCapabilities(effectiveCompany.id);
      const payload = {
        p_warehouse_id: args.warehouseId, p_destinatario: args.destinatario, p_scans: args.scans,
        p_vettore: args.vettore ?? null, p_note: args.note ?? null,
      };
      const scope = warehouseRequestScope(effectiveCompany.id, user?.id, "uscita");
      if (!slots.current.has(scope)) slots.current.set(scope, new WarehouseRequestSlot(scope, warehouseRequestStorage()));
      const slot = slots.current.get(scope)!;
      const version2 = protocol.version >= 2 && protocol.idempotent_uscite;
      let row;
      try {
        const { data, error } = await warehouseRpc(version2 ? "warehouse_register_uscita_v2" : "register_warehouse_uscita",
          version2 ? { ...payload, p_request_id: slot.request(payload) } : payload);
        if (error) throw error;
        row = Array.isArray(data) ? data[0] : data;
        if (!row?.uscita_id || !row?.numero) throw new Error("Esito uscita non disponibile. Controlla il registro prima di riprovare.");
        if (version2) { slot.succeeded(); setRecoverableScope(null); }
      } catch (error) {
        if (version2) { slot.failed(error); setRecoverableScope(slot.hasPending() ? scope : null); }
        throw error;
      }
      return row as { uscita_id: string; numero: string; created_movements: number; updated_units: number; errors: unknown[] };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.warehouse.all });
      qc.invalidateQueries({ queryKey: ["warehouse-uscite"] });
      qc.invalidateQueries({ queryKey: ["warehouse-stock"] });
      qc.invalidateQueries({ queryKey: ["warehouse-movements"] });
      if (effectiveCompany?.id) void qc.invalidateQueries({ queryKey: queryKeys.warehouse.movementsRegistry(effectiveCompany.id) });
      qc.invalidateQueries({ queryKey: ["order-material-usage"] });
      qc.invalidateQueries({ queryKey: ["warehouse-uscite-order"] });
    },
  });
  const scope = warehouseRequestScope(effectiveCompany?.id, user?.id, "uscita");
  return { ...mutation, canReplay: recoverableScope === scope };
}

/** Fase 2 — dall'uscita genera il DDT bozza. */
export function useCreateDdtFromUscita() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { uscitaId: string; ddtExtra?: Record<string, unknown> | null }) => {
      const { data, error } = await sb.rpc("create_ddt_from_uscita", {
        p_uscita_id: args.uscitaId,
        p_ddt_extra: args.ddtExtra ?? null,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || typeof row.documento_id !== "string" || typeof row.numero_ddt !== "string"
        || !row.documento_id.trim() || !row.numero_ddt.trim()) {
        throw new Error("Esito DDT non verificato. Controlla l’uscita prima di riprovare: la stessa uscita riapre il documento già creato.");
      }
      return row as { documento_id: string; numero_ddt: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouse-uscite"] });
      qc.invalidateQueries({ queryKey: queryKeys.documentiFiscali.all });
    },
  });
}

/** Elenco uscite (per la sezione "Uscite"). */
export function useWarehouseUscite(warehouseFilter: string | null) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["warehouse-uscite", companyId, warehouseFilter ?? "*"],
    enabled: !!companyId,
    queryFn: async () => {
      let q = sb
        .from("warehouse_uscite")
        .select("id,numero,data,destinatario_tipo,customer_id,order_id,destinatario_libero,cliente_snapshot,vettore,righe,stato,documento_id,note,warehouse_id,created_at")
        // Solo QUESTA azienda: senza, il super admin (e chi ha più aziende)
        // vedeva le uscite di tutte insieme.
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (warehouseFilter) q = q.eq("warehouse_id", warehouseFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as UscitaRow[];
    },
  });
}

/** Uscite registrate per una specifica commessa/ordine (per il dettaglio commessa). */
export function useUsciteByOrder(orderId: string | undefined) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["warehouse-uscite-order", orderId ?? "*", companyId],
    enabled: !!orderId && !!companyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("warehouse_uscite")
        .select("id,numero,data,destinatario_tipo,customer_id,order_id,destinatario_libero,cliente_snapshot,vettore,righe,stato,documento_id,note,warehouse_id,created_at")
        .eq("order_id", orderId)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as UscitaRow[];
    },
  });
}

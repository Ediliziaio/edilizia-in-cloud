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
import { supabase } from "@/integrations/supabase/client";
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
  righe: Array<{ descrizione: string; quantita: number }>;
  stato: "registrata" | "ddt_creato" | "annullata";
  documento_id: string | null;
  note: string | null;
  warehouse_id: string | null;
  created_at: string;
}

/** Fase 1 — registra l'uscita (nessun DDT). */
export function useRegisterUscita() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      warehouseId: string;
      destinatario: UscitaDestinatario;
      scans: UscitaScan[];
      vettore?: VettoreJson | null;
      note?: string | null;
    }) => {
      const { data, error } = await sb.rpc("register_warehouse_uscita", {
        p_warehouse_id: args.warehouseId,
        p_destinatario: args.destinatario,
        p_scans: args.scans,
        p_vettore: args.vettore ?? null,
        p_note: args.note ?? null,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row as { uscita_id: string; numero: string; created_movements: number; updated_units: number; errors: unknown[] };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouse-uscite"] });
      qc.invalidateQueries({ queryKey: ["warehouse-stock"] });
      qc.invalidateQueries({ queryKey: ["warehouse-movements"] });
    },
  });
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
      return row as { documento_id: string; numero_ddt: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouse-uscite"] });
    },
  });
}

/** Elenco uscite (per la sezione "Uscite"). */
export function useWarehouseUscite(warehouseFilter: string | null) {
  return useQuery({
    queryKey: ["warehouse-uscite", warehouseFilter ?? "*"],
    queryFn: async () => {
      let q = sb
        .from("warehouse_uscite")
        .select("id,numero,data,destinatario_tipo,customer_id,order_id,destinatario_libero,cliente_snapshot,vettore,righe,stato,documento_id,note,warehouse_id,created_at")
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
  return useQuery({
    queryKey: ["warehouse-uscite-order", orderId ?? "*"],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("warehouse_uscite")
        .select("id,numero,data,destinatario_tipo,customer_id,order_id,destinatario_libero,cliente_snapshot,vettore,righe,stato,documento_id,note,warehouse_id,created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as UscitaRow[];
    },
  });
}

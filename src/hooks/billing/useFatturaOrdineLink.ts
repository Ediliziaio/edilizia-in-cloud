import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";

// ─── Types ────────────────────────────────────────────────────

export interface FatturaOrdineLink {
  id: string;
  company_id: string;
  fattura_id: string;
  ordine_id: string;
  importo_associato: number | null;
  note: string | null;
  created_at: string;
}

interface OrderJoined {
  id: string;
  order_code: string | null;
  description: string;
  total_amount: number;
  customer: { id: string; first_name: string; last_name: string } | null;
}

interface FatturaJoined {
  id: string;
  numero: string;
  data_emissione: string;
  stato: string;
  tipo: string;
  totale_da_pagare: number;
}

// ─── Ordini collegati a una fattura ───────────────────────────

export function useOrdiniByFattura(fatturaId: string | undefined) {
  return useQuery({
    queryKey: ["fattura-ordini", fatturaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fattura_ordine" as never)
        .select("id, importo_associato, note, ordine_id")
        .eq("fattura_id", fatturaId!);
      if (error) throw error;

      // Fetch orders separately (junction table join may not work with `as never`)
      const ordineIds = ((data as any[]) ?? []).map((d: any) => d.ordine_id);
      if (ordineIds.length === 0) return [];

      const { data: orders, error: ordErr } = await supabase
        .from("orders")
        .select("id, order_code, description, total_amount, customer:profiles!orders_customer_id_fkey(id, first_name, last_name)")
        .in("id", ordineIds);
      if (ordErr) throw ordErr;

      const ordersMap = new Map((orders ?? []).map((o: any) => [o.id, o]));
      return ((data as any[]) ?? []).map((link: any) => ({
        ...link,
        ordine: ordersMap.get(link.ordine_id) as OrderJoined | undefined,
      }));
    },
    enabled: !!fatturaId,
  });
}

// ─── Fatture collegate a un ordine ────────────────────────────

export function useFattureByOrdine(ordineId: string | undefined) {
  return useQuery({
    queryKey: ["ordine-fatture", ordineId],
    queryFn: async () => {
      // From junction table
      const { data: junctionData, error: jErr } = await supabase
        .from("fattura_ordine" as never)
        .select("id, importo_associato, fattura_id")
        .eq("ordine_id", ordineId!);
      if (jErr) throw jErr;

      // From direct ordine_id shortcut
      const { data: directData, error: dErr } = await supabase
        .from("documenti_fiscali" as never)
        .select("id, numero, data_emissione, stato, tipo, totale_da_pagare")
        .eq("ordine_id", ordineId!);
      if (dErr) throw dErr;

      // Fetch fatture from junction
      const junctionFatturaIds = ((junctionData as any[]) ?? []).map((j: any) => j.fattura_id);
      let junctionFatture: any[] = [];
      if (junctionFatturaIds.length > 0) {
        const { data: fData } = await supabase
          .from("documenti_fiscali" as never)
          .select("id, numero, data_emissione, stato, tipo, totale_da_pagare")
          .in("id", junctionFatturaIds);
        junctionFatture = (fData as any[]) ?? [];
      }

      // Merge and dedup
      const allFatture = new Map<string, FatturaJoined>();
      for (const f of junctionFatture) allFatture.set(f.id, f);
      for (const f of (directData as any[]) ?? []) allFatture.set(f.id, f);

      return Array.from(allFatture.values());
    },
    enabled: !!ordineId,
  });
}

// ─── Link fattura ↔ ordine ────────────────────────────────────

export function useLinkFatturaOrdine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      fatturaId,
      ordineId,
      importoAssociato,
      companyId,
    }: {
      fatturaId: string;
      ordineId: string;
      importoAssociato?: number;
      companyId: string;
    }) => {
      // Check if any links already exist
      const { count } = await supabase
        .from("fattura_ordine" as never)
        .select("id", { count: "exact", head: true })
        .eq("fattura_id", fatturaId);

      // Insert junction row
      const { error } = await supabase.from("fattura_ordine" as never).insert({
        company_id: companyId,
        fattura_id: fatturaId,
        ordine_id: ordineId,
        importo_associato: importoAssociato ?? null,
      } as never);
      if (error) throw error;

      // If first link, also set shortcut
      if ((count ?? 0) === 0) {
        await supabase
          .from("documenti_fiscali" as never)
          .update({ ordine_id: ordineId } as never)
          .eq("id", fatturaId);
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["fattura-ordini", vars.fatturaId] });
      qc.invalidateQueries({ queryKey: ["ordine-fatture", vars.ordineId] });
      qc.invalidateQueries({ queryKey: queryKeys.documentiFiscali.all });
    },
  });
}

// ─── Unlink ───────────────────────────────────────────────────

export function useUnlinkFatturaOrdine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      fatturaId,
      ordineId,
    }: {
      fatturaId: string;
      ordineId: string;
    }) => {
      const { error } = await supabase
        .from("fattura_ordine" as never)
        .delete()
        .eq("fattura_id", fatturaId)
        .eq("ordine_id", ordineId);
      if (error) throw error;

      // Clear shortcut if it matches
      await supabase
        .from("documenti_fiscali" as never)
        .update({ ordine_id: null } as never)
        .eq("id", fatturaId)
        .eq("ordine_id", ordineId);
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["fattura-ordini", vars.fatturaId] });
      qc.invalidateQueries({ queryKey: ["ordine-fatture", vars.ordineId] });
      qc.invalidateQueries({ queryKey: queryKeys.documentiFiscali.all });
    },
  });
}

// ─── Search orders for linking ────────────────────────────────

export function useSearchOrders(companyId: string | null, search: string) {
  return useQuery({
    queryKey: ["orders-search-for-link", companyId, search],
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select("id, order_code, description, total_amount, customer:profiles!orders_customer_id_fkey(id, first_name, last_name)")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(20);

      if (search) {
        query = query.or(`order_code.ilike.%${search}%,description.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as OrderJoined[];
    },
    enabled: !!companyId,
  });
}

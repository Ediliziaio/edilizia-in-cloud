import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { DEFAULT_SCENARI } from "@/lib/simulatore/tipi";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = () => supabase as any;
export interface SimulazioneRow {
  id: string; company_id: string; nome: string; contact_id: string | null;
  stato: string; is_template: boolean;
  costo_totale: number; ricavo_imponibile: number; margine_valore: number; margine_pct: number;
  iva_totale: number; prezzo_cliente: number; rata_mensile: number | null;
  voci: unknown; fasi: unknown; scenari: unknown; note: string | null;
  created_at: string; updated_at: string;
}

export function useSimulazioni(opts: { template?: boolean } = {}) {
  const companyId = useEffectiveCompanyId();
  return useQuery<SimulazioneRow[]>({
    queryKey: ["simulazioni", companyId, opts.template ?? null],
    enabled: !!companyId,
    queryFn: async () => {
      let q = sb().from("simulazioni").select("*").eq("company_id", companyId).order("updated_at", { ascending: false });
      if (opts.template !== undefined) q = q.eq("is_template", opts.template);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as SimulazioneRow[];
    },
    staleTime: 60_000,
  });
}

/**
 * useContattiLite — risolve un set di `contact_id` → { id, nome } leggibile.
 *
 * Usato dalla lista (card → nome cliente) e dall'editor (testata) per mostrare
 * il nome del contatto collegato senza un join nella query principale. Batch
 * unico per gli id non nulli; nome = "Nome Cognome" || email || "—".
 */
export function useContattiLite(ids: (string | null | undefined)[]) {
  const companyId = useEffectiveCompanyId();
  const uniqueIds = Array.from(new Set(ids.filter((x): x is string => !!x))).sort();
  return useQuery<Record<string, string>>({
    queryKey: ["simulazioni-contatti-lite", companyId, uniqueIds],
    enabled: !!companyId && uniqueIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await sb()
        .from("marketing_contacts")
        .select("id, first_name, last_name, email")
        .eq("company_id", companyId)
        .in("id", uniqueIds);
      if (error) throw new Error(error.message);
      const map: Record<string, string> = {};
      for (const c of (data ?? []) as Array<{
        id: string; first_name: string | null; last_name: string | null; email: string | null;
      }>) {
        map[c.id] = `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.email || "—";
      }
      return map;
    },
  });
}

export function useSimulazione(id: string | null) {
  const companyId = useEffectiveCompanyId();
  return useQuery<SimulazioneRow | null>({
    queryKey: ["simulazione", id, companyId],
    enabled: !!id && !!companyId,
    queryFn: async () => {
      const { data, error } = await sb().from("simulazioni").select("*").eq("id", id).eq("company_id", companyId).maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as SimulazioneRow | null;
    },
  });
}

export function useSimulazioniMutations() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["simulazioni"] });
  const create = useMutation({
    mutationFn: async (input: { nome: string; contact_id?: string | null }) => {
      if (!companyId) throw new Error("Nessuna azienda");
      const { data, error } = await sb().from("simulazioni").insert({
        company_id: companyId, nome: input.nome, contact_id: input.contact_id ?? null,
        voci: [], fasi: [], scenari: DEFAULT_SCENARI,
      }).select("id").single();
      if (error) throw new Error(error.message);
      return data.id as string;
    },
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: async (params: { id: string; patch: Record<string, unknown> }) => {
      if (!companyId) throw new Error("Nessuna azienda");
      const { error } = await sb().from("simulazioni")
        .update({ ...params.patch, updated_at: new Date().toISOString() })
        .eq("id", params.id).eq("company_id", companyId);
      if (error) throw new Error(error.message);
    },
    // Solo la lista: NON invalidare ["simulazione", id] (la riga aperta
    // nell'editor), altrimenti ogni autosave ne forza il refetch mentre
    // l'utente digita — inutile, l'editor tiene lo stato locale.
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Nessuna azienda");
      const { error } = await sb().from("simulazioni").delete().eq("id", id).eq("company_id", companyId);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
  const duplicate = useMutation({
    mutationFn: async (row: SimulazioneRow & { as_template?: boolean }) => {
      if (!companyId) throw new Error("Nessuna azienda");
      const { id: _id, created_at: _created_at, updated_at: _updated_at, ...rest } = row;
      const { data, error } = await sb().from("simulazioni").insert({
        // La copia nasce sempre in bozza: non ereditare 'archiviata'/'finalizzata'.
        ...rest, company_id: companyId, nome: `${row.nome} (copia)`, stato: "bozza",
        is_template: row.as_template ?? row.is_template,
      }).select("id").single();
      if (error) throw new Error(error.message);
      return data.id as string;
    },
    onSuccess: invalidate,
  });
  return { create, update, remove, duplicate };
}

// src/hooks/useCommesseGenerali.ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isModelloGenerale, leggiRiepilogo, modelliValidi, type ModelloGenerale, type RiepilogoGenerale } from "@/lib/orders/commesseGenerali";

// Tabelle e RPC non sono ancora nei tipi generati: cast localizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const chiaviGenerali = {
  impostazioni: (companyId: string | undefined) => ["commesse-generali-impostazioni", companyId] as const,
  riepilogo: (generaleId: string | undefined) => ["commessa-generale-riepilogo", generaleId] as const,
  tutte: ["commessa-generale-riepilogo"] as const,
};

/** Il messaggio del database se è scritto per chi usa l'app; altrimenti uno generico. */
export function messaggioGenerale(e: unknown, cosa: string): string {
  const err = e as { code?: string; message?: string } | null;
  if (err?.code === "42501" || err?.code === "22023" || err?.code === "P0002" || err?.code === "23514") {
    return err.message ?? `Non è stato possibile salvare ${cosa}.`;
  }
  return `Non è stato possibile salvare ${cosa}. Riprova tra poco.`;
}

/**
 * Quali modelli di commessa generale ha acceso l'azienda. Senza scelta, o se la lettura
 * fallisce (tabella non ancora creata, rete): nessuno, cioè funzione spenta e niente di nuovo in giro.
 */
export function useImpostazioniCommesseGenerali() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: chiaviGenerali.impostazioni(companyId),
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ modelli: ModelloGenerale[]; disponibile: boolean; configurata: boolean }> => {
      try {
        const { data, error } = await db
          .from("company_commesse_generali_settings")
          .select("modelli_attivi")
          .eq("company_id", companyId!)
          .maybeSingle();
        if (error) throw error;
        return { modelli: modelliValidi(data?.modelli_attivi), disponibile: true, configurata: !!data };
      } catch {
        return { modelli: [], disponibile: false, configurata: false };
      }
    },
  });

  const salva = useMutation({
    mutationFn: async (modelli: ModelloGenerale[]) => {
      if (!companyId) throw new Error("Seleziona un’azienda prima di salvare.");
      const { data, error } = await db.rpc("commesse_generali_impostazioni_salva", { p_company_id: companyId, p_modelli: modelli });
      if (error) throw error;
      return modelliValidi(data);
    },
    onSuccess: (modelli) => {
      // La risposta contiene le scelte salvate: niente ritorno momentaneo ai valori di prima.
      qc.setQueryData(chiaviGenerali.impostazioni(companyId), { modelli, disponibile: true, configurata: true });
    },
  });

  return {
    modelli: query.data?.modelli ?? [],
    /** false = la funzione non c'è ancora sul database: la pagina lo dice invece di mostrare interruttori che non salvano. */
    disponibile: query.data?.disponibile ?? true,
    attiva: (query.data?.modelli.length ?? 0) > 0,
    /** L'azienda ha toccato almeno una volta questa impostazione: solo allora possono esistere generali. */
    configurata: query.data?.configurata ?? false,
    isLoading: query.isLoading,
    salva,
  };
}

/** Tutti i numeri di una generale in una lettura sola. */
export function useRiepilogoGenerale(generaleId: string | undefined) {
  return useQuery({
    queryKey: chiaviGenerali.riepilogo(generaleId),
    enabled: !!generaleId,
    staleTime: 30_000,
    queryFn: async (): Promise<RiepilogoGenerale> => {
      const { data, error } = await db.rpc("commessa_generale_riepilogo", { p_generale_id: generaleId });
      if (error) throw error;
      const r = leggiRiepilogo(data);
      if (!r) throw new Error("Commessa generale non trovata.");
      return r;
    },
  });
}

export interface NuovaGenerale {
  modello: ModelloGenerale;
  nome: string;
  clienteId: string | null;
  valore: number | null;
}

export function useCreaGenerale() {
  const { effectiveCompany } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: NuovaGenerale): Promise<string> => {
      if (!effectiveCompany?.id) throw new Error("Seleziona un’azienda prima di creare la commessa.");
      const { data, error } = await db.rpc("commessa_generale_crea", {
        p_company_id: effectiveCompany.id,
        p_modello: v.modello,
        p_nome: v.nome,
        p_cliente_id: v.clienteId,
        p_valore: v.valore,
        p_codice: null,
      });
      if (error) throw error;
      if (typeof data !== "string") throw new Error("La commessa generale non risulta creata. Ricarica la pagina.");
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

export function useAggiornaGenerale(generaleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { nome: string; valore: number | null; modello: ModelloGenerale }) => {
      const { error } = await db.rpc("commessa_generale_aggiorna", {
        p_generale_id: generaleId, p_nome: v.nome, p_valore: v.valore, p_modello: v.modello,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chiaviGenerali.riepilogo(generaleId) });
      void qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

/** Le commesse che si possono mettere dentro una generale: commesse normali dell'azienda, non cancellate. */
export function useCommesseCollegabili(generaleId: string | undefined, enabled: boolean) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: ["commesse-collegabili", companyId, generaleId],
    enabled: !!companyId && !!generaleId && enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await db
        .from("orders")
        .select("id, order_code, description, client_name, customer_id, total_amount, commessa_generale_id, created_at")
        .eq("company_id", companyId!)
        .eq("workflow_kind", "commessa")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return ((data ?? []) as {
        id: string; order_code: string | null; description: string | null; client_name: string | null;
        customer_id: string | null; total_amount: number | null; commessa_generale_id: string | null;
      }[]).filter((o) => o.commessa_generale_id !== generaleId);
    },
  });
}

export function useCollegaCommesse(generaleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (commesse: string[]): Promise<number> => {
      const { data, error } = await db.rpc("commessa_generale_collega", { p_generale_id: generaleId, p_commesse: commesse });
      if (error) throw error;
      return typeof data === "number" ? data : 0;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chiaviGenerali.riepilogo(generaleId) });
      void qc.invalidateQueries({ queryKey: ["commesse-collegabili"] });
      void qc.invalidateQueries({ queryKey: ["order-contract-link"] });
      void qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

export function useScollegaCommessa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (commessaId: string) => {
      const { error } = await db.rpc("commessa_generale_scollega", { p_commessa_id: commessaId });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chiaviGenerali.tutte });
      void qc.invalidateQueries({ queryKey: ["commesse-collegabili"] });
      void qc.invalidateQueries({ queryKey: ["order-contract-link"] });
      void qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

export interface MappaGenerali {
  /** Per ogni generale: quante commesse contiene. */
  figliePerGenerale: Map<string, number>;
  /** Per ogni commessa dentro una generale: il codice (o il nome) della generale. */
  generaleDellaFiglia: Map<string, { id: string; etichetta: string }>;
}

const MAPPA_VUOTA: MappaGenerali = { figliePerGenerale: new Map(), generaleDellaFiglia: new Map() };

/**
 * Per la lista commesse: chi è una generale e chi sta dentro quale. Una lettura sola e leggera;
 * nessuna per le aziende che non hanno mai acceso la funzione, e una lista vuota se fallisce.
 */
export function useMappaGenerali(): MappaGenerali {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const { configurata } = useImpostazioniCommesseGenerali();
  const { data } = useQuery({
    queryKey: ["mappa-commesse-generali", companyId],
    enabled: !!companyId && configurata,
    staleTime: 60_000,
    meta: { silent: true },
    queryFn: async (): Promise<MappaGenerali> => {
      try {
        const { data: righe, error } = await db
          .from("orders")
          .select("id, order_code, description, workflow_kind, commessa_generale_id")
          .eq("company_id", companyId!)
          .is("deleted_at", null)
          .or("workflow_kind.eq.generale,commessa_generale_id.not.is.null")
          .limit(5000);
        if (error) throw error;
        const lista = (righe ?? []) as { id: string; order_code: string | null; description: string | null; workflow_kind: string; commessa_generale_id: string | null }[];
        const generali = new Map(lista.filter((r) => r.workflow_kind === "generale").map((r) => [r.id, r.order_code || r.description || "Commessa generale"]));
        const figliePerGenerale = new Map<string, number>([...generali.keys()].map((id) => [id, 0]));
        const generaleDellaFiglia = new Map<string, { id: string; etichetta: string }>();
        for (const r of lista) {
          if (!r.commessa_generale_id || !generali.has(r.commessa_generale_id)) continue;
          figliePerGenerale.set(r.commessa_generale_id, (figliePerGenerale.get(r.commessa_generale_id) ?? 0) + 1);
          generaleDellaFiglia.set(r.id, { id: r.commessa_generale_id, etichetta: generali.get(r.commessa_generale_id)! });
        }
        return { figliePerGenerale, generaleDellaFiglia };
      } catch {
        return MAPPA_VUOTA;
      }
    },
  });
  return data ?? MAPPA_VUOTA;
}

export interface SorellaGenerale { id: string; codice: string | null; nome: string }
export interface GeneraleDi {
  id: string;
  codice: string | null;
  nome: string | null;
  modello: ModelloGenerale | null;
  /** Le commesse della stessa generale, in ordine di codice (compresa questa). */
  sorelle: SorellaGenerale[];
}

/**
 * In cima a una commessa che sta dentro una generale: la generale e le commesse sorelle,
 * per tornare indietro e passare da una all'altra. Letture semplici, senza «embed» tra orders e
 * orders (dipende dalla cache dello schema di PostgREST). Silenzioso se la lettura fallisce.
 */
export function useGeneraleDellaCommessa(orderId: string | undefined) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  // Senza la funzione mai accesa non esistono generali: nessuna lettura in più sulle commesse di tutti.
  const { configurata } = useImpostazioniCommesseGenerali();
  return useQuery({
    queryKey: ["generale-della-commessa", companyId, orderId],
    enabled: !!companyId && !!orderId && configurata,
    staleTime: 60_000,
    meta: { silent: true },
    queryFn: async (): Promise<GeneraleDi | null> => {
      try {
        const { data: figlia, error } = await db
          .from("orders").select("commessa_generale_id")
          .eq("id", orderId!).eq("company_id", companyId!).maybeSingle();
        const generaleId = figlia?.commessa_generale_id as string | null | undefined;
        if (error || !generaleId) return null;
        const [g, scheda, sorelle] = await Promise.all([
          db.from("orders").select("id, order_code, description").eq("id", generaleId).eq("company_id", companyId!).maybeSingle(),
          db.from("commesse_generali").select("modello").eq("order_id", generaleId).maybeSingle(),
          db.from("orders").select("id, order_code, description")
            .eq("company_id", companyId!).eq("commessa_generale_id", generaleId).is("deleted_at", null)
            .order("order_code", { ascending: true, nullsFirst: false }).limit(500),
        ]);
        if (g.error || !g.data) return null;
        const modello = scheda.data?.modello;
        return {
          id: g.data.id,
          codice: g.data.order_code ?? null,
          nome: g.data.description ?? null,
          modello: isModelloGenerale(modello) ? modello : null,
          sorelle: ((sorelle.data ?? []) as { id: string; order_code: string | null; description: string | null }[])
            .map((x) => ({ id: x.id, codice: x.order_code, nome: x.description || "Commessa senza nome" })),
        };
      } catch {
        return null;
      }
    },
  });
}

/** Gli id delle commesse generali dell'azienda (per non contarle tra i lavori). Vuoto se la lettura fallisce. */
export async function leggiIdGenerali(companyId: string): Promise<string[]> {
  try {
    const { data, error } = await db.from("orders").select("id").eq("company_id", companyId).eq("workflow_kind", "generale").is("deleted_at", null).limit(5000);
    if (error) throw error;
    return ((data ?? []) as { id: string }[]).map((r) => r.id);
  } catch {
    return [];
  }
}

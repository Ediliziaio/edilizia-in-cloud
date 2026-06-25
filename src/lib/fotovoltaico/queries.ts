/**
 * React Query hooks per il modulo Fotovoltaico.
 * Tutte le query passano per Supabase con RLS company-scoped.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import type {
  FvProgetto,
  FvComponente,
  FvManodopera,
  FvServizio,
  FvIncentivoCatalogo,
  FvParametroCalcolo,
  FvProfiloAutoconsumo,
  FvPannelloLayout,
} from "./tipi";

const QK = {
  progetti: (companyId?: string | null) => ["fv", "progetti", companyId ?? "no-company"] as const,
  progetto: (companyId: string | null | undefined, id: string) => ["fv", "progetto", companyId ?? "no-company", id] as const,
  componenti: (companyId: string | null | undefined, progettoId: string) => ["fv", "componenti", companyId ?? "no-company", progettoId] as const,
  manodopera: (companyId: string | null | undefined, progettoId: string) => ["fv", "manodopera", companyId ?? "no-company", progettoId] as const,
  servizi: (companyId: string | null | undefined, progettoId: string) => ["fv", "servizi", companyId ?? "no-company", progettoId] as const,
  pannelli: (companyId: string | null | undefined, progettoId: string) => ["fv", "pannelli", companyId ?? "no-company", progettoId] as const,
  calcolo: (companyId: string | null | undefined, progettoId: string) => ["fv", "calcolo", companyId ?? "no-company", progettoId] as const,
  incentiviCatalogo: ["fv", "incentivi-catalogo"] as const,
  parametriCalcolo: ["fv", "parametri-calcolo"] as const,
  profiliAutoconsumo: ["fv", "profili-autoconsumo"] as const,
  templatePdf: (companyId?: string | null) => ["fv", "template-pdf", companyId ?? "no-company"] as const,
  statsAzienda: (companyId?: string | null) => ["fv", "stats-azienda", companyId ?? "no-company"] as const,
  servizioCatalogo: (companyId?: string | null) => ["fv", "servizi-catalogo", companyId ?? "no-company"] as const,
  articoli: (companyId: string | null | undefined, categoria?: string) => ["fv", "articoli", companyId ?? "no-company", categoria ?? "all"] as const,
  tabelleFinanziamento: (companyId: string | null | undefined, importoTarget?: number) => ["fv", "tabelle-finanziamento", companyId ?? "no-company", importoTarget ?? "all"] as const,
  lookupRata: (companyId: string | null | undefined, tabellaId: string | null, importo: number | null, durataMesi: number | null) => ["fv", "lookup-rata", companyId ?? "no-company", tabellaId, importo, durataMesi] as const,
  topFinanziamenti: (companyId: string | null | undefined, importo: number | null, durataMesi: number | null) => ["fv", "top-finanziamenti", companyId ?? "no-company", importo, durataMesi] as const,
  tariffe: (companyId?: string | null) => ["fv", "tariffe-aziendali", companyId ?? "no-company"] as const,
};

// ─── Lista progetti ─────────────────────────────────────────────────────────
export function useProgetti() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: QK.progetti(companyId),
    enabled: Boolean(companyId),
    queryFn: async (): Promise<Array<FvProgetto & { cliente_nome: string | null }>> => {
      const { data, error } = await supabase
        .from("v_fv_progetti_dashboard" as never)
        .select("*")
        .eq("company_id", companyId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as never) ?? [];
    },
  });
}

export function useProgetto(id: string | undefined) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: QK.progetto(companyId, id ?? ""),
    enabled: Boolean(id && companyId),
    queryFn: async (): Promise<FvProgetto | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("fv_progetti" as never)
        .select("*")
        .eq("id", id)
        .eq("company_id", companyId as string)
        .maybeSingle();
      if (error) throw error;
      return data as never;
    },
  });
}

export function useCreaProgetto() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  return useMutation({
    mutationFn: async (input: {
      titolo: string;
      archetipo: FvProgetto["archetipo"];
      indirizzo: string;
      cliente_id?: string | null;
      prima_casa?: boolean;
    }): Promise<FvProgetto> => {
      if (!companyId) throw new Error("Azienda non disponibile");

      // Genera numero progressivo lato DB
      const { data: numero } = await supabase.rpc(
        "fv_genera_numero_progetto" as never,
        { p_company_id: companyId } as never
      );

      const { data, error } = await supabase
        .from("fv_progetti" as never)
        .insert({
          company_id: companyId,
          numero: numero as string,
          titolo: input.titolo,
          archetipo: input.archetipo,
          indirizzo: input.indirizzo,
          cliente_id: input.cliente_id ?? null,
          prima_casa: input.prima_casa ?? null,
          stato: "bozza",
        } as never)
        .select()
        .single();
      if (error) throw error;
      return data as never;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.progetti(companyId) });
    },
  });
}

export function useAggiornaProgetto() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  return useMutation({
    mutationFn: async (input: { id: string; patch: Partial<FvProgetto> }) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const { data, error } = await supabase
        .from("fv_progetti" as never)
        .update(input.patch as never)
        .eq("id", input.id)
        .eq("company_id", companyId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Progetto non trovato o non modificabile");
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: QK.progetto(companyId, vars.id) });
      qc.invalidateQueries({ queryKey: QK.progetti(companyId) });
    },
  });
}

export function useEliminaProgetto() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const { data, error } = await supabase
        .from("fv_progetti" as never)
        .update({ annullato: true, annullato_il: new Date().toISOString() } as never)
        .eq("id", id)
        .eq("company_id", companyId)
        .neq("stato", "firmato")
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Progetto non trovato o non annullabile");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.progetti(companyId) });
    },
  });
}

// ─── Componenti, manodopera, servizi ────────────────────────────────────────
export function useComponentiProgetto(progettoId: string | undefined) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: QK.componenti(companyId, progettoId ?? ""),
    enabled: Boolean(progettoId && companyId),
    queryFn: async (): Promise<FvComponente[]> => {
      if (!progettoId) return [];
      const { data, error } = await supabase
        .from("fv_componenti_progetto" as never)
        .select("*")
        .eq("progetto_id", progettoId)
        .order("ordinamento");
      if (error) throw error;
      return (data as never) ?? [];
    },
  });
}

export function useManodoperaProgetto(progettoId: string | undefined) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: QK.manodopera(companyId, progettoId ?? ""),
    enabled: Boolean(progettoId && companyId),
    queryFn: async (): Promise<FvManodopera[]> => {
      if (!progettoId) return [];
      const { data, error } = await supabase
        .from("fv_manodopera_progetto" as never)
        .select("*")
        .eq("progetto_id", progettoId)
        .order("ordinamento");
      if (error) throw error;
      return (data as never) ?? [];
    },
  });
}

export function useServiziProgetto(progettoId: string | undefined) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: QK.servizi(companyId, progettoId ?? ""),
    enabled: Boolean(progettoId && companyId),
    queryFn: async (): Promise<FvServizio[]> => {
      if (!progettoId) return [];
      const { data, error } = await supabase
        .from("fv_servizi_progetto" as never)
        .select("*")
        .eq("progetto_id", progettoId)
        .order("ordinamento");
      if (error) throw error;
      return (data as never) ?? [];
    },
  });
}

export function usePannelliProgetto(progettoId: string | undefined) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: QK.pannelli(companyId, progettoId ?? ""),
    enabled: Boolean(progettoId && companyId),
    queryFn: async (): Promise<FvPannelloLayout[]> => {
      if (!progettoId) return [];
      const { data, error } = await supabase
        .from("fv_pannelli_layout" as never)
        .select("*")
        .eq("progetto_id", progettoId)
        .eq("attivo", true);
      if (error) throw error;
      return (data as never) ?? [];
    },
  });
}

// ─── Cataloghi globali ──────────────────────────────────────────────────────
// Tutti i cataloghi statici hanno staleTime 24h: cambiano raramente (incentivi
// 2026, parametri economici), evita refetch ad ogni mount/navigazione.
const STATIC_STALE_TIME = 24 * 60 * 60 * 1000; // 24h

export function useIncentiviCatalogo(soloAttivi = true) {
  return useQuery({
    queryKey: [...QK.incentiviCatalogo, soloAttivi],
    staleTime: STATIC_STALE_TIME,
    queryFn: async (): Promise<FvIncentivoCatalogo[]> => {
      let q = supabase
        .from("fv_incentivi_catalogo" as never)
        .select("*")
        .order("ordinamento");
      if (soloAttivi) q = q.eq("attivo", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data as never) ?? [];
    },
  });
}

export function useParametriCalcolo() {
  return useQuery({
    queryKey: QK.parametriCalcolo,
    staleTime: STATIC_STALE_TIME,
    queryFn: async (): Promise<FvParametroCalcolo[]> => {
      const { data, error } = await supabase
        .from("fv_parametri_calcolo" as never)
        .select("*");
      if (error) throw error;
      return (data as never) ?? [];
    },
  });
}

export function useProfiliAutoconsumo() {
  return useQuery({
    queryKey: QK.profiliAutoconsumo,
    staleTime: STATIC_STALE_TIME,
    queryFn: async (): Promise<FvProfiloAutoconsumo[]> => {
      const { data, error } = await supabase
        .from("fv_profili_autoconsumo" as never)
        .select("*")
        .eq("attivo", true)
        .order("ordinamento");
      if (error) throw error;
      return (data as never) ?? [];
    },
  });
}

// ─── Stats azienda dashboard ────────────────────────────────────────────────
export function useStatsAzienda() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: QK.statsAzienda(companyId),
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_fv_stats_azienda" as never)
        .select("*")
        .eq("company_id", companyId as string)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return (data as Record<string, unknown> | null) ?? null;
    },
  });
}

// ─── Articoli listino con categoria_fv ──────────────────────────────────────
// Cache 1h: il listino può cambiare ma non spesso, evita refetch inutili.
export function useArticoliFv(categoria?: string) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: QK.articoli(companyId, categoria),
    enabled: Boolean(companyId),
    staleTime: 60 * 60 * 1000, // 1h
    queryFn: async () => {
      let q = supabase
        .from("articoli_native" as never)
        .select("*")
        .eq("company_id", companyId as string)
        .not("categoria_fv", "is", null)
        .eq("attivo", true)
        .order("descrizione");
      if (categoria) q = q.eq("categoria_fv", categoria);
      const { data, error } = await q;
      if (error) throw error;
      return (data as Array<Record<string, unknown>>) ?? [];
    },
  });
}

// ─── Catalogo Componenti FV (articoli_native con categoria_fv) ────────────────
// Sorgente della Fase 5 del wizard. Gestito dalla pagina "Componenti FV", che
// permette di crearli anche partendo dai prodotti del listino (article_families).
export interface ArticoloFv {
  id: string;
  codice: string | null;
  descrizione: string;
  categoria_fv: string | null;
  prezzo_vendita: number | null;
  prezzo_acquisto: number | null;
  potenza_w: number | null;
  potenza_kw: number | null;
  capacita_kwh: number | null;
  garanzia_anni: number | null;
  efficienza_pct: number | null;
  marca_fv: string | null;
  modello_fv: string | null;
  unita_misura: string | null;
  attivo: boolean;
}

const FV_CAT_COLS =
  "id, codice, descrizione, categoria_fv, prezzo_vendita, prezzo_acquisto, potenza_w, potenza_kw, capacita_kwh, garanzia_anni, efficienza_pct, marca_fv, modello_fv, unita_misura, attivo";

// Lista COMPLETA dei componenti FV (inclusi i disattivati) per la gestione.
export function useArticoliFvCatalogo() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["fv", "articoli-fv-catalogo", companyId ?? "no-company"] as const,
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("articoli_native" as never)
        .select(FV_CAT_COLS)
        .eq("company_id", companyId as string)
        .not("categoria_fv", "is", null)
        .order("categoria_fv")
        .order("descrizione");
      if (error) throw error;
      return (data as unknown as ArticoloFv[]) ?? [];
    },
  });
}

// Prodotti del listino (article_families) per il "precompila dal listino".
export interface ListinoOpzioneFv {
  id: string;
  nome: string | null;
  descrizione: string | null;
  prezzo: number | null;
}
export function useListinoPerFv(search?: string) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["fv", "listino-per-fv", companyId ?? "no-company", search ?? ""] as const,
    enabled: Boolean(companyId),
    queryFn: async () => {
      let q = supabase
        .from("article_families" as never)
        .select("id, nome, descrizione, prezzo_base_vendita")
        .eq("company_id", companyId as string)
        .eq("attivo", true)
        .order("nome")
        .limit(40);
      const term = search?.trim();
      if (term) q = q.or(`nome.ilike.%${term}%,descrizione.ilike.%${term}%`);
      const { data, error } = await q;
      if (error) throw error;
      return ((data as unknown as Array<{
        id: string;
        nome: string | null;
        descrizione: string | null;
        prezzo_base_vendita: number | null;
      }>) ?? []).map((r) => ({
        id: r.id,
        nome: r.nome,
        descrizione: r.descrizione,
        prezzo: r.prezzo_base_vendita,
      })) as ListinoOpzioneFv[];
    },
  });
}

export interface ArticoloFvInput {
  id?: string;
  codice?: string | null;
  descrizione: string;
  categoria_fv: string;
  prezzo_vendita?: number | null;
  prezzo_acquisto?: number | null;
  potenza_w?: number | null;
  potenza_kw?: number | null;
  capacita_kwh?: number | null;
  garanzia_anni?: number | null;
  efficienza_pct?: number | null;
  marca_fv?: string | null;
  modello_fv?: string | null;
  unita_misura?: string | null;
}

// Crea o aggiorna un componente FV. NB: prezzo_vendita è NOT NULL → mai null (0 di default).
export function useUpsertArticoloFv() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ArticoloFvInput) => {
      if (!companyId) throw new Error("Azienda non identificata");
      const payload = {
        company_id: companyId,
        codice: input.codice ?? null,
        descrizione: input.descrizione,
        categoria_fv: input.categoria_fv,
        prezzo_vendita: input.prezzo_vendita ?? 0,
        prezzo_acquisto: input.prezzo_acquisto ?? null,
        potenza_w: input.potenza_w ?? null,
        potenza_kw: input.potenza_kw ?? null,
        capacita_kwh: input.capacita_kwh ?? null,
        garanzia_anni: input.garanzia_anni ?? null,
        efficienza_pct: input.efficienza_pct ?? null,
        marca_fv: input.marca_fv ?? null,
        modello_fv: input.modello_fv ?? null,
        unita_misura: input.unita_misura ?? "pz",
        attivo: true,
      };
      if (input.id) {
        const { error } = await supabase
          .from("articoli_native" as never)
          .update(payload)
          .eq("id", input.id)
          .eq("company_id", companyId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("articoli_native" as never).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      // prefix-match: invalida catalogo + tutti i picker Fase 5 (per categoria)
      qc.invalidateQueries({ queryKey: ["fv", "articoli-fv-catalogo"] });
      qc.invalidateQueries({ queryKey: ["fv", "articoli"] });
    },
  });
}

export function useToggleArticoloFv() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, attivo }: { id: string; attivo: boolean }) => {
      if (!companyId) throw new Error("Azienda non identificata");
      const { error } = await supabase
        .from("articoli_native" as never)
        .update({ attivo })
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fv", "articoli-fv-catalogo"] });
      qc.invalidateQueries({ queryKey: ["fv", "articoli"] });
    },
  });
}

// ─── Finanziarie + tabelle finanziamento + lookup rata ────────────────────
// Tabelle del modulo Finanziamenti EiC (eic_finanziarie + eic_tabelle_*)
// integrate nel wizard FV step 6 per offrire rata REALE invece di estimate.

export interface FvFinanziaria {
  id: string;
  nome: string;
  ragione_sociale: string | null;
  logo_url: string | null;
  attiva: boolean;
}

export interface FvTabellaFinanziamento {
  id: string;
  finanziaria_id: string;
  finanziaria_nome: string | null;
  nome_prodotto: string;
  codice_condizione: string | null;
  tan_base: number | null;
  importo_min: number;
  importo_max: number;
  durate_disponibili: number[];
  righe_count: number;
  attiva: boolean;
  data_decorrenza: string | null;
  data_scadenza: string | null;
}

export interface FvRigaFinanziamento {
  id: string;
  tabella_id: string;
  importo_erogato: number;
  durata_mesi: number;
  numero_rate: number;
  importo_rata: number;
  tan: number;
  taeg: number;
  importo_totale_dovuto: number;
  spese_istruttoria: number | null;
  spese_incasso_rata: number | null;
  interessi_cliente: number | null;
}

/**
 * Lista tutte le tabelle di finanziamento attive dell'azienda compatibili
 * con il modulo FV (qualsiasi vertical — un finanziamento generico vale
 * anche per FV). Restituisce tabelle + nome finanziaria pre-joined.
 */
export function useTabelleFinanziamentoFv(importoTarget?: number) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: QK.tabelleFinanziamento(companyId, importoTarget),
    enabled: Boolean(companyId),
    staleTime: 60 * 60 * 1000, // 1h
    queryFn: async (): Promise<FvTabellaFinanziamento[]> => {
      let q = supabase
        .from("eic_tabelle_finanziamento" as never)
        .select(
          "id, finanziaria_id, nome_prodotto, codice_condizione, tan_base, importo_min, importo_max, durate_disponibili, righe_count, attiva, data_decorrenza, data_scadenza, eic_finanziarie!inner(nome, ragione_sociale, attiva)",
        )
        .eq("company_id", companyId as string)
        .eq("attiva", true)
        .gte("righe_count", 1);
      if (importoTarget != null) {
        q = q.lte("importo_min", importoTarget).gte("importo_max", importoTarget);
      }
      const { data, error } = await q.order("nome_prodotto");
      if (error) throw error;
      const rows = (data as Array<Record<string, unknown>>) ?? [];
      return rows
        .filter((r) => {
          const f = r.eic_finanziarie as { attiva?: boolean } | null;
          return f?.attiva !== false;
        })
        .map((r) => ({
          id: String(r.id),
          finanziaria_id: String(r.finanziaria_id),
          finanziaria_nome: (r.eic_finanziarie as { nome?: string } | null)?.nome ?? null,
          nome_prodotto: String(r.nome_prodotto),
          codice_condizione: r.codice_condizione ? String(r.codice_condizione) : null,
          tan_base: r.tan_base != null ? Number(r.tan_base) : null,
          importo_min: Number(r.importo_min) || 0,
          importo_max: Number(r.importo_max) || 0,
          durate_disponibili: Array.isArray(r.durate_disponibili)
            ? (r.durate_disponibili as number[])
            : [],
          righe_count: Number(r.righe_count) || 0,
          attiva: Boolean(r.attiva),
          data_decorrenza: r.data_decorrenza ? String(r.data_decorrenza) : null,
          data_scadenza: r.data_scadenza ? String(r.data_scadenza) : null,
        }));
    },
  });
}

/**
 * Lookup rata reale dalla matrice eic_tabelle_finanziamento_righe.
 * Trova la riga col `importo_erogato` più vicino al target richiesto e
 * la `durata_mesi` esatta. Se non c'è match esatto sull'importo, usa
 * il più vicino (>=) o interpola lineare se serve.
 *
 * Restituisce null se la tabella non ha righe per quella durata o se
 * l'importo è fuori range.
 */
export function useLookupRataFv(
  tabellaId: string | null,
  importo: number | null,
  durataMesi: number | null,
) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: QK.lookupRata(companyId, tabellaId, importo, durataMesi),
    enabled: Boolean(companyId && tabellaId && importo && importo > 0 && durataMesi && durataMesi > 0),
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<FvRigaFinanziamento | null> => {
      if (!tabellaId || !importo || !durataMesi) return null;
      const { data, error } = await supabase
        .from("eic_tabelle_finanziamento_righe" as never)
        .select(
          "id, tabella_id, importo_erogato, durata_mesi, numero_rate, importo_rata, tan, taeg, importo_totale_dovuto, spese_istruttoria, spese_incasso_rata, interessi_cliente",
        )
        .eq("tabella_id", tabellaId)
        .eq("durata_mesi", durataMesi)
        .order("importo_erogato", { ascending: true });
      if (error) throw error;
      const rows = (data as Array<Record<string, unknown>>) ?? [];
      if (rows.length === 0) return null;
      // Trova la riga con importo_erogato più vicino (preferisci >= target)
      const target = importo;
      let exact: Record<string, unknown> | null = null;
      let geRow: Record<string, unknown> | null = null;
      let leRow: Record<string, unknown> | null = null;
      for (const r of rows) {
        const eImp = Number(r.importo_erogato);
        if (eImp === target) {
          exact = r;
          break;
        }
        if (eImp >= target && (!geRow || Number(geRow.importo_erogato) > eImp)) geRow = r;
        if (eImp <= target && (!leRow || Number(leRow.importo_erogato) < eImp)) leRow = r;
      }
      const chosen = exact ?? geRow ?? leRow;
      if (!chosen) return null;
      // Se l'importo target è diverso da quello tabulato, scaliamo la rata
      // proporzionalmente (best-effort: la tabella non copre tutti gli scaglioni).
      const importoTab = Number(chosen.importo_erogato);
      const fattore = importoTab > 0 ? target / importoTab : 1;
      return {
        id: String(chosen.id),
        tabella_id: String(chosen.tabella_id),
        importo_erogato: target, // ritorniamo target richiesto
        durata_mesi: Number(chosen.durata_mesi),
        numero_rate: Number(chosen.numero_rate),
        importo_rata: Math.round(Number(chosen.importo_rata) * fattore),
        tan: Number(chosen.tan),
        taeg: Number(chosen.taeg),
        importo_totale_dovuto: Math.round(Number(chosen.importo_totale_dovuto) * fattore),
        spese_istruttoria: chosen.spese_istruttoria ? Number(chosen.spese_istruttoria) : null,
        spese_incasso_rata: chosen.spese_incasso_rata ? Number(chosen.spese_incasso_rata) : null,
        interessi_cliente: chosen.interessi_cliente
          ? Math.round(Number(chosen.interessi_cliente) * fattore)
          : null,
      };
    },
  });
}

/**
 * Top 3 finanziamenti consigliati per importo+durata target.
 * Calcola la rata per ciascuna tabella attiva nel range, ordina per rata
 * crescente (ovvero TAEG migliore) e restituisce le prime 3.
 *
 * Usato per il "Confronto top 3 finanziarie" nel mockup p.6.
 */
export function useTopFinanziamentiFv(
  importo: number | null,
  durataMesi: number | null,
) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: QK.topFinanziamenti(companyId, importo, durataMesi),
    enabled: Boolean(companyId && importo && importo > 0 && durataMesi && durataMesi > 0),
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<
      Array<FvTabellaFinanziamento & { rata: FvRigaFinanziamento }>
    > => {
      if (!importo || !durataMesi) return [];
      // 1) lista tabelle attive nel range
      const { data: tabs, error } = await supabase
        .from("eic_tabelle_finanziamento" as never)
        .select(
          "id, finanziaria_id, nome_prodotto, codice_condizione, tan_base, importo_min, importo_max, durate_disponibili, righe_count, attiva, eic_finanziarie!inner(nome, attiva)",
        )
        .eq("company_id", companyId as string)
        .eq("attiva", true)
        .lte("importo_min", importo)
        .gte("importo_max", importo);
      if (error) throw error;
      const tabRows = (tabs as Array<Record<string, unknown>>) ?? [];
      const tabsFiltrate = tabRows.filter((r) => {
        const f = r.eic_finanziarie as { attiva?: boolean } | null;
        if (f?.attiva === false) return false;
        const dur = (r.durate_disponibili as number[]) ?? [];
        return dur.includes(durataMesi);
      });
      if (tabsFiltrate.length === 0) return [];

      // 2) per ogni tabella, lookup rata e ordinamento
      const results = await Promise.all(
        tabsFiltrate.map(async (t) => {
          const { data: righeData } = await supabase
            .from("eic_tabelle_finanziamento_righe" as never)
            .select(
              "id, tabella_id, importo_erogato, durata_mesi, numero_rate, importo_rata, tan, taeg, importo_totale_dovuto, spese_istruttoria, spese_incasso_rata, interessi_cliente",
            )
            .eq("tabella_id", t.id as string)
            .eq("durata_mesi", durataMesi)
            .order("importo_erogato", { ascending: true });
          const righe = (righeData as Array<Record<string, unknown>>) ?? [];
          if (righe.length === 0) return null;
          // best-fit lookup
          let chosen = righe[0];
          for (const r of righe) {
            if (Number(r.importo_erogato) >= importo) {
              chosen = r;
              break;
            }
          }
          const importoTab = Number(chosen.importo_erogato);
          const fattore = importoTab > 0 ? importo / importoTab : 1;
          const tab: FvTabellaFinanziamento = {
            id: String(t.id),
            finanziaria_id: String(t.finanziaria_id),
            finanziaria_nome:
              (t.eic_finanziarie as { nome?: string } | null)?.nome ?? null,
            nome_prodotto: String(t.nome_prodotto),
            codice_condizione: t.codice_condizione ? String(t.codice_condizione) : null,
            tan_base: t.tan_base != null ? Number(t.tan_base) : null,
            importo_min: Number(t.importo_min) || 0,
            importo_max: Number(t.importo_max) || 0,
            durate_disponibili: Array.isArray(t.durate_disponibili)
              ? (t.durate_disponibili as number[])
              : [],
            righe_count: Number(t.righe_count) || 0,
            attiva: Boolean(t.attiva),
            data_decorrenza: null,
            data_scadenza: null,
          };
          const rata: FvRigaFinanziamento = {
            id: String(chosen.id),
            tabella_id: String(chosen.tabella_id),
            importo_erogato: importo,
            durata_mesi: Number(chosen.durata_mesi),
            numero_rate: Number(chosen.numero_rate),
            importo_rata: Math.round(Number(chosen.importo_rata) * fattore),
            tan: Number(chosen.tan),
            taeg: Number(chosen.taeg),
            importo_totale_dovuto: Math.round(Number(chosen.importo_totale_dovuto) * fattore),
            spese_istruttoria: chosen.spese_istruttoria ? Number(chosen.spese_istruttoria) : null,
            spese_incasso_rata: chosen.spese_incasso_rata
              ? Number(chosen.spese_incasso_rata)
              : null,
            interessi_cliente: chosen.interessi_cliente
              ? Math.round(Number(chosen.interessi_cliente) * fattore)
              : null,
          };
          return { ...tab, rata };
        }),
      );
      const valid = results.filter(
        (r): r is FvTabellaFinanziamento & { rata: FvRigaFinanziamento } => r !== null,
      );
      // Ordina per TAEG crescente (best deal first) poi rata crescente
      valid.sort((a, b) => a.rata.taeg - b.rata.taeg || a.rata.importo_rata - b.rata.importo_rata);
      return valid.slice(0, 3);
    },
  });
}

// ─── Tariffe aziendali compatibili con FV ──────────────────────────────────
// Filtra per vertical_associato in ('fotovoltaico', 'generico') + attive.
// Sostituisce gli hardcoded 30€/40€ del wizard step 5.
export interface FvTariffaAziendale {
  id: string;
  tipo: string;
  nome: string;
  descrizione: string | null;
  unita: string;
  prezzo_costo: number;
  prezzo_vendita: number;
  vertical_associato: string | null;
}

export function useTariffeFv() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: QK.tariffe(companyId),
    enabled: Boolean(companyId),
    staleTime: 60 * 60 * 1000, // 1h
    queryFn: async (): Promise<FvTariffaAziendale[]> => {
      const { data, error } = await supabase
        .from("tariffe_aziendali" as never)
        .select(
          "id, tipo, nome, descrizione, unita, prezzo_costo, prezzo_vendita, vertical_associato",
        )
        .eq("company_id", companyId as string)
        .eq("attivo", true)
        .or("vertical_associato.eq.fotovoltaico,vertical_associato.eq.generico,vertical_associato.is.null")
        .order("tipo", { ascending: true })
        .order("nome", { ascending: true });
      if (error) throw error;
      return ((data as never) ?? []) as FvTariffaAziendale[];
    },
  });
}

// ─── Aggiungi/rimuovi componente / manodopera / servizio ────────────────────
export function useUpsertComponenti() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  return useMutation({
    mutationFn: async (input: {
      progetto_id: string;
      righe: Array<Omit<FvComponente, "id" | "progetto_id" | "created_at">>;
      replace?: boolean;
    }) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      if (input.replace) {
        await supabase
          .from("fv_componenti_progetto" as never)
          .delete()
          .eq("progetto_id", input.progetto_id);
      }
      if (input.righe.length === 0) return;
      const payload = input.righe.map((r) => ({
        ...r,
        progetto_id: input.progetto_id,
      }));
      const { error } = await supabase
        .from("fv_componenti_progetto" as never)
        .insert(payload as never);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: QK.componenti(companyId, vars.progetto_id) });
    },
  });
}

export function useUpsertManodopera() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  return useMutation({
    mutationFn: async (input: {
      progetto_id: string;
      righe: Array<Omit<FvManodopera, "id" | "progetto_id" | "created_at">>;
      replace?: boolean;
    }) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      if (input.replace) {
        await supabase
          .from("fv_manodopera_progetto" as never)
          .delete()
          .eq("progetto_id", input.progetto_id);
      }
      if (input.righe.length === 0) return;
      const payload = input.righe.map((r) => ({
        ...r,
        progetto_id: input.progetto_id,
      }));
      const { error } = await supabase
        .from("fv_manodopera_progetto" as never)
        .insert(payload as never);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: QK.manodopera(companyId, vars.progetto_id) });
    },
  });
}

export function useUpsertServizi() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  return useMutation({
    mutationFn: async (input: {
      progetto_id: string;
      righe: Array<Omit<FvServizio, "id" | "progetto_id" | "created_at">>;
      replace?: boolean;
    }) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      if (input.replace) {
        await supabase
          .from("fv_servizi_progetto" as never)
          .delete()
          .eq("progetto_id", input.progetto_id);
      }
      if (input.righe.length === 0) return;
      const payload = input.righe.map((r) => ({
        ...r,
        progetto_id: input.progetto_id,
      }));
      const { error } = await supabase
        .from("fv_servizi_progetto" as never)
        .insert(payload as never);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: QK.servizi(companyId, vars.progetto_id) });
    },
  });
}

// ─── Template PDF impresa ───────────────────────────────────────────────────
export function useTemplatePdf() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: QK.templatePdf(companyId),
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fv_template_pdf" as never)
        .select("*")
        .eq("company_id", companyId as string)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return (data as Record<string, unknown> | null) ?? null;
    },
  });
}

export function useUpsertTemplatePdf() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  return useMutation({
    mutationFn: async (input: Record<string, unknown>) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const { error } = await supabase
        .from("fv_template_pdf" as never)
        .upsert({ ...input, company_id: companyId } as never, { onConflict: "company_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.templatePdf(companyId) });
    },
  });
}

// ─── Servizi catalogo per azienda ───────────────────────────────────────────
// Cache 1h: il catalogo servizi è company-scoped ma cambia raramente.
export function useServiziCatalogo() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: QK.servizioCatalogo(companyId),
    enabled: Boolean(companyId),
    staleTime: 60 * 60 * 1000, // 1h
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fv_servizi_catalogo" as never)
        .select("*")
        .eq("company_id", companyId as string)
        .eq("attivo", true)
        .order("ordinamento");
      if (error) throw error;
      return (data as Array<Record<string, unknown>>) ?? [];
    },
  });
}

// ─── Hook feature flag per gating ──────────────────────────────────────────
/**
 * @deprecated dal 2026-04-27: il flag aziendale è ora `modulo_fotovoltaico_attivo`
 * risolto via `resolve_company_feature` (vedi `useFeatureAccess`). Questo hook
 * resta come wrapper di compatibilità per `fv_setup_completato` (campo locale
 * che NON è una feature flag) e ritorna `attivo` leggendo la colonna legacy
 * `companies.fv_modulo_attivo` finché non viene rimossa fisicamente.
 *
 * Nuovi consumer: usare `useFeatureAccess("modulo_fotovoltaico_attivo")`.
 */
export function useFvModuloAttivo() {
  const companyIdFromContext = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["fv", "modulo-attivo", companyIdFromContext ?? "no-company"],
    enabled: Boolean(companyIdFromContext),
    queryFn: async (): Promise<{ attivo: boolean; setup_completato: boolean }> => {
      const { data, error } = await supabase
        .from("companies" as never)
        .select("fv_modulo_attivo, fv_setup_completato")
        .eq("id", companyIdFromContext as string)
        .maybeSingle();
      if (error) throw error;
      const row = data as { fv_modulo_attivo: boolean; fv_setup_completato: boolean } | null;
      return {
        attivo: row?.fv_modulo_attivo ?? false,
        setup_completato: row?.fv_setup_completato ?? false,
      };
    },
  });
}

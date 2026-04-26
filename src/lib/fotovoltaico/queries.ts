/**
 * React Query hooks per il modulo Fotovoltaico.
 * Tutte le query passano per Supabase con RLS company-scoped.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
  progetti: ["fv", "progetti"] as const,
  progetto: (id: string) => ["fv", "progetto", id] as const,
  componenti: (progettoId: string) => ["fv", "componenti", progettoId] as const,
  manodopera: (progettoId: string) => ["fv", "manodopera", progettoId] as const,
  servizi: (progettoId: string) => ["fv", "servizi", progettoId] as const,
  pannelli: (progettoId: string) => ["fv", "pannelli", progettoId] as const,
  calcolo: (progettoId: string) => ["fv", "calcolo", progettoId] as const,
  incentiviCatalogo: ["fv", "incentivi-catalogo"] as const,
  parametriCalcolo: ["fv", "parametri-calcolo"] as const,
  profiliAutoconsumo: ["fv", "profili-autoconsumo"] as const,
  templatePdf: ["fv", "template-pdf"] as const,
  statsAzienda: ["fv", "stats-azienda"] as const,
  servizioCatalogo: ["fv", "servizi-catalogo"] as const,
};

// ─── Lista progetti ─────────────────────────────────────────────────────────
export function useProgetti() {
  return useQuery({
    queryKey: QK.progetti,
    queryFn: async (): Promise<Array<FvProgetto & { cliente_nome: string | null }>> => {
      const { data, error } = await supabase
        .from("v_fv_progetti_dashboard" as never)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as never) ?? [];
    },
  });
}

export function useProgetto(id: string | undefined) {
  return useQuery({
    queryKey: QK.progetto(id ?? ""),
    enabled: Boolean(id),
    queryFn: async (): Promise<FvProgetto | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("fv_progetti" as never)
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as never;
    },
  });
}

export function useCreaProgetto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      titolo: string;
      archetipo: FvProgetto["archetipo"];
      indirizzo: string;
      cliente_id?: string | null;
      prima_casa?: boolean;
    }): Promise<FvProgetto> => {
      // Recupera company_id corrente
      const { data: profile } = await supabase
        .from("profiles" as never)
        .select("company_id")
        .single();
      const company_id = (profile as { company_id: string }).company_id;

      // Genera numero progressivo lato DB
      const { data: numero } = await supabase.rpc(
        "fv_genera_numero_progetto" as never,
        { p_company_id: company_id } as never
      );

      const { data, error } = await supabase
        .from("fv_progetti" as never)
        .insert({
          company_id,
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
      qc.invalidateQueries({ queryKey: QK.progetti });
    },
  });
}

export function useAggiornaProgetto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; patch: Partial<FvProgetto> }) => {
      const { error } = await supabase
        .from("fv_progetti" as never)
        .update(input.patch as never)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: QK.progetto(vars.id) });
      qc.invalidateQueries({ queryKey: QK.progetti });
    },
  });
}

export function useEliminaProgetto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("fv_progetti" as never)
        .update({ annullato: true, annullato_il: new Date().toISOString() } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.progetti });
    },
  });
}

// ─── Componenti, manodopera, servizi ────────────────────────────────────────
export function useComponentiProgetto(progettoId: string | undefined) {
  return useQuery({
    queryKey: QK.componenti(progettoId ?? ""),
    enabled: Boolean(progettoId),
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
  return useQuery({
    queryKey: QK.manodopera(progettoId ?? ""),
    enabled: Boolean(progettoId),
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
  return useQuery({
    queryKey: QK.servizi(progettoId ?? ""),
    enabled: Boolean(progettoId),
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
  return useQuery({
    queryKey: QK.pannelli(progettoId ?? ""),
    enabled: Boolean(progettoId),
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
  return useQuery({
    queryKey: QK.statsAzienda,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_fv_stats_azienda" as never)
        .select("*")
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return (data as Record<string, unknown> | null) ?? null;
    },
  });
}

// ─── Articoli listino con categoria_fv ──────────────────────────────────────
// Cache 1h: il listino può cambiare ma non spesso, evita refetch inutili.
export function useArticoliFv(categoria?: string) {
  return useQuery({
    queryKey: ["fv", "articoli", categoria ?? "all"],
    staleTime: 60 * 60 * 1000, // 1h
    queryFn: async () => {
      let q = supabase
        .from("articoli_native" as never)
        .select("*")
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
  return useQuery({
    queryKey: ["fv", "tabelle-finanziamento", importoTarget ?? "all"],
    staleTime: 60 * 60 * 1000, // 1h
    queryFn: async (): Promise<FvTabellaFinanziamento[]> => {
      let q = supabase
        .from("eic_tabelle_finanziamento" as never)
        .select(
          "id, finanziaria_id, nome_prodotto, codice_condizione, tan_base, importo_min, importo_max, durate_disponibili, righe_count, attiva, data_decorrenza, data_scadenza, eic_finanziarie!inner(nome, ragione_sociale, attiva)",
        )
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
  return useQuery({
    queryKey: ["fv", "lookup-rata", tabellaId, importo, durataMesi],
    enabled: Boolean(tabellaId && importo && importo > 0 && durataMesi && durataMesi > 0),
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
  return useQuery({
    queryKey: ["fv", "top-finanziamenti", importo, durataMesi],
    enabled: Boolean(importo && importo > 0 && durataMesi && durataMesi > 0),
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
  return useQuery({
    queryKey: ["fv", "tariffe-aziendali"],
    staleTime: 60 * 60 * 1000, // 1h
    queryFn: async (): Promise<FvTariffaAziendale[]> => {
      const { data, error } = await supabase
        .from("tariffe_aziendali" as never)
        .select(
          "id, tipo, nome, descrizione, unita, prezzo_costo, prezzo_vendita, vertical_associato",
        )
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
  return useMutation({
    mutationFn: async (input: {
      progetto_id: string;
      righe: Array<Omit<FvComponente, "id" | "progetto_id" | "created_at">>;
      replace?: boolean;
    }) => {
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
      qc.invalidateQueries({ queryKey: QK.componenti(vars.progetto_id) });
    },
  });
}

export function useUpsertManodopera() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      progetto_id: string;
      righe: Array<Omit<FvManodopera, "id" | "progetto_id" | "created_at">>;
      replace?: boolean;
    }) => {
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
      qc.invalidateQueries({ queryKey: QK.manodopera(vars.progetto_id) });
    },
  });
}

export function useUpsertServizi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      progetto_id: string;
      righe: Array<Omit<FvServizio, "id" | "progetto_id" | "created_at">>;
      replace?: boolean;
    }) => {
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
      qc.invalidateQueries({ queryKey: QK.servizi(vars.progetto_id) });
    },
  });
}

// ─── Template PDF impresa ───────────────────────────────────────────────────
export function useTemplatePdf() {
  return useQuery({
    queryKey: QK.templatePdf,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fv_template_pdf" as never)
        .select("*")
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return (data as Record<string, unknown> | null) ?? null;
    },
  });
}

export function useUpsertTemplatePdf() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Record<string, unknown>) => {
      const { error } = await supabase
        .from("fv_template_pdf" as never)
        .upsert(input as never, { onConflict: "company_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.templatePdf });
    },
  });
}

// ─── Servizi catalogo per azienda ───────────────────────────────────────────
// Cache 1h: il catalogo servizi è company-scoped ma cambia raramente.
export function useServiziCatalogo() {
  return useQuery({
    queryKey: QK.servizioCatalogo,
    staleTime: 60 * 60 * 1000, // 1h
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fv_servizi_catalogo" as never)
        .select("*")
        .eq("attivo", true)
        .order("ordinamento");
      if (error) throw error;
      return (data as Array<Record<string, unknown>>) ?? [];
    },
  });
}

// ─── Hook feature flag per gating ──────────────────────────────────────────
export function useFvModuloAttivo() {
  return useQuery({
    queryKey: ["fv", "modulo-attivo"],
    queryFn: async (): Promise<{ attivo: boolean; setup_completato: boolean }> => {
      // Ricava company_id effettivo via RPC esistente in EiC
      const { data: companyId } = await supabase.rpc(
        "get_effective_company_id" as never
      );
      if (!companyId) return { attivo: false, setup_completato: false };

      const { data, error } = await supabase
        .from("companies" as never)
        .select("fv_modulo_attivo, fv_setup_completato")
        .eq("id", companyId as string)
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

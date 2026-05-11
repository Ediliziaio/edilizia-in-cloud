/**
 * Hook per leggere le tabelle finanziamento configurate dall'admin in
 * /azienda/impostazioni/finanziamenti, e per popolare il select del wizard
 * preventivo serramenti (StepEconomia).
 *
 * - useTabelleFinanziamentoAttive(): lista tabelle attive della company
 *   (id, nome_prodotto, tan_base, finanziaria_id+nome, durate disponibili).
 * - useTabellaFinanziamentoRighe(tabellaId): righe di una specifica tabella
 *   (importo×durata→importo_rata, TAEG, ICC). Usate per la scelta della rata.
 * - findMigliorRiga(): helper per trovare la riga ottimale dato un importo
 *   finanziato e una durata desiderata (round-up al primo step della tabella).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

export interface TabellaFinanziamento {
  id: string;
  company_id: string;
  finanziaria_id: string | null;
  finanziaria_nome: string | null;
  nome_prodotto: string;
  codice_condizione: string | null;
  subtariffa_default: string | null;
  tan_base: number | null;
  pdf_url: string | null;
  csv_url: string | null;
  data_decorrenza: string | null;
  data_scadenza: string | null;
  attiva: boolean;
}

export interface RigaFinanziamento {
  id: string;
  tabella_id: string;
  subtariffa: string | null;
  importo_erogato: number;
  spese_istruttoria: number | null;
  importo_totale_credito: number | null;
  numero_rate: number;
  durata_mesi: number;
  prima_rata_giorni: number | null;
  importo_rata: number;
  spese_incasso_rata: number | null;
  interessi_cliente: number | null;
  importo_totale_dovuto: number | null;
  tan: number | null;
  taeg: number | null;
  icc: number | null;
}

/** Solo tabelle attive (escluse archiviate/scadute). Cached 5 min. */
export function useTabelleFinanziamentoAttive() {
  const companyId = useEffectiveCompanyId();

  return useQuery({
    queryKey: ["tabelle-finanziamento-attive", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<TabellaFinanziamento[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("eic_tabelle_finanziamento")
        .select(`
          id, company_id, finanziaria_id, nome_prodotto, codice_condizione,
          subtariffa_default, tan_base, pdf_url, csv_url, data_decorrenza,
          data_scadenza, attiva,
          finanziaria:eic_finanziarie ( nome )
        `)
        .eq("company_id", companyId!)
        .eq("attiva", true)
        .order("nome_prodotto", { ascending: true });
      if (error) throw new Error(error.message);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as any[]).map((t) => ({
        ...t,
        finanziaria_nome: t.finanziaria?.nome ?? null,
      }));
    },
  });
}

/** Righe di una tabella specifica (per la selezione importo×durata). Cached 5 min. */
export function useTabellaFinanziamentoRighe(tabellaId: string | null | undefined) {
  return useQuery({
    queryKey: ["tabella-finanziamento-righe", tabellaId],
    enabled: !!tabellaId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<RigaFinanziamento[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("eic_tabelle_finanziamento_righe")
        .select(`
          id, tabella_id, subtariffa, importo_erogato, spese_istruttoria,
          importo_totale_credito, numero_rate, durata_mesi, prima_rata_giorni,
          importo_rata, spese_incasso_rata, interessi_cliente,
          importo_totale_dovuto, tan, taeg, icc
        `)
        .eq("tabella_id", tabellaId!)
        .order("importo_erogato", { ascending: true })
        .order("durata_mesi", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as RigaFinanziamento[];
    },
  });
}

/**
 * Dato un set di righe e un (importo_target, durata_target), trova la riga
 * con importo_erogato >= importo_target e durata_mesi == durata_target,
 * scegliendo il minore tra i candidati. Fallback alla riga più alta se il
 * target supera tutti i breakpoint della tabella.
 *
 * Use case: il preventivo è €15.000, l'utente sceglie 60 mesi → cerco la
 * riga "15.000 × 60" o la prima > 15.000 a 60 mesi (es. €18.000 × 60).
 */
export function findMigliorRiga(
  righe: RigaFinanziamento[],
  importoTarget: number,
  durataMesi: number,
): RigaFinanziamento | null {
  if (righe.length === 0) return null;
  const stesseDurate = righe.filter((r) => r.durata_mesi === durataMesi);
  if (stesseDurate.length === 0) {
    // Nessuna riga a quella durata: prendi la durata più vicina (in eccesso)
    const sorted = [...righe].sort((a, b) => a.durata_mesi - b.durata_mesi);
    const target = sorted.find((r) => r.durata_mesi >= durataMesi);
    if (target) {
      return findMigliorRiga(
        righe.filter((r) => r.durata_mesi === target.durata_mesi),
        importoTarget,
        target.durata_mesi,
      );
    }
    return sorted[sorted.length - 1] ?? null;
  }
  const eligible = stesseDurate.filter((r) => r.importo_erogato >= importoTarget);
  if (eligible.length === 0) {
    // Importo target supera tutti i breakpoint → ultima riga (massima)
    return stesseDurate[stesseDurate.length - 1];
  }
  return eligible.reduce((min, r) =>
    r.importo_erogato < min.importo_erogato ? r : min, eligible[0]);
}

/** Durate uniche disponibili in una tabella (per il select "Durata mesi"). */
export function getDurateUniche(righe: RigaFinanziamento[]): number[] {
  const set = new Set<number>();
  righe.forEach((r) => set.add(r.durata_mesi));
  return Array.from(set).sort((a, b) => a - b);
}

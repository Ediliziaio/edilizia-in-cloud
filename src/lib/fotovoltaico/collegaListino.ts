/**
 * collegaListino — il listino è l'unica fonte di verità, categorizzata una
 * volta sola sulla MACROCATEGORIA.
 *
 * Flusso: l'utente assegna a ogni macrocategoria del listino una `tipologia`
 * ('fotovoltaico', 'serramenti', …) e — se fotovoltaico — la `fv_categoria`
 * ('pannello' | 'inverter' | 'accumulo' | 'wallbox' | 'ottimizzatore' |
 * 'struttura' | 'altro'). Un TRIGGER DB proietta/sincronizza automaticamente
 * gli article_families delle macro taggate in articoli_native (upsert su
 * listino_family_id, parsing specs W/kW/kWh in SQL). La RPC
 * `fv_sync_listino_macro(p_company_id)` fa backfill/risincronizzazione
 * manuale e ritorna il numero di componenti sincronizzati.
 *
 * Qui: proposta automatica di mapping (ILIKE sul nome macro), query dei
 * gruppi macro con conteggi e mutation di collegamento (UPDATE macro + RPC).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

/** Categorie FV valide (CHECK su listino_macrocategorie.fv_categoria e articoli_native.categoria_fv). */
export type CategoriaFvListino =
  | "pannello"
  | "inverter"
  | "accumulo"
  | "wallbox"
  | "ottimizzatore"
  | "struttura"
  | "altro";

export const CATEGORIE_FV_LISTINO: Array<{ value: CategoriaFvListino; label: string }> = [
  { value: "pannello", label: "Pannello / Modulo" },
  { value: "inverter", label: "Inverter" },
  { value: "accumulo", label: "Batteria / Accumulo" },
  { value: "wallbox", label: "Colonnina / Wallbox" },
  { value: "ottimizzatore", label: "Ottimizzatore" },
  { value: "struttura", label: "Struttura / Zavorra" },
  { value: "altro", label: "Altro / Extra" },
];

/** Tipologie listino note (listino_macrocategorie.tipologia, testo libero NULL-able). */
export const TIPOLOGIE_LISTINO: Array<{ value: string; label: string }> = [
  { value: "fotovoltaico", label: "Fotovoltaico" },
  { value: "serramenti", label: "Serramenti" },
  { value: "ristrutturazione", label: "Ristrutturazione" },
  { value: "bagno", label: "Bagno" },
  { value: "tetto", label: "Tetto" },
  { value: "climatizzazione", label: "Climatizzazione" },
];

/**
 * Proposta automatica di mapping macro → (tipologia, fv_categoria) via match
 * ILIKE sul nome. Kit / Caldaie / Climatizzatori / Pompe di Calore / macro
 * generiche → nessuna proposta (decide l'utente).
 */
export function proponiMappingMacroFv(nomeMacro: string | null | undefined): {
  tipologia: string | null;
  fv_categoria: CategoriaFvListino | null;
} {
  const n = (nomeMacro ?? "").toLowerCase();
  const fv = (fv_categoria: CategoriaFvListino) => ({ tipologia: "fotovoltaico", fv_categoria });
  if (/modul.*fotovolt|pannell/.test(n)) return fv("pannello");
  if (/inverter/.test(n)) return fv("inverter");
  if (/accumul|batteri/.test(n)) return fv("accumulo");
  if (/colonnin|wallbox|ricarica/.test(n)) return fv("wallbox");
  if (/ottimizzator/.test(n)) return fv("ottimizzatore");
  if (/struttur|zavorr/.test(n)) return fv("struttura");
  return { tipologia: null, fv_categoria: null };
}

export interface MacroListinoFv {
  id: string;
  nome: string;
  attivo: boolean;
  /** Tipologia attuale sulla macro (NULL = non classificata). */
  tipologia: string | null;
  /** Categoria FV attuale (NULL = non collegata al preventivatore FV). */
  fv_categoria: CategoriaFvListino | null;
  /** Prodotti attivi non-deleted della macro nel listino. */
  prodottiAttivi: number;
}

/**
 * Macrocategorie della company + conteggio prodotti attivi (article_families
 * non-deleted). Query attiva solo a dialog aperto (`enabled`).
 */
export function useMacroListinoFv(enabled: boolean) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["fv", "macro-listino-fv", companyId ?? "no-company"] as const,
    enabled: Boolean(companyId) && enabled,
    queryFn: async (): Promise<MacroListinoFv[]> => {
      const [macroRes, famRes] = await Promise.all([
        supabase
          .from("listino_macrocategorie" as never)
          .select("id, nome, attivo, tipologia, fv_categoria")
          .eq("company_id", companyId as string)
          .order("nome"),
        supabase
          .from("article_families" as never)
          .select("macrocategoria_id")
          .eq("company_id", companyId as string)
          .eq("attivo", true)
          .is("deleted_at", null)
          .limit(5000),
      ]);
      if (macroRes.error) throw macroRes.error;
      if (famRes.error) throw famRes.error;
      const counts = new Map<string, number>();
      for (const f of (famRes.data as unknown as Array<{ macrocategoria_id: string | null }>) ?? []) {
        if (!f.macrocategoria_id) continue;
        counts.set(f.macrocategoria_id, (counts.get(f.macrocategoria_id) ?? 0) + 1);
      }
      const rows =
        (macroRes.data as unknown as Array<{
          id: string;
          nome: string;
          attivo: boolean;
          tipologia: string | null;
          fv_categoria: CategoriaFvListino | null;
        }>) ?? [];
      return rows.map((m) => ({
        id: m.id,
        nome: m.nome,
        attivo: m.attivo,
        tipologia: m.tipologia ?? null,
        fv_categoria: m.fv_categoria ?? null,
        prodottiAttivi: counts.get(m.id) ?? 0,
      }));
    },
  });
}

export interface CollegaMacroInput {
  id: string;
  tipologia: string | null;
  fv_categoria: CategoriaFvListino | null;
}

/** Invalida catalogo componenti FV + picker wizard + gruppi macro + macro listino. */
function invalidateCatalogoFv(qc: ReturnType<typeof useQueryClient>, companyId: string | null) {
  qc.invalidateQueries({ queryKey: ["fv", "articoli-fv-catalogo"] });
  qc.invalidateQueries({ queryKey: ["fv", "articoli"] });
  qc.invalidateQueries({ queryKey: ["fv", "macro-listino-fv"] });
  qc.invalidateQueries({ queryKey: ["listino-macrocategorie", companyId] });
}

/**
 * Collega le macro al preventivatore: UPDATE listino_macrocategorie
 * (tipologia + fv_categoria) e poi RPC fv_sync_listino_macro per proiettare
 * i prodotti in articoli_native. Ritorna il numero di componenti sincronizzati.
 */
export function useCollegaMacroFv() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (righe: CollegaMacroInput[]): Promise<number> => {
      if (!companyId) throw new Error("Azienda non identificata");
      for (const r of righe) {
        const { error } = await supabase
          .from("listino_macrocategorie" as never)
          .update({
            tipologia: r.tipologia,
            fv_categoria: r.tipologia === "fotovoltaico" ? r.fv_categoria : null,
          } as never)
          .eq("id", r.id)
          .eq("company_id", companyId);
        if (error) throw error;
      }
      // Backfill/risincronizzazione: il trigger copre i cambi futuri, la RPC
      // allinea subito lo storico e ritorna il numero di componenti toccati.
      const { data, error: rpcError } = await supabase.rpc(
        "fv_sync_listino_macro" as never,
        { p_company_id: companyId } as never,
      );
      if (rpcError) throw rpcError;
      return Number(data ?? 0);
    },
    onSuccess: () => invalidateCatalogoFv(qc, companyId),
  });
}

/** "Sincronizza ora": sola RPC di riallineamento (senza toccare i tag macro). */
export function useSyncListinoFv() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<number> => {
      if (!companyId) throw new Error("Azienda non identificata");
      const { data, error } = await supabase.rpc(
        "fv_sync_listino_macro" as never,
        { p_company_id: companyId } as never,
      );
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: () => invalidateCatalogoFv(qc, companyId),
  });
}

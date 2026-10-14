/**
 * React Query hooks per la Libreria Prezzari Regionali (lato azienda).
 *
 * Le tabelle `prezzario_*` sono CONDIVISE (cross-company), read-only per le
 * aziende (RLS: SELECT del solo `stato='pubblicato'`). Provengono dalla
 * migrazione LOCALE `20271022000000_prezzari_regionali.sql` e NON sono nei tipi
 * generati di Supabase → usiamo il cast `supabase as any` (stesso pattern di
 * `useListinoLavorazioni.ts`).
 *
 * `useAdottaPrezzario` copia voci scelte nel listino lavorazioni aziendale
 * (`rst_listino_voci`) scorporando prezzo→costo_manodopera/costo_materiali via
 * incidenza manodopera, applicando il ricarico aziendale.
 *
 * Vedi docs/superpowers/specs/2026-06-20-prezzari-regionali-design.md
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdottaPrezzarioListino } from "./adozioneLavorazioni";
import type { PrezzarioFonte, PrezzarioCapitolo, PrezzarioVoce, StatoFonte } from "./tipi";
import { loadCatalogPages } from "@/lib/listino/loadCatalogPages";
import { termineDiRicerca } from "@/lib/ricercaPostgrest";
export type { AdottaPrezzarioInput } from "./adozioneLavorazioni";

// Tipi prezzario_* / rst_* non rigenerati: cast unico, riusato in tutto il file.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = () => supabase as any;

// ─── Query keys ──────────────────────────────────────────────────────────────
const QK = {
  fonti: ["prezzario", "fonti"] as const,
  capitoli: (fonteId: string | null | undefined) =>
    ["prezzario", "capitoli", fonteId ?? "no-fonte"] as const,
};

const STATIC_STALE_TIME = 24 * 60 * 60 * 1000; // 24h: i prezzari cambiano per anno

// ─── Fonti pubblicate ────────────────────────────────────────────────────────
/**
 * Fonti `stato='pubblicato'` per la UI azienda, ordinate per regione asc + anno
 * desc (la più recente per regione in cima). La RLS già filtra il pubblicato;
 * teniamo il filtro esplicito per chiarezza/coerenza coi tipi.
 */
export function usePrezzarioFonti() {
  return useQuery<PrezzarioFonte[]>({
    queryKey: QK.fonti,
    staleTime: STATIC_STALE_TIME,
    queryFn: async () => {
      const { data, error } = await sb()
        .from("prezzario_fonte")
        .select("*")
        .eq("stato", "pubblicato")
        .order("regione", { ascending: true })
        .order("anno", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as PrezzarioFonte[];
    },
  });
}

// ─── Fonti (TUTTE) — solo super_admin ────────────────────────────────────────
/**
 * Tutte le fonti, qualunque stato (bozza/pubblicato/archiviato), ordinate per
 * `updated_at` desc (l'ultima toccata in cima). Riservata alla UI super-admin:
 * la RLS consente la lettura delle bozze solo al super_admin, quindi per gli
 * altri ruoli questa query ritorna solo i pubblicati (fail-safe, non un leak).
 * Query key distinta da `QK.fonti` per non collidere con la cache azienda.
 */
export function usePrezzarioFontiAdmin() {
  return useQuery<PrezzarioFonte[]>({
    queryKey: ["prezzario", "fonti", "admin"] as const,
    staleTime: 0, // l'admin pubblica/archivia: nessuna cache stantia
    queryFn: async () => {
      const { data, error } = await sb()
        .from("prezzario_fonte")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as PrezzarioFonte[];
    },
  });
}

// ─── Capitoli di una fonte ───────────────────────────────────────────────────
export function usePrezzarioCapitoli(fonteId: string | null | undefined) {
  return useQuery<PrezzarioCapitolo[]>({
    queryKey: QK.capitoli(fonteId),
    enabled: Boolean(fonteId),
    staleTime: STATIC_STALE_TIME,
    queryFn: async () => {
      return loadCatalogPages<PrezzarioCapitolo>(async (from, to) => {
        const { data, error } = await sb()
          .from("prezzario_capitolo")
          .select("*")
          .eq("fonte_id", fonteId)
          .order("ordine", { ascending: true }).order("id").range(from, to);
        return { data, error };
      });
    },
  });
}

export const PREZZARIO_PAGE_SIZE = 100;
export interface PaginaPrezzario { voci: PrezzarioVoce[]; totale: number }
export interface FiltroPaginaPrezzario {
  fonteId: string | null; search?: string; capitoliIds?: string[]; pagina?: number;
}

/** Filtra PRIMA di paginare: nessun capitolo dipende più dalle prime 500 righe. */
export function usePrezzarioVociPagina({ fonteId, search = "", capitoliIds, pagina = 0 }: FiltroPaginaPrezzario) {
  const term = termineDiRicerca(search);
  return useQuery<PaginaPrezzario>({
    queryKey: ["prezzario", "pagina", fonteId, term, capitoliIds, pagina],
    enabled: Boolean(fonteId),
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ signal }) => {
      let q = sb().from("prezzario_voce").select("*", { count: "exact" }).eq("fonte_id", fonteId);
      if (capitoliIds?.length) q = q.in("capitolo_id", capitoliIds);
      if (term) q = q.or(`codice.ilike.%${term}%,descrizione.ilike.%${term}%`);
      const { data, error, count } = await q.order("ordine").order("id")
        .range(pagina * PREZZARIO_PAGE_SIZE, (pagina + 1) * PREZZARIO_PAGE_SIZE - 1).abortSignal(signal);
      if (error) throw new Error(error.message);
      return { voci: (data ?? []) as PrezzarioVoce[], totale: count ?? 0 };
    },
  });
}

// ─── Ricerca globale voci (cross-fonte, solo pubblicate) ─────────────────────
/**
 * Voce di prezzario arricchita con i dati della fonte, per la ricerca globale
 * usata dal picker del computo (badge "Regione Anno").
 */
export interface PrezzarioVoceConFonte extends PrezzarioVoce {
  /** Fonte d'origine (regione/anno/nome), per badge e raggruppamento. */
  fonte: { regione: string; anno: number; nome: string; stato: StatoFonte };
  /** Etichetta compatta "Regione Anno" (es. "Lombardia 2024"). */
  fonteLabel: string;
}

/**
 * Ricerca voci attraverso TUTTE le fonti pubblicate (cross-regione), per il
 * picker del computo Ristrutturazione. A differenza di `usePrezzarioVociPagina` non è
 * vincolata a una fonte: filtra `fonte.stato='pubblicato'` via inner join e
 * cerca in FTS italiana (websearch) sulla colonna `search`, con fallback `ilike`
 * sulla descrizione. `enabled` solo da 2+ caratteri (ricerca pesante cross-fonte).
 */
export function usePrezzarioVociGlobalSearch(search: string) {
  const term = search.trim();
  return useQuery<PrezzarioVoceConFonte[]>({
    queryKey: ["prezzario", "voci", "global-search", term] as const,
    enabled: term.length >= 2,
    staleTime: 5 * 60 * 1000, // 5min: dipende dalla ricerca, cache breve
    queryFn: async () => {
      // inner join sulla fonte + filtro pubblicato: solo voci di fonti visibili.
      const base = () =>
        sb()
          .from("prezzario_voce")
          .select("*, fonte:prezzario_fonte!inner(regione,anno,nome,stato)")
          .eq("fonte.stato", "pubblicato");

      const decorate = (rows: unknown[]): PrezzarioVoceConFonte[] =>
        (rows ?? []).map((r) => {
          const row = r as PrezzarioVoce & {
            fonte: { regione: string; anno: number; nome: string; stato: StatoFonte };
          };
          return { ...row, fonteLabel: `${row.fonte.regione} ${row.fonte.anno}` };
        });

      const { data, error } = await base()
        .textSearch("search", term, { type: "websearch", config: "italian" })
        .limit(30);
      if (!error) return decorate(data ?? []);

      // Fallback ilike su descrizione se la FTS non è interpretabile.
      const { data: data2, error: error2 } = await base()
        .ilike("descrizione", `%${term}%`)
        .limit(30);
      if (error2) throw new Error(error2.message);
      return decorate(data2 ?? []);
    },
  });
}

// ─── Adozione: copia voci nel listino lavorazioni aziendale ──────────────────

/** Adozione condivisa: categorie preservate, unità obbligatoria, nuovi tentativi senza doppioni. */
export function useAdottaPrezzario() {
  return useAdottaPrezzarioListino("rst");
}

/**
 * React Query hooks per la macchina delle TARIFFE ORARIE manodopera edile.
 *
 * La tabella `manodopera_tariffa` è CONDIVISA (cross-company): RLS SELECT a tutti
 * gli autenticati (dato di riferimento pubblico), write riservata al super_admin
 * (`public.is_super_admin()`). Proviene dalla migrazione LOCALE
 * `20271022000000_prezzari_regionali.sql` e NON è nei tipi generati di Supabase →
 * usiamo il cast `supabase as any` (stesso pattern di `queries.ts` /
 * `useListinoLavorazioni.ts`).
 *
 * - `useManodoperaTariffe(filtri?)` — read super-admin (TUTTE le tariffe, filtrabili).
 * - `useUpsertManodoperaTariffa()`  — insert/update diretto (super_admin → RLS ok).
 * - `useDeleteManodoperaTariffa()`  — delete diretto (super_admin → RLS ok).
 * - `useManodoperaLookup(regione?, provincia?, anno?)` — sola lettura per il
 *   lookup azienda (componente `ManodoperaLookup`).
 *
 * Vedi docs/superpowers/specs/2026-06-20-prezzari-regionali-design.md
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ManodoperaTariffa, QualificaManodopera } from "./tipi";

// manodopera_tariffa non rigenerata nei tipi Supabase → client non tipizzato
// (stesso pattern di queries.ts / useListinoLavorazioni).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = () => supabase as any;

// ─── Qualifiche: ordine canonico + etichette umane (condivise UI) ────────────
/** Ordine canonico delle 4 qualifiche edili (dalla più bassa alla più alta). */
export const QUALIFICHE_ORDINE: QualificaManodopera[] = [
  "comune",
  "qualificato",
  "specializzato",
  "quarto_livello",
];

/** Etichette leggibili delle qualifiche, per Select/tabelle/lookup. */
export const QUALIFICA_LABEL: Record<QualificaManodopera, string> = {
  comune: "Operaio comune",
  qualificato: "Operaio qualificato",
  specializzato: "Operaio specializzato",
  quarto_livello: "Quarto livello",
};

// ─── Filtri & query keys ─────────────────────────────────────────────────────

export interface ManodoperaFiltri {
  regione?: string;
  provincia?: string;
  anno?: number;
}

const QK = {
  /** Lista admin filtrata: chiave stabile sui filtri normalizzati. */
  tariffe: (f?: ManodoperaFiltri) =>
    [
      "manodopera-tariffe",
      f?.regione ?? "all",
      f?.provincia ?? "all",
      f?.anno ?? "all",
    ] as const,
  /** Lookup azienda (read-only): stessa cardinalità di filtri della lista. */
  lookup: (regione?: string, provincia?: string, anno?: number) =>
    [
      "manodopera-lookup",
      regione ?? "all",
      provincia ?? "all",
      anno ?? "all",
    ] as const,
};

const STATIC_STALE_TIME = 24 * 60 * 60 * 1000; // 24h: le tariffe cambiano per anno

// ─── Read (super-admin): tutte le tariffe, filtrabili ────────────────────────
/**
 * Tariffe manodopera, ordinate regione asc → anno desc → qualifica asc.
 * Filtri opzionali (regione/provincia/anno) applicati lato DB. La RLS consente
 * la SELECT a tutti gli autenticati, ma la write resta super-admin: questa lista
 * alimenta la UI di gestione.
 */
export function useManodoperaTariffe(filtri?: ManodoperaFiltri) {
  return useQuery<ManodoperaTariffa[]>({
    queryKey: QK.tariffe(filtri),
    staleTime: 0, // l'admin crea/modifica/elimina: nessuna cache stantia
    queryFn: async () => {
      let query = sb()
        .from("manodopera_tariffa")
        .select("*")
        .order("regione", { ascending: true, nullsFirst: false })
        .order("anno", { ascending: false, nullsFirst: false })
        .order("qualifica", { ascending: true, nullsFirst: false });
      if (filtri?.regione) query = query.eq("regione", filtri.regione);
      if (filtri?.provincia) query = query.eq("provincia", filtri.provincia);
      if (filtri?.anno != null) query = query.eq("anno", filtri.anno);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as ManodoperaTariffa[];
    },
  });
}

// ─── Upsert (super-admin): crea o aggiorna una riga ──────────────────────────

export interface ManodoperaTariffaInput {
  /** Presente = update; assente = insert. */
  id?: string;
  regione: string | null;
  provincia: string | null;
  anno: number | null;
  qualifica: QualificaManodopera | null;
  costo_orario: number | null;
  fonte: string | null;
}

/**
 * Insert/update diretto su `manodopera_tariffa`. Il super_admin passa la RLS di
 * scrittura. Invalida sia le liste admin sia i lookup azienda.
 */
export function useUpsertManodoperaTariffa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ManodoperaTariffaInput): Promise<void> => {
      const payload = {
        regione: input.regione,
        provincia: input.provincia,
        anno: input.anno,
        qualifica: input.qualifica,
        costo_orario: input.costo_orario,
        fonte: input.fonte,
      };
      if (input.id) {
        const { error } = await sb()
          .from("manodopera_tariffa")
          .update(payload)
          .eq("id", input.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await sb().from("manodopera_tariffa").insert(payload);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["manodopera-tariffe"] });
      void qc.invalidateQueries({ queryKey: ["manodopera-lookup"] });
    },
  });
}

// ─── Delete (super-admin) ────────────────────────────────────────────────────
export function useDeleteManodoperaTariffa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await sb().from("manodopera_tariffa").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["manodopera-tariffe"] });
      void qc.invalidateQueries({ queryKey: ["manodopera-lookup"] });
    },
  });
}

// ─── Lookup azienda (read-only) ──────────────────────────────────────────────
/**
 * Tariffe per il lookup azienda dati regione/provincia/anno. Sola lettura: la
 * RLS consente la SELECT a tutti gli autenticati. `enabled` solo con almeno la
 * regione (un lookup senza scope ritornerebbe l'intero dataset).
 *
 * Ordina per qualifica asc così il consumatore può mappare le 4 qualifiche in
 * ordine stabile. La provincia/anno restringono ulteriormente quando forniti.
 */
export function useManodoperaLookup(
  regione?: string,
  provincia?: string,
  anno?: number,
) {
  return useQuery<ManodoperaTariffa[]>({
    queryKey: QK.lookup(regione, provincia, anno),
    enabled: Boolean(regione),
    staleTime: STATIC_STALE_TIME,
    queryFn: async () => {
      let query = sb()
        .from("manodopera_tariffa")
        .select("*")
        .order("qualifica", { ascending: true, nullsFirst: false });
      if (regione) query = query.eq("regione", regione);
      if (provincia) query = query.eq("provincia", provincia);
      if (anno != null) query = query.eq("anno", anno);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as ManodoperaTariffa[];
    },
  });
}

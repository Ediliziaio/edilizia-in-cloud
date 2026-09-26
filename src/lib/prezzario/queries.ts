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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import type { PrezzarioFonte, PrezzarioCapitolo, PrezzarioVoce, StatoFonte } from "./tipi";

// Tipi prezzario_* / rst_* non rigenerati: cast unico, riusato in tutto il file.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = () => supabase as any;

// ─── Query keys ──────────────────────────────────────────────────────────────
const QK = {
  fonti: ["prezzario", "fonti"] as const,
  capitoli: (fonteId: string | null | undefined) =>
    ["prezzario", "capitoli", fonteId ?? "no-fonte"] as const,
  voci: (fonteId: string | null | undefined, search: string) =>
    ["prezzario", "voci", fonteId ?? "no-fonte", search] as const,
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
      const { data, error } = await sb()
        .from("prezzario_capitolo")
        .select("*")
        .eq("fonte_id", fonteId)
        .order("ordine", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as PrezzarioCapitolo[];
    },
  });
}

// ─── Voci di una fonte (con ricerca FTS) ─────────────────────────────────────
/**
 * Voci di una fonte. Con `search` non vuoto usa la full-text search italiana
 * sulla colonna generata `search` (websearch); se la FTS fallisce (sintassi
 * o query degenere) ricade su `ilike` sulla descrizione. `enabled` su `fonteId`.
 */
export function usePrezzarioVoci(fonteId: string | null | undefined, search = "") {
  const term = search.trim();
  return useQuery<PrezzarioVoce[]>({
    queryKey: QK.voci(fonteId, term),
    enabled: Boolean(fonteId),
    staleTime: 5 * 60 * 1000, // 5min: dipende dalla ricerca, cache breve
    queryFn: async () => {
      const base = () =>
        sb().from("prezzario_voce").select("*").eq("fonte_id", fonteId);

      if (term) {
        const { data, error } = await base()
          .textSearch("search", term, { type: "websearch", config: "italian" })
          .order("ordine", { ascending: true })
          .limit(200);
        if (!error) return (data ?? []) as PrezzarioVoce[];
        // Fallback ilike su descrizione se la FTS non è interpretabile.
        const { data: data2, error: error2 } = await base()
          .ilike("descrizione", `%${term}%`)
          .order("ordine", { ascending: true })
          .limit(200);
        if (error2) throw new Error(error2.message);
        return (data2 ?? []) as PrezzarioVoce[];
      }

      const { data, error } = await base()
        .order("ordine", { ascending: true })
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as PrezzarioVoce[];
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
 * picker del computo Ristrutturazione. A differenza di `usePrezzarioVoci` non è
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

export interface AdottaPrezzarioInput {
  fonteId: string;
  voci: PrezzarioVoce[];
  /** Ricarico % applicato a tutte le voci adottate. */
  ricaricoPct: number;
  /** Capitolo del listino aziendale a cui agganciare le voci (opzionale). */
  capitoloId?: string;
}

/**
 * Adotta un insieme di voci del prezzario nel listino lavorazioni aziendale
 * (`rst_listino_voci`) per la company effettiva.
 *
 * Scorporo prezzo → costi (l'incidenza manodopera è una frazione 0..1):
 *   costo_manodopera = prezzo × incidenza_manodopera_pct  (0 se assente)
 *   costo_materiali  = prezzo − costo_manodopera
 *   ricarico_pct     = ricaricoPct
 *   prezzo_unitario  = prezzo × (1 + ricaricoPct/100)
 *   note             = "Fonte: <nome fonte> (cod. <codice>)"
 *   fonte            = "<nome fonte>"  (citazione base d'asta, propagata al computo)
 */
export function useAdottaPrezzario() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AdottaPrezzarioInput): Promise<{ inserite: number; senzaUnita: number }> => {
      if (!companyId) throw new Error("Azienda non disponibile");
      if (input.voci.length === 0) return { inserite: 0, senzaUnita: 0 };

      // Nome fonte per la nota (una sola lettura, riusata su tutte le voci).
      const { data: fonteRow, error: fonteErr } = await sb()
        .from("prezzario_fonte")
        .select("nome")
        .eq("id", input.fonteId)
        .maybeSingle();
      if (fonteErr) throw new Error(fonteErr.message);
      const nomeFonte = (fonteRow?.nome as string | undefined) ?? "Prezzario";

      const rows = input.voci.map((v, idx) => {
        const prezzo = Number(v.prezzo) || 0;
        const incid = v.incidenza_manodopera_pct ?? 0;
        const costo_manodopera = Math.round(prezzo * incid * 100) / 100;
        const costo_materiali = Math.round((prezzo - costo_manodopera) * 100) / 100;
        const prezzo_unitario = Math.round(prezzo * (1 + input.ricaricoPct / 100) * 100) / 100;
        const note = v.codice
          ? `Fonte: ${nomeFonte} (cod. ${v.codice})`
          : `Fonte: ${nomeFonte}`;
        return {
          company_id: companyId,
          capitolo_id: input.capitoloId ?? null,
          codice: v.codice ?? null,
          descrizione: v.descrizione,
          // 84% delle voci di prezzario NON ha l'unita' di misura: 306.522 su
          // 364.011, e sedici prezzari su diciannove ne sono privi al 100%. La
          // colonna e' NOT NULL con default 'cad', quindi qui l'unita' si
          // inventa comunque — ma almeno si conta, e chi adotta se lo sente
          // dire invece di ritrovarsi una lavorazione da 12 EUR/m2 in listino
          // come 12 EUR al pezzo.
          unita_misura: v.unita_misura ?? "cad",
          costo_materiali,
          costo_manodopera,
          ricarico_pct: input.ricaricoPct,
          prezzo_unitario,
          note,
          // Citazione fonte per riga: il nome del prezzario d'origine (riusa quello
          // già messo nella nota). Si propaga al computo quando la voce è richiamata.
          fonte: nomeFonte,
          ordine: idx,
        };
      });

      const { error } = await sb().from("rst_listino_voci").insert(rows);
      if (error) throw new Error(error.message);
      const senzaUnita = input.voci.filter((v) => !v.unita_misura).length;
      return { inserite: rows.length, senzaUnita };
    },
    onSuccess: () => {
      // Invalida le query del listino rst (stesse chiavi di useListinoLavorazioni).
      void qc.invalidateQueries({ queryKey: ["rst-listino-voci", companyId] });
      void qc.invalidateQueries({ queryKey: ["rst-listino-capitoli", companyId] });
    },
  });
}

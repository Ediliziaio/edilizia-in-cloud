// src/hooks/useGeneralePiano.ts
// Il piano economico della commessa generale: versioni, voci, reale (abbinato alle voci
// in SQL), unità e fotografie; i salvataggi. I conti stanno in pianoConti.ts.
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import type { CategoriaPiano, TipoVoce, VoceNuova } from "@/lib/orders/generali/pianoCategorie";
import { useCriterioRipartizione } from "@/hooks/useCommesseGenerali";
import { useVariantiGenerale } from "@/hooks/useGeneraleVarianti";
import { moduliDelModello } from "@/lib/orders/generali/moduli";
import { variantiPerPiano } from "@/lib/orders/generali/varianti";
import { calcolaPianoEconomico, type DatiUnita, type PianoCalcolato, type Scenario, type VocePiano } from "@/lib/orders/generali/pianoConti";
import {
  dataDaMese, leggiFotografie, leggiReale, leggiUnita, leggiVersioni, leggiVoci,
  type FotografiaPiano, type RealePiano, type VersionePiano,
} from "@/lib/orders/generali/pianoLettura";

// Tabelle e RPC del piano non sono ancora nei tipi generati: cast localizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const chiaviPiano = {
  versioni: (generaleId: string | undefined) => ["generale-piano-versioni", generaleId] as const,
  voci: (versioneId: string | null | undefined) => ["generale-piano-voci", versioneId] as const,
  reale: (generaleId: string | undefined, versioneId: string | null | undefined) => ["generale-piano-reale", generaleId, versioneId] as const,
  realeTutti: (generaleId: string | undefined) => ["generale-piano-reale", generaleId] as const,
  unita: (generaleId: string | undefined) => ["generale-piano-unita", generaleId] as const,
  fotografie: (generaleId: string | undefined) => ["generale-piano-fotografie", generaleId] as const,
};

const COLONNE_VOCE = "id, tipo, categoria, descrizione, importo, mese, durata_mesi, figlia_id, categorie_costo, a_finire, nota, ordine, origine_id";

/** Il messaggio del database se è scritto per chi usa l'app; altrimenti uno generico. */
export function messaggioPiano(e: unknown, cosa: string): string {
  const err = e as { code?: string; message?: string } | null;
  if (err?.code === "42501" || err?.code === "22023" || err?.code === "P0002" || err?.code === "23514") {
    // Un vincolo di tabella ha un nome tecnico: meglio dire cosa non va.
    if (err.message?.includes("violates check constraint")) return `Un valore di ${cosa} non è accettato: controlla importi, mesi e durata.`;
    return err.message ?? `Non è stato possibile salvare ${cosa}.`;
  }
  return `Non è stato possibile salvare ${cosa}. Riprova tra poco.`;
}

export function useVersioniPiano(generaleId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: chiaviPiano.versioni(generaleId),
    enabled: !!generaleId && enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<VersionePiano[]> => {
      const { data, error } = await db
        .from("generale_piano_versioni")
        .select("id, numero, stato, nota, approvata_at, created_at")
        .eq("generale_id", generaleId!)
        .order("numero", { ascending: false });
      if (error) throw error;
      return leggiVersioni(data);
    },
  });
}

export function useVociPiano(versioneId: string | null | undefined) {
  return useQuery({
    queryKey: chiaviPiano.voci(versioneId),
    enabled: !!versioneId,
    staleTime: 30_000,
    queryFn: async (): Promise<VocePiano[]> => {
      const { data, error } = await db
        .from("generale_piano_voci")
        .select(COLONNE_VOCE)
        .eq("versione_id", versioneId!)
        .order("ordine", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(1000);
      if (error) throw error;
      return leggiVoci(data);
    },
  });
}

/** Il reale della generale e delle figlie, riga per riga, con la voce della versione che lo raccoglie. */
export function useRealePiano(generaleId: string | undefined, versioneId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: chiaviPiano.reale(generaleId, versioneId ?? null),
    enabled: !!generaleId && enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<RealePiano> => {
      const { data, error } = await db.rpc("commessa_generale_piano_reale", { p_generale_id: generaleId, p_versione_id: versioneId ?? null });
      if (error) throw error;
      return leggiReale(data);
    },
  });
}

/**
 * Millesimi e m² delle unità (modulo Unità e vendite). La tabella può non esserci ancora, o
 * legare la figlia con un'altra colonna: in quei casi niente unità, e i costi comuni si
 * ripartiscono per importo, senza errori.
 */
export function useUnitaGenerale(generaleId: string | undefined, figlieIds: string[], enabled = true) {
  const chiave = [...figlieIds].sort().join(",");
  return useQuery({
    queryKey: [...chiaviPiano.unita(generaleId), chiave],
    enabled: !!generaleId && enabled && figlieIds.length > 0,
    staleTime: 5 * 60_000,
    meta: { silent: true },
    queryFn: async (): Promise<Map<string, DatiUnita> | null> => {
      try {
        let { data, error } = await db.from("unita_immobiliari").select("*").in("order_id", figlieIds).limit(2000);
        if (error?.code === "42703") {
          ({ data, error } = await db.from("unita_immobiliari").select("*").limit(2000));
        }
        if (error) return null;
        const mappa = leggiUnita(data);
        const soloFiglie = new Map([...mappa].filter(([id]) => figlieIds.includes(id)));
        return soloFiglie.size > 0 ? soloFiglie : null;
      } catch {
        return null;
      }
    },
  });
}

export function useFotografieGenerale(generaleId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: chiaviPiano.fotografie(generaleId),
    enabled: !!generaleId && enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<FotografiaPiano[]> => {
      const { data, error } = await db
        .from("generale_fotografie")
        .select("mese, versione_numero, versione_stato, ricavi_previsti, costi_previsti, ricavi_reali, costi_reali, ricavi_stima, costi_stima, capitale_massimo_previsto, capitale_investito, origine")
        .eq("generale_id", generaleId!)
        .order("mese", { ascending: true })
        .limit(240);
      if (error) throw error;
      return leggiFotografie(data);
    },
  });
}

/** Quale versione si guarda: quella chiesta, altrimenti `preferenza` (la bozza per lavorarci, l'approvata per i numeri ufficiali). */
export function scegliVersione(
  versioni: VersionePiano[],
  richiesta: string | null | undefined,
  preferenza: "bozza" | "approvata" = "approvata",
): { inVista: VersionePiano | null; approvata: VersionePiano | null; bozza: VersionePiano | null } {
  const approvata = versioni.find((v) => v.stato === "approvata") ?? null;
  const bozza = versioni.find((v) => v.stato === "bozza") ?? null;
  const chiesta = richiesta ? versioni.find((v) => v.id === richiesta) ?? null : null;
  const inVista = chiesta ?? (preferenza === "bozza" ? bozza ?? approvata : approvata ?? bozza) ?? versioni[0] ?? null;
  return { inVista, approvata, bozza };
}

export interface OpzioniNumeri {
  /** La versione da guardare; senza, quella di `preferenza`. */
  versioneId?: string | null;
  preferenza?: "bozza" | "approvata";
  scenario?: Scenario | null;
  enabled?: boolean;
}

/**
 * Tutti i numeri del piano di una generale: la scheda, il riquadro in Panoramica e il modulo
 * investitori leggono da qui (stesse chiavi di cache: aprire la scheda dopo la Panoramica è immediato).
 * `piano` è null finché manca qualcosa o se chi guarda non vede i margini.
 */
export function useGeneralePianoNumeri(riepilogo: RiepilogoGenerale | undefined, opzioni: OpzioniNumeri = {}) {
  const generaleId = riepilogo?.generale.id;
  const attivo = (opzioni.enabled ?? true) && !!riepilogo?.permessi.margini;
  const versioni = useVersioniPiano(generaleId, attivo);
  // Il riquadro vive nella Panoramica: qualunque cosa arrivi, non deve farla cadere.
  const elenco = Array.isArray(versioni.data) ? versioni.data : [];
  const scelta = scegliVersione(elenco, opzioni.versioneId, opzioni.preferenza);
  const inVista = scelta.inVista;
  const confrontaCon = scelta.approvata && inVista && scelta.approvata.id !== inVista.id ? scelta.approvata : inVista?.stato === "approvata" ? inVista : null;
  const voci = useVociPiano(inVista?.id);
  const approvate = useVociPiano(confrontaCon && confrontaCon.id !== inVista?.id ? confrontaCon.id : null);
  const reale = useRealePiano(generaleId, inVista?.id ?? null, attivo && versioni.isSuccess);
  const figlieIds = useMemo(() => (riepilogo?.figlie ?? []).map((f) => f.id), [riepilogo]);
  const unita = useUnitaGenerale(generaleId, figlieIds, attivo);
  const criterio = useCriterioRipartizione(generaleId);
  // Le varianti degli acquirenti contano dove ci sono unità (sviluppo, compravendita).
  const conUnita = !!riepilogo && moduliDelModello(riepilogo.generale.modello).includes("unita");
  const varianti = useVariantiGenerale(generaleId, attivo && conUnita);

  const piano: PianoCalcolato | null = useMemo(() => {
    if (!riepilogo || !inVista || !Array.isArray(voci.data) || !reale.data || !Array.isArray(reale.data.righe)) return null;
    const approvateVoci = confrontaCon?.id === inVista.id ? voci.data : approvate.data ?? null;
    return calcolaPianoEconomico({
      oggi: reale.data.oggi,
      generaleId: riepilogo.generale.id,
      voci: voci.data,
      approvate: approvateVoci,
      righe: reale.data.righe,
      incassi: reale.data.incassi,
      figlie: riepilogo.figlie.map((f) => ({ id: f.id, nome: f.codice ? `${f.codice} · ${f.nome}` : f.nome, importo: f.importo })),
      unita: unita.data ?? null,
      criterio: criterio.data?.criterio ?? "auto",
      scenario: opzioni.scenario ?? null,
      varianti: conUnita ? variantiPerPiano(varianti.data) : null,
    });
  }, [riepilogo, inVista, confrontaCon, voci.data, approvate.data, reale.data, unita.data, criterio.data, opzioni.scenario, conUnita, varianti.data]);

  return {
    versioni: elenco,
    ...scelta,
    voci: Array.isArray(voci.data) ? voci.data : [],
    reale: reale.data ?? null,
    unita: unita.data ?? null,
    piano,
    /** Non c'è ancora nessuna versione: il prossimo passo è creare il piano. */
    vuoto: versioni.isSuccess && elenco.length === 0,
    isLoading: versioni.isLoading || (!!inVista && (voci.isLoading || reale.isLoading)),
    isError: versioni.isError || voci.isError || reale.isError,
    refetch: () => {
      void versioni.refetch();
      void voci.refetch();
      void reale.refetch();
    },
  };
}

// ── Salvataggi ─────────────────────────────────────────────────────────────

function useInvalidaPiano(generaleId: string) {
  const qc = useQueryClient();
  return {
    versioni: () => qc.invalidateQueries({ queryKey: chiaviPiano.versioni(generaleId) }),
    voci: (versioneId: string | null) => qc.invalidateQueries({ queryKey: chiaviPiano.voci(versioneId) }),
    reale: () => qc.invalidateQueries({ queryKey: chiaviPiano.realeTutti(generaleId) }),
    fotografie: () => qc.invalidateQueries({ queryKey: chiaviPiano.fotografie(generaleId) }),
  };
}

const vocePerDb = (v: VoceNuova, ordine: number, figliaId: string | null = null) => ({
  tipo: v.tipo,
  categoria: v.categoria,
  descrizione: v.descrizione.slice(0, 300),
  importo: Math.max(0, Math.round(v.importo * 100) / 100),
  mese: dataDaMese(v.mese),
  durata_mesi: Math.min(120, Math.max(1, Math.round(v.durataMesi))),
  figlia_id: figliaId,
  ordine,
});

/** La prima versione (con le voci di partenza) o una nuova revisione dell'approvato. Restituisce l'id della bozza. */
export function useNuovaVersionePiano(generaleId: string) {
  const invalida = useInvalidaPiano(generaleId);
  return useMutation({
    mutationFn: async (vociDiPartenza: VoceNuova[] | null): Promise<string> => {
      const { data, error } = await db.rpc("generale_piano_nuova_versione", {
        p_generale_id: generaleId,
        p_voci: vociDiPartenza ? vociDiPartenza.map((v, i) => vocePerDb(v, (i + 1) * 10)) : null,
      });
      if (error) throw error;
      if (typeof data !== "string") throw new Error("La versione del piano non risulta creata. Ricarica la pagina.");
      return data;
    },
    onSuccess: () => {
      void invalida.versioni();
    },
  });
}

export function useApprovaPiano(generaleId: string) {
  const invalida = useInvalidaPiano(generaleId);
  return useMutation({
    mutationFn: async (v: { versioneId: string; nota: string | null }) => {
      const { error } = await db.rpc("generale_piano_approva", { p_versione_id: v.versioneId, p_nota: v.nota });
      if (error) throw error;
    },
    onSuccess: () => {
      void invalida.versioni();
    },
  });
}

/** Butta via la bozza (l'approvato resta com'è). */
export function useEliminaBozzaPiano(generaleId: string) {
  const invalida = useInvalidaPiano(generaleId);
  return useMutation({
    mutationFn: async (versioneId: string) => {
      const { error, count } = await db
        .from("generale_piano_versioni")
        .delete({ count: "exact" })
        .eq("id", versioneId)
        .eq("stato", "bozza");
      if (error) throw error;
      if (count === 0) throw new Error("La bozza non si può eliminare: forse è già stata approvata.");
    },
    onSuccess: () => {
      void invalida.versioni();
    },
  });
}

export type ModificaVoce = Partial<{
  tipo: TipoVoce;
  categoria: CategoriaPiano;
  descrizione: string;
  importo: number;
  mese: string | null;
  durataMesi: number;
  figliaId: string | null;
  categorieCosto: string[];
  aFinire: number | null;
  nota: string | null;
}>;

const CAMPI_DB: Record<keyof ModificaVoce, string> = {
  tipo: "tipo",
  categoria: "categoria",
  descrizione: "descrizione",
  importo: "importo",
  mese: "mese",
  durataMesi: "durata_mesi",
  figliaId: "figlia_id",
  categorieCosto: "categorie_costo",
  aFinire: "a_finire",
  nota: "nota",
};
/** I campi che cambiano quale voce raccoglie il reale: dopo, il reale si rilegge. */
const CAMPI_ABBINAMENTO: (keyof ModificaVoce)[] = ["tipo", "categoria", "figliaId", "categorieCosto"];

/** Salva una cella. Si vede subito (aggiornamento ottimista) e torna indietro se il database dice di no. */
export function useModificaVoce(generaleId: string, versioneId: string | null) {
  const qc = useQueryClient();
  const invalida = useInvalidaPiano(generaleId);
  return useMutation({
    mutationFn: async ({ id, modifica }: { id: string; modifica: ModificaVoce }) => {
      const riga: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(modifica) as [keyof ModificaVoce, unknown][]) {
        riga[CAMPI_DB[k]] = k === "mese" ? dataDaMese(v as string | null) : v;
      }
      const { error } = await db.from("generale_piano_voci").update(riga).eq("id", id).select("id").single();
      if (error) throw error;
    },
    onMutate: async ({ id, modifica }) => {
      const chiave = chiaviPiano.voci(versioneId);
      await qc.cancelQueries({ queryKey: chiave });
      const prima = qc.getQueryData<VocePiano[]>(chiave);
      qc.setQueryData<VocePiano[]>(chiave, (voci) => voci?.map((v) => (v.id === id ? { ...v, ...modifica } : v)));
      return { prima };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prima) qc.setQueryData(chiaviPiano.voci(versioneId), ctx.prima);
    },
    onSettled: (_d, _e, { modifica }) => {
      void invalida.voci(versioneId);
      if (CAMPI_ABBINAMENTO.some((k) => k in modifica)) void invalida.reale();
    },
  });
}

/** Aggiunge voci in fondo alla versione (una nuova, o le righe incollate da Excel). */
export function useAggiungiVoci(generaleId: string, versioneId: string | null) {
  const qc = useQueryClient();
  const invalida = useInvalidaPiano(generaleId);
  return useMutation({
    mutationFn: async (nuove: (VoceNuova & { figliaId?: string | null })[]): Promise<string[]> => {
      if (!versioneId) throw new Error("Nessuna bozza aperta.");
      const esistenti = qc.getQueryData<VocePiano[]>(chiaviPiano.voci(versioneId)) ?? [];
      const ultimo = esistenti.reduce((m, v) => Math.max(m, v.ordine), 0);
      const righe = nuove.map((v, i) => ({ versione_id: versioneId, ...vocePerDb(v, ultimo + (i + 1) * 10, v.figliaId ?? null) }));
      const { data, error } = await db.from("generale_piano_voci").insert(righe).select("id");
      if (error) throw error;
      return ((data ?? []) as { id: string }[]).map((r) => r.id);
    },
    onSuccess: () => {
      void invalida.voci(versioneId);
      void invalida.reale();
    },
  });
}

export function useEliminaVoce(generaleId: string, versioneId: string | null) {
  const invalida = useInvalidaPiano(generaleId);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error, count } = await db.from("generale_piano_voci").delete({ count: "exact" }).eq("id", id);
      if (error) throw error;
      if (count === 0) throw new Error("La voce non si può eliminare: la versione è approvata.");
    },
    onSuccess: () => {
      void invalida.voci(versioneId);
      void invalida.reale();
    },
  });
}

/** Rifà la fotografia del mese in corso con i numeri di adesso. */
export function useFotografaOra(generaleId: string) {
  const invalida = useInvalidaPiano(generaleId);
  return useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("generale_piano_fotografa_ora", { p_generale_id: generaleId });
      if (error) throw error;
    },
    onSuccess: () => {
      void invalida.fotografie();
    },
  });
}

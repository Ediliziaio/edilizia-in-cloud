// src/hooks/useGeneraleInvestitori.ts
// Fonti e investitori della commessa generale: letture, salvataggi e invio del rendiconto.
// I conti stanno in investitoriConti.ts; i numeri dell'operazione vengono dal piano
// economico (useGeneralePianoNumeri), con le stesse chiavi di cache.
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { useGeneralePianoNumeri } from "@/hooks/useGeneralePiano";
import { numeriPerInvestitori } from "@/lib/orders/generali/pianoConti";
import {
  calcolaInvestitori, numeriDalPiano,
  type FormaDebito, type Fonte, type Movimento, type PianoRimborso, type TipoFonte, type TipoMovimento,
} from "@/lib/orders/generali/investitoriConti";
import {
  COLONNE_FONTE, COLONNE_MOVIMENTO, COLONNE_RENDICONTO, contaVendite, leggiFonti, leggiMovimenti, leggiRendiconti,
  type RendicontoInviato, type VenditeUnita,
} from "@/lib/orders/generali/investitoriLettura";

// Tabelle nuove, non ancora nei tipi generati: cast localizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const chiaviInvestitori = {
  fonti: (generaleId: string | undefined) => ["generale-fonti", generaleId] as const,
  movimenti: (generaleId: string | undefined) => ["generale-fonti-movimenti", generaleId] as const,
  rendiconti: (generaleId: string | undefined) => ["generale-rendiconti", generaleId] as const,
  vendite: (generaleId: string | undefined) => ["generale-investitori-vendite", generaleId] as const,
};

/** Il messaggio del database se è scritto per chi usa l'app; altrimenti uno generico. */
export function messaggioInvestitori(e: unknown, cosa: string): string {
  const err = e as { code?: string; message?: string } | null;
  if (err?.code === "22023" || err?.code === "P0002") return err.message ?? `Non è stato possibile salvare ${cosa}.`;
  if (err?.code === "42501") return "Non hai il permesso di modificare gli investitori di questa commessa.";
  if (err?.code === "23514") return `Un valore di ${cosa} non è accettato: controlla importi, percentuali e date.`;
  return `Non è stato possibile salvare ${cosa}. Riprova tra poco.`;
}

export function useFontiGenerale(generaleId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: chiaviInvestitori.fonti(generaleId),
    enabled: !!generaleId && enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<Fonte[]> => {
      const { data, error } = await db
        .from("generale_fonti")
        .select(COLONNE_FONTE)
        .eq("generale_id", generaleId!)
        .order("ordine", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return leggiFonti(data);
    },
  });
}

export function useMovimentiFonti(generaleId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: chiaviInvestitori.movimenti(generaleId),
    enabled: !!generaleId && enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<Movimento[]> => {
      const { data, error } = await db
        .from("generale_fonti_movimenti")
        .select(COLONNE_MOVIMENTO)
        .eq("generale_id", generaleId!)
        .order("data", { ascending: true })
        .limit(5000);
      if (error) throw error;
      return leggiMovimenti(data);
    },
  });
}

export function useRendicontiInviati(generaleId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: chiaviInvestitori.rendiconti(generaleId),
    enabled: !!generaleId && enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<RendicontoInviato[]> => {
      const { data, error } = await db
        .from("generale_rendiconti")
        .select(COLONNE_RENDICONTO)
        .eq("generale_id", generaleId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return leggiRendiconti(data);
    },
  });
}

/** Le unità per stato di vendita (modulo Unità e vendite). Tabella assente o non leggibile: null, senza errori. */
export function useVenditeGenerale(generaleId: string | undefined, figlieIds: string[], enabled = true) {
  const chiave = [...figlieIds].sort().join(",");
  return useQuery({
    queryKey: [...chiaviInvestitori.vendite(generaleId), chiave],
    enabled: !!generaleId && enabled && figlieIds.length > 0,
    staleTime: 5 * 60_000,
    meta: { silent: true },
    queryFn: async (): Promise<VenditeUnita | null> => {
      try {
        const { data, error } = await db.from("unita_immobiliari").select("order_id, stato_vendita, divisa_il").in("order_id", figlieIds).limit(2000);
        if (error) return null;
        return contaVendite(data, figlieIds);
      } catch {
        return null;
      }
    },
  });
}

const oggiIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Tutto il modulo in una chiamata: fonti, movimenti, numeri del piano e conti.
 * Vuoto (e nessuna lettura) senza il permesso sui margini.
 */
export function useGeneraleInvestitori(riepilogo: RiepilogoGenerale | undefined, opzioni: { enabled?: boolean } = {}) {
  const generaleId = riepilogo?.generale.id;
  const attivo = (opzioni.enabled ?? true) && !!riepilogo?.permessi.margini;
  const fonti = useFontiGenerale(generaleId, attivo);
  const movimenti = useMovimentiFonti(generaleId, attivo);
  const piano = useGeneralePianoNumeri(riepilogo, { enabled: attivo });
  const oggi = oggiIso();

  const numeriPiano = useMemo(() => (piano.piano ? numeriPerInvestitori(piano.piano) : null), [piano.piano]);
  const numeri = useMemo(
    () => (piano.piano && numeriPiano ? numeriDalPiano(numeriPiano, piano.piano.confronto.costi) : null),
    [piano.piano, numeriPiano],
  );
  const elencoFonti = Array.isArray(fonti.data) ? fonti.data : [];
  const elencoMovimenti = Array.isArray(movimenti.data) ? movimenti.data : [];
  const conti = useMemo(
    () => calcolaInvestitori({ fonti: elencoFonti, movimenti: elencoMovimenti, numeri, oggi }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fonti.data, movimenti.data, numeri, oggi],
  );

  return {
    fonti: elencoFonti,
    movimenti: elencoMovimenti,
    numeriPiano,
    numeri,
    conti,
    oggi,
    pianoVuoto: piano.vuoto,
    pianoInBozza: piano.inVista?.stato === "bozza",
    isLoading: fonti.isLoading || movimenti.isLoading || piano.isLoading,
    isError: fonti.isError || movimenti.isError,
    refetch: () => {
      void fonti.refetch();
      void movimenti.refetch();
    },
  };
}

// ── Salvataggi ─────────────────────────────────────────────────────────────

export interface FonteDaSalvare {
  id?: string;
  tipo: TipoFonte;
  nome: string;
  soggetto: "persona" | "societa";
  clienteId: string | null;
  email: string | null;
  impegno: number;
  quotaUtilePct: number | null;
  tassoPct: number | null;
  dataInizio: string | null;
  scadenza: string | null;
  nota: string | null;
  forma: FormaDebito | null;
  speseIniziali: number;
  rimborso: PianoRimborso;
  ammortamentoDal: string | null;
}

const fontePerDb = (f: FonteDaSalvare) => ({
  tipo: f.tipo,
  nome: f.nome.trim().slice(0, 200),
  soggetto: f.soggetto,
  cliente_id: f.clienteId,
  email: f.email?.trim() || null,
  impegno: Math.max(0, Math.round(f.impegno * 100) / 100),
  quota_utile_pct: f.quotaUtilePct,
  tasso_pct: f.tassoPct,
  data_inizio: f.dataInizio || null,
  scadenza: f.scadenza || null,
  nota: f.nota?.trim() || null,
  forma: f.forma,
  spese_iniziali: Math.max(0, Math.round(f.speseIniziali * 100) / 100),
  rimborso: f.rimborso,
  ammortamento_dal: f.ammortamentoDal || null,
});

function useInvalida(generaleId: string) {
  const qc = useQueryClient();
  return {
    fonti: () => qc.invalidateQueries({ queryKey: chiaviInvestitori.fonti(generaleId) }),
    movimenti: () => qc.invalidateQueries({ queryKey: chiaviInvestitori.movimenti(generaleId) }),
    rendiconti: () => qc.invalidateQueries({ queryKey: chiaviInvestitori.rendiconti(generaleId) }),
  };
}

export function useSalvaFonte(generaleId: string) {
  const invalida = useInvalida(generaleId);
  return useMutation({
    mutationFn: async (f: FonteDaSalvare) => {
      const riga = fontePerDb(f);
      if (f.id) {
        const { error } = await db.from("generale_fonti").update(riga).eq("id", f.id);
        if (error) throw error;
        return f.id;
      }
      // company_id lo riscrive il trigger dalla generale; serve solo a passare il NOT NULL.
      const { data: g } = await db.from("commesse_generali").select("company_id").eq("order_id", generaleId).maybeSingle();
      const { data, error } = await db
        .from("generale_fonti")
        .insert({ ...riga, generale_id: generaleId, company_id: g?.company_id })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => void invalida.fonti(),
  });
}

export function useEliminaFonte(generaleId: string) {
  const invalida = useInvalida(generaleId);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("generale_fonti").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void invalida.fonti();
      void invalida.movimenti();
    },
  });
}

export interface MovimentoDaSalvare { fonteId: string; tipo: TipoMovimento; data: string; importo: number; nota: string | null; unitaId?: string | null }

export function useAggiungiMovimento(generaleId: string) {
  const invalida = useInvalida(generaleId);
  return useMutation({
    mutationFn: async (m: MovimentoDaSalvare) => {
      // company_id e generale_id li riscrive il trigger dalla fonte.
      const { data: g } = await db.from("commesse_generali").select("company_id").eq("order_id", generaleId).maybeSingle();
      const { error } = await db.from("generale_fonti_movimenti").insert({
        fonte_id: m.fonteId,
        generale_id: generaleId,
        company_id: g?.company_id,
        tipo: m.tipo,
        data: m.data,
        importo: Math.round(m.importo * 100) / 100,
        nota: m.nota?.trim() || null,
        unita_id: m.unitaId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => void invalida.movimenti(),
  });
}

export function useEliminaMovimento(generaleId: string) {
  const invalida = useInvalida(generaleId);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("generale_fonti_movimenti").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void invalida.movimenti(),
  });
}

export interface InvioRendiconto {
  fonteId: string;
  to: string;
  subject: string;
  message: string;
  filename: string;
  pdf: Blob;
  numeri: unknown;
}

async function base64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Manda il rendiconto all'investitore (edge function generale-rendiconto-invia) e aggiorna lo storico. */
export function useInviaRendiconto(generaleId: string) {
  const invalida = useInvalida(generaleId);
  return useMutation({
    mutationFn: async (r: InvioRendiconto) => {
      const { data, error } = await supabase.functions.invoke("generale-rendiconto-invia", {
        body: {
          fonte_id: r.fonteId,
          to: r.to,
          subject: r.subject,
          message: r.message,
          filename: r.filename,
          pdf_base64: await base64(r.pdf),
          numeri: r.numeri,
        },
      });
      if (error) {
        // Il messaggio scritto dalla funzione sta nel corpo della risposta.
        const ctx = (error as { context?: Response }).context;
        const corpo = ctx && typeof ctx.json === "function" ? await ctx.json().catch((): null => null) : null;
        throw new Error((corpo as { error?: string } | null)?.error ?? "Invio non riuscito. Riprova tra poco.");
      }
      return data as { id: string };
    },
    onSettled: () => void invalida.rendiconti(),
  });
}

/** Un link temporaneo per riaprire il PDF di un rendiconto inviato. */
export async function linkPdfRendiconto(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("generale-rendiconti").createSignedUrl(path, 300);
  if (error || !data?.signedUrl) throw error ?? new Error("PDF non trovato");
  return data.signedUrl;
}

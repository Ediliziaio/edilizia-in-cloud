/**
 * useRistrutturazioneProgetto — CRUD del progetto (hub) del verticale
 * Ristrutturazione + computo metrico + media.
 *
 * Tabelle: `rst_progetti`, `rst_computo_voci`, `rst_progetti_media`.
 *
 * NB: come per `useListinoLavorazioni.ts`, le tabelle `rst_*` provengono dalla
 * migrazione LOCALE `20271001000000_rst_modulo_wave1.sql` e NON sono ancora
 * applicate sul remoto → non esistono nei tipi generati di Supabase. Usiamo
 * quindi il cast `supabase as any` (stesso pattern di `useResellerPlans.ts`)
 * così build/eslint passano senza rigenerare i tipi.
 *
 * Pricing: il salvataggio del computo ricalcola SEMPRE `importo` di ogni riga
 * via `calcRigaImporto` (single source of truth lato client) e persiste
 * `totale_imponibile`/`totale` sul progetto via `calcTotaliComputo`. Nessun
 * valore di importo arriva "fidato" dal form: viene sempre derivato qui.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { calcRigaImporto, calcTotaliComputo } from "@/lib/ristrutturazione/calcoli";
import type {
  RstProgetto,
  RstComputoVoce,
  RstProgettoMedia,
} from "@/types/ristrutturazione";

// Tipi rst_* non rigenerati: cast unico, riusato in tutto il file.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = () => supabase as any;

// ─── Query keys ────────────────────────────────────────────────────────────
const K = {
  progetti: (companyId: string | null) => ["rst-progetti", companyId] as const,
  progetto: (id: string | undefined) => ["rst-progetto", id ?? "none"] as const,
};

/** Dettaglio progetto: hub + computo voci (ordinate) + media. */
export interface RstProgettoDetail {
  progetto: RstProgetto;
  computo: RstComputoVoce[];
  media: RstProgettoMedia[];
}

// ─── Re-export helper company id (richiesto dai consumer del wizard) ────────
export { useEffectiveCompanyId };

// ─── Lista progetti ──────────────────────────────────────────────────────────
export function useRistrutturazioneProgetti() {
  const companyId = useEffectiveCompanyId();
  return useQuery<RstProgetto[]>({
    queryKey: K.progetti(companyId),
    enabled: !!companyId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await sb()
        .from("rst_progetti")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as RstProgetto[];
    },
  });
}

// ─── Singolo progetto (+ computo + media) ─────────────────────────────────────
export function useRistrutturazioneProgetto(id: string | undefined) {
  return useQuery<RstProgettoDetail | null>({
    queryKey: K.progetto(id),
    enabled: !!id,
    queryFn: async () => {
      const [
        { data: progetto, error: e1 },
        { data: computo, error: e2 },
        { data: media, error: e3 },
      ] = await Promise.all([
        sb().from("rst_progetti").select("*").eq("id", id!).maybeSingle(),
        sb()
          .from("rst_computo_voci")
          .select("*")
          .eq("progetto_id", id!)
          .order("ordine", { ascending: true })
          .order("created_at", { ascending: true }),
        sb()
          .from("rst_progetti_media")
          .select("*")
          .eq("progetto_id", id!)
          .order("ordine", { ascending: true }),
      ]);
      if (e1) throw new Error(e1.message);
      if (e2) throw new Error(e2.message);
      if (e3) throw new Error(e3.message);
      if (!progetto) return null;
      return {
        progetto: progetto as RstProgetto,
        computo: (computo ?? []) as RstComputoVoce[],
        media: (media ?? []) as RstProgettoMedia[],
      };
    },
  });
}

// ─── Upsert progetto ──────────────────────────────────────────────────────────
export type RstProgettoPatch = Partial<Omit<RstProgetto, "id" | "company_id">>;

/**
 * Genera un codice progressivo leggibile per il progetto (es. RST-2026-007).
 * La tabella `rst_progetti.code` non ha trigger DB: lo deriviamo client-side
 * dal numero di progetti già esistenti per l'azienda nell'anno corrente.
 * Best-effort: in caso di errore di conteggio si usa un fallback timestamp.
 */
async function generateProgettoCode(companyId: string): Promise<string> {
  const year = new Date().getFullYear();
  try {
    const { count, error } = await sb()
      .from("rst_progetti")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId);
    if (error) throw error;
    const n = (count ?? 0) + 1;
    return `RST-${year}-${String(n).padStart(3, "0")}`;
  } catch {
    return `RST-${year}-${Date.now().toString().slice(-5)}`;
  }
}

export function useUpsertProgetto() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: RstProgettoPatch & { id?: string },
    ): Promise<RstProgetto> => {
      if (!companyId) throw new Error("Company non disponibile");
      const { id, ...patch } = input;
      if (id) {
        const { data, error } = await sb()
          .from("rst_progetti")
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("company_id", companyId)
          .select()
          .single();
        if (error) throw new Error(error.message);
        return data as RstProgetto;
      }
      // Insert: assicura code + company_id + stato di default.
      const code = (patch.code as string | null | undefined) ?? (await generateProgettoCode(companyId));
      const { data, error } = await sb()
        .from("rst_progetti")
        .insert({
          ...patch,
          code,
          company_id: companyId,
          stato: patch.stato ?? "bozza",
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as RstProgetto;
    },
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: K.progetti(companyId) });
      if (row?.id) void qc.invalidateQueries({ queryKey: K.progetto(row.id) });
    },
  });
}

// ─── Delete progetto ──────────────────────────────────────────────────────────
export function useDeleteProgetto() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      if (!companyId) throw new Error("Company non disponibile");
      // rst_computo_voci / rst_progetti_media hanno FK ON DELETE CASCADE.
      const { error } = await sb()
        .from("rst_progetti")
        .delete()
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: K.progetti(companyId) });
    },
  });
}

// ─── Salvataggio computo (replace bulk) ──────────────────────────────────────
/** Riga di computo in input al salvataggio (id opzionale: viene rigenerato). */
export type ComputoVoceInput = Omit<
  RstComputoVoce,
  "id" | "progetto_id" | "company_id" | "importo"
> & { id?: string };

export function useSaveComputo(progettoId: string | undefined) {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      righe: ComputoVoceInput[],
    ): Promise<{ totale_imponibile: number; totale: number }> => {
      if (!companyId) throw new Error("Company non disponibile");
      if (!progettoId) throw new Error("Progetto id mancante");

      // 1) Leggi i parametri economici correnti del progetto (sconto/iva) per
      //    derivare i totali. Single source of truth lato DB per sconto/iva.
      const { data: prog, error: pErr } = await sb()
        .from("rst_progetti")
        .select("sconto_pct, iva_pct")
        .eq("id", progettoId)
        .eq("company_id", companyId)
        .maybeSingle();
      if (pErr) throw new Error(pErr.message);
      const sconto_pct = Number(prog?.sconto_pct ?? 0);
      const iva_pct = Number(prog?.iva_pct ?? 22);

      // 2) Ricalcola importo di ogni riga PRIMA dell'insert (mai fidarsi del
      //    valore in arrivo dal form) + ordine progressivo stabile.
      const rows = righe.map((r, idx) => {
        const importo = calcRigaImporto({
          quantita: Number(r.quantita) || 0,
          prezzo_unitario: Number(r.prezzo_unitario) || 0,
          sconto_pct: Number(r.sconto_pct) || 0,
        });
        return {
          progetto_id: progettoId,
          company_id: companyId,
          capitolo_nome: r.capitolo_nome?.trim() || "Generale",
          descrizione: r.descrizione?.trim() || "",
          unita_misura: r.unita_misura,
          quantita: Number(r.quantita) || 0,
          prezzo_unitario: Number(r.prezzo_unitario) || 0,
          costo_materiali: Number(r.costo_materiali) || 0,
          costo_manodopera: Number(r.costo_manodopera) || 0,
          sconto_pct: Number(r.sconto_pct) || 0,
          importo,
          margine_eur: Number(r.margine_eur) || 0,
          margine_pct: Number(r.margine_pct) || 0,
          listino_voce_id: r.listino_voce_id ?? null,
          ordine: r.ordine ?? idx,
        };
      });

      // 3) Replace bulk: cancella le righe esistenti del progetto, poi inserisce.
      const { error: dErr } = await sb()
        .from("rst_computo_voci")
        .delete()
        .eq("progetto_id", progettoId)
        .eq("company_id", companyId);
      if (dErr) throw new Error(dErr.message);
      if (rows.length > 0) {
        const { error: iErr } = await sb().from("rst_computo_voci").insert(rows);
        if (iErr) throw new Error(iErr.message);
      }

      // 4) Aggiorna totali sul progetto (imponibile/totale post sconto+IVA).
      const totali = calcTotaliComputo(
        rows.map((r) => ({
          capitolo_nome: r.capitolo_nome,
          quantita: r.quantita,
          prezzo_unitario: r.prezzo_unitario,
          sconto_pct: r.sconto_pct,
          costo_materiali: r.costo_materiali,
          costo_manodopera: r.costo_manodopera,
        })),
        { sconto_pct, iva_pct },
      );
      const { error: uErr } = await sb()
        .from("rst_progetti")
        .update({
          totale_imponibile: totali.imponibile,
          totale: totali.totale,
          updated_at: new Date().toISOString(),
        })
        .eq("id", progettoId)
        .eq("company_id", companyId);
      if (uErr) throw new Error(uErr.message);

      return { totale_imponibile: totali.imponibile, totale: totali.totale };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: K.progetto(progettoId) });
      void qc.invalidateQueries({ queryKey: K.progetti(companyId) });
    },
  });
}

// ─── Upsert media ─────────────────────────────────────────────────────────────
export interface MediaPayload {
  id?: string;
  tipo?: string;
  url: string;
  caption?: string | null;
  ordine?: number;
}

export function useUpsertMedia(progettoId: string | undefined) {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: MediaPayload): Promise<RstProgettoMedia> => {
      if (!companyId) throw new Error("Company non disponibile");
      if (!progettoId) throw new Error("Progetto id mancante");
      const row = {
        progetto_id: progettoId,
        company_id: companyId,
        tipo: payload.tipo?.trim() || "situazione",
        url: payload.url,
        caption: payload.caption?.trim() || null,
        ordine: payload.ordine ?? 0,
      };
      const q = payload.id
        ? sb()
            .from("rst_progetti_media")
            .update(row)
            .eq("id", payload.id)
            .eq("company_id", companyId)
            .select()
            .single()
        : sb().from("rst_progetti_media").insert(row).select().single();
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data as RstProgettoMedia;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: K.progetto(progettoId) });
    },
  });
}

export function useDeleteMedia(progettoId: string | undefined) {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      if (!companyId) throw new Error("Company non disponibile");
      const { error } = await sb()
        .from("rst_progetti_media")
        .delete()
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: K.progetto(progettoId) });
    },
  });
}

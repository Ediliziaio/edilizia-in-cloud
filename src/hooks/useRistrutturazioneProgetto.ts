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
  RstTemplatePdf,
  RstListItem,
  RstTestimonianza,
  RstCronoFase,
} from "@/types/ristrutturazione";

// Tipi rst_* non rigenerati: cast unico, riusato in tutto il file.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = () => supabase as any;

// ─── Query keys ────────────────────────────────────────────────────────────
const K = {
  progetti: (companyId: string | null) => ["rst-progetti", companyId] as const,
  progetto: (id: string | undefined) => ["rst-progetto", id ?? "none"] as const,
  template: (companyId: string | null) => ["rst-template", companyId] as const,
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
        const quantita = Number(r.quantita) || 0;
        const costo_materiali = Number(r.costo_materiali) || 0;
        const costo_manodopera = Number(r.costo_manodopera) || 0;
        const importo = calcRigaImporto({
          quantita,
          prezzo_unitario: Number(r.prezzo_unitario) || 0,
          sconto_pct: Number(r.sconto_pct) || 0,
        });
        // Margine reale della riga (coerente con VoceRow/calcTotaliComputo):
        // costo riga = (materiali + manodopera) * quantità; il margine deriva
        // dall'importo già ricalcolato. Clamp NaN→0 per non persistere sporco.
        const costoRiga = (costo_materiali + costo_manodopera) * quantita;
        const margine_eur_raw = importo - costoRiga;
        const margine_pct_raw = importo > 0 ? (margine_eur_raw / importo) * 100 : 0;
        const margine_eur = Number.isFinite(margine_eur_raw) ? margine_eur_raw : 0;
        const margine_pct = Number.isFinite(margine_pct_raw) ? margine_pct_raw : 0;
        return {
          progetto_id: progettoId,
          company_id: companyId,
          capitolo_nome: r.capitolo_nome?.trim() || "Generale",
          descrizione: r.descrizione?.trim() || "",
          unita_misura: r.unita_misura,
          quantita,
          prezzo_unitario: Number(r.prezzo_unitario) || 0,
          costo_materiali,
          costo_manodopera,
          sconto_pct: Number(r.sconto_pct) || 0,
          importo,
          margine_eur,
          margine_pct,
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

// ─── Template PDF (un record/azienda) ────────────────────────────────────────
// Default coerenti con la migrazione `rst_template_pdf` (color_* + show_*).
// Le liste jsonb si normalizzano sempre ad array per non rompere `.map` in UI/PDF.
const RST_TEMPLATE_DEFAULTS = {
  color_primary: "#1E3A5F",
  color_secondary: "#F97316",
  color_accent: "#16A34A",
  color_text: "#212529",
  show_chi_siamo: true,
  show_cronoprogramma: true,
  show_margine: false,
} as const;

/**
 * True se l'errore Supabase indica che la tabella `rst_template_pdf` (o lo schema
 * rst_*) NON esiste ancora sul DB → il modulo Ristrutturazione non è stato ancora
 * pubblicato (migrazione `20271001000000_rst_modulo_wave1.sql` non applicata sul
 * remoto). PostgREST risponde 404 con code `PGRST205` ("Could not find the table
 * ... in the schema cache"); il DB diretto userebbe `42P01` ("relation does not
 * exist"). Riconoscerlo permette di degradare con grazia (default in-memory +
 * banner) invece di restare bloccati sullo skeleton.
 */
export function isRstModuleNotPublished(
  err: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  if (!err) return false;
  const code = err.code ?? "";
  const msg = err.message ?? "";
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    /could not find the table|schema cache|does not exist|rst_template_pdf|rst_progetti/i.test(msg)
  );
}

const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Normalizza una riga grezza del DB nel tipo `RstTemplatePdf` (liste sempre array). */
function normalizeTemplate(row: Record<string, unknown> | null, companyId: string): RstTemplatePdf {
  const r = row ?? {};
  return {
    id: (r.id as string) ?? "",
    company_id: (r.company_id as string) ?? companyId,
    logo_url: (r.logo_url as string | null) ?? null,
    color_primary: (r.color_primary as string | null) ?? RST_TEMPLATE_DEFAULTS.color_primary,
    color_secondary: (r.color_secondary as string | null) ?? RST_TEMPLATE_DEFAULTS.color_secondary,
    color_accent: (r.color_accent as string | null) ?? RST_TEMPLATE_DEFAULTS.color_accent,
    color_text: (r.color_text as string | null) ?? RST_TEMPLATE_DEFAULTS.color_text,
    chi_siamo: (r.chi_siamo as string | null) ?? null,
    chi_siamo_foto_url: (r.chi_siamo_foto_url as string | null) ?? null,
    esigenze: asArray<RstListItem>(r.esigenze),
    soluzione: asArray<RstListItem>(r.soluzione),
    usp: asArray<RstListItem>(r.usp),
    testimonianze: asArray<RstTestimonianza>(r.testimonianze),
    cronoprogramma: asArray<RstCronoFase>(r.cronoprogramma),
    cover_title: (r.cover_title as string | null) ?? null,
    cover_subtitle: (r.cover_subtitle as string | null) ?? null,
    cover_image_url: (r.cover_image_url as string | null) ?? null,
    payment_terms_text: (r.payment_terms_text as string | null) ?? null,
    validity_text: (r.validity_text as string | null) ?? null,
    footer_text: (r.footer_text as string | null) ?? null,
    show_chi_siamo: (r.show_chi_siamo as boolean | null) ?? RST_TEMPLATE_DEFAULTS.show_chi_siamo,
    show_cronoprogramma: (r.show_cronoprogramma as boolean | null) ?? RST_TEMPLATE_DEFAULTS.show_cronoprogramma,
    show_margine: (r.show_margine as boolean | null) ?? RST_TEMPLATE_DEFAULTS.show_margine,
  };
}

/**
 * Legge il template PDF dell'azienda corrente (un record/azienda). Ritorna
 * SEMPRE un template normalizzato (mai null): se la riga non esiste ancora,
 * si restituisce un default in-memory (l'upsert la crea al primo salvataggio).
 * Standalone (non-hook) per riuso dal generatore PDF (`useFreshTemplate`).
 */
export async function getRstTemplatePdf(companyId: string): Promise<RstTemplatePdf> {
  const { data, error } = await sb()
    .from("rst_template_pdf")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) {
    // Modulo non ancora pubblicato (tabella assente): ritorna i default in-memory
    // così editor e anteprima PDF si aprono comunque. Il salvataggio segnalerà a
    // parte, in modo esplicito, che serve pubblicare il modulo.
    if (isRstModuleNotPublished(error)) return normalizeTemplate(null, companyId);
    throw new Error(error.message);
  }
  return normalizeTemplate(data as Record<string, unknown> | null, companyId);
}

export function useRstTemplatePdf() {
  const companyId = useEffectiveCompanyId();
  return useQuery<RstTemplatePdf>({
    queryKey: K.template(companyId),
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: () => getRstTemplatePdf(companyId!),
  });
}

/** Template di default (in-memory) per quando il modulo non è ancora pubblicato. */
export function getDefaultRstTemplatePdf(companyId: string | null): RstTemplatePdf {
  return normalizeTemplate(null, companyId ?? "");
}

/**
 * Probe leggera (HEAD) per sapere se il modulo Ristrutturazione è pubblicato sul
 * DB (tabella `rst_template_pdf` esistente). `false` ⇒ l'editor mostra i default
 * ma il salvataggio non è ancora possibile. Nessun retry: l'esito è immediato e
 * non deve far lampeggiare lo skeleton in attesa di backoff.
 */
export function useRstBackendReady() {
  const companyId = useEffectiveCompanyId();
  return useQuery<boolean>({
    queryKey: ["rst-backend-ready", companyId] as const,
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      // GET (non HEAD): su 404 il body PostgREST espone code/message, così
      // `isRstModuleNotPublished` riconosce la tabella mancante. Una HEAD non ha
      // body e l'errore arriverebbe generico (non riconosciuto → falso negativo).
      const { error } = await sb()
        .from("rst_template_pdf")
        .select("id")
        .limit(1);
      if (error) {
        if (isRstModuleNotPublished(error)) return false;
        throw new Error(error.message);
      }
      return true;
    },
  });
}

/** Patch upsert del template (un record/azienda, chiave unica `company_id`). */
export type RstTemplatePatch = Partial<Omit<RstTemplatePdf, "id" | "company_id">>;

export function useUpsertRstTemplatePdf() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: RstTemplatePatch): Promise<RstTemplatePdf> => {
      if (!companyId) throw new Error("Company non disponibile");
      // upsert su company_id (UNIQUE): crea al primo salvataggio, aggiorna poi.
      const { data, error } = await sb()
        .from("rst_template_pdf")
        .upsert(
          { ...patch, company_id: companyId, updated_at: new Date().toISOString() },
          { onConflict: "company_id" },
        )
        .select()
        .single();
      if (error) {
        if (isRstModuleNotPublished(error)) {
          throw new Error(
            "Il modulo Ristrutturazione non è ancora pubblicato sul database: applica la migrazione (pubblica il modulo) per salvare il template.",
          );
        }
        throw new Error(error.message);
      }
      return normalizeTemplate(data as Record<string, unknown> | null, companyId);
    },
    onSuccess: (row) => {
      qc.setQueryData(K.template(companyId), row);
      void qc.invalidateQueries({ queryKey: K.template(companyId) });
    },
  });
}

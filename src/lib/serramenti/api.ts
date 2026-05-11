/**
 * src/lib/serramenti/api.ts — API client modulo Stima Serramenti
 *
 * Tutte le query rispettano il pattern Supabase con error handling esplicito.
 * Tabelle sr_* (mirror in src/types/serramenti.ts).
 */
import { supabase } from "@/integrations/supabase/client";
import type {
  SrProgettoRow,
  SrSerramentoRow,
  SrAccessorioRow,
  SrMediaRow,
  SrCalcoloRisparmioRow,
  SrTemplatePdfRow,
  SrProgettoDetail,
  SrStatoProgetto,
  SrTipoIntervento,
} from "@/types/serramenti";

// ─── PROGETTI ───────────────────────────────────────────────────────────────

export interface SrCreateProgettoInput {
  cliente_id?: string | null;
  cliente_nome?: string | null;
  cliente_cognome?: string | null;
  cantiere_indirizzo?: string | null;
  cantiere_citta?: string | null;
  tipo_intervento?: SrTipoIntervento;
  sopralluogo_id?: string | null;
  opportunita_id?: string | null;
}

export async function createProgetto(input: SrCreateProgettoInput): Promise<SrProgettoRow> {
  // company_id viene iniettato dal trigger / RLS check via profiles.company_id
  const { data: profile } = await supabase
    .from("profiles" as never)
    .select("company_id")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const companyId = (profile as any)?.company_id;
  if (!companyId) throw new Error("Profilo senza azienda associata");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("sr_progetti")
    .insert({
      company_id: companyId,
      cliente_id: input.cliente_id ?? null,
      cliente_nome: input.cliente_nome ?? null,
      cliente_cognome: input.cliente_cognome ?? null,
      cantiere_indirizzo: input.cantiere_indirizzo ?? null,
      cantiere_citta: input.cantiere_citta ?? null,
      tipo_intervento: input.tipo_intervento ?? "sostituzione",
      sopralluogo_id: input.sopralluogo_id ?? null,
      opportunita_id: input.opportunita_id ?? null,
      stato: "bozza",
    })
    .select("*")
    .single();
  if (error) {
    console.error("[serramenti] createProgetto failed", error);
    throw new Error("Creazione progetto serramenti fallita");
  }
  return data as SrProgettoRow;
}

export async function createProgettoDaSopralluogo(
  sopralluogo_id: string,
  cliente_id?: string,
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("sr_create_progetto_da_sopralluogo", {
    p_sopralluogo_id: sopralluogo_id,
    p_cliente_id: cliente_id ?? null,
  });
  if (error) {
    console.error("[serramenti] createProgettoDaSopralluogo failed", error);
    throw new Error("Creazione progetto da sopralluogo fallita");
  }
  return data as string;
}

export async function listProgetti(opts?: { stato?: SrStatoProgetto; limit?: number }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from("sr_progetti")
    .select("id, code, stato, cliente_nome, cliente_cognome, cantiere_citta, totale_min, totale_max, totale_serramenti, tipo_intervento, materiale_principale, created_at, updated_at, consulenza_at, pdf_url")
    .order("created_at", { ascending: false });
  if (opts?.stato) q = q.eq("stato", opts.stato);
  if (opts?.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) {
    console.error("[serramenti] listProgetti failed", error);
    throw new Error("Errore caricamento progetti serramenti");
  }
  return (data ?? []) as SrProgettoRow[];
}

export async function getProgetto(id: string): Promise<SrProgettoDetail> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const [
    { data: progetto, error: e1 },
    { data: serramenti, error: e2 },
    { data: accessori, error: e3 },
    { data: media, error: e4 },
    { data: risparmio, error: e5 },
  ] = await Promise.all([
    sb.from("sr_progetti").select("*").eq("id", id).maybeSingle(),
    sb.from("sr_serramenti_progetto").select("*").eq("progetto_id", id).order("position"),
    sb.from("sr_accessori_progetto").select("*").eq("progetto_id", id).order("position"),
    sb.from("sr_progetti_media").select("*").eq("progetto_id", id).order("position"),
    sb.from("sr_calcolo_risparmio").select("*").eq("progetto_id", id).maybeSingle(),
  ]);

  if (e1 || !progetto) {
    console.error("[serramenti] getProgetto failed", e1);
    throw new Error("Progetto non trovato");
  }
  if (e2 || e3 || e4) {
    console.error("[serramenti] getProgetto related failed", e2 || e3 || e4);
    throw new Error("Errore caricamento dati progetto");
  }
  if (e5 && e5.code !== "PGRST116") {
    console.warn("[serramenti] getProgetto risparmio missing", e5);
  }

  return {
    progetto: progetto as SrProgettoRow,
    serramenti: (serramenti ?? []) as SrSerramentoRow[],
    accessori: (accessori ?? []) as SrAccessorioRow[],
    media: (media ?? []) as SrMediaRow[],
    risparmio: (risparmio ?? null) as SrCalcoloRisparmioRow | null,
  };
}

export async function updateProgetto(id: string, patch: Partial<SrProgettoRow>): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("sr_progetti").update(patch).eq("id", id);
  if (error) {
    console.error("[serramenti] updateProgetto failed", error);
    throw new Error("Salvataggio progetto fallito");
  }
}

export async function deleteProgetto(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("sr_progetti").delete().eq("id", id);
  if (error) throw new Error("Eliminazione progetto fallita");
}

// ─── SERRAMENTI (BOM) ───────────────────────────────────────────────────────

export async function addSerramento(
  progetto_id: string,
  serramento: Partial<SrSerramentoRow>,
): Promise<SrSerramentoRow> {
  const { data: progetto } = await supabase
    .from("sr_progetti" as never)
    .select("company_id")
    .eq("id", progetto_id)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const companyId = (progetto as any)?.company_id;
  if (!companyId) throw new Error("Progetto non trovato");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("sr_serramenti_progetto")
    .insert({
      progetto_id,
      company_id: companyId,
      position: serramento.position ?? 0,
      tipologia: serramento.tipologia ?? "finestra_1anta",
      tipologia_label: serramento.tipologia_label ?? null,
      ambiente: serramento.ambiente ?? null,
      materiale: serramento.materiale ?? null,
      serie: serramento.serie ?? null,
      vetro: serramento.vetro ?? null,
      apertura: serramento.apertura ?? null,
      larghezza_mm: serramento.larghezza_mm ?? null,
      altezza_mm: serramento.altezza_mm ?? null,
      quantita: serramento.quantita ?? 1,
      prezzo_unitario: serramento.prezzo_unitario ?? null,
      prezzo_totale: serramento.prezzo_totale ?? null,
      note: serramento.note ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error("Aggiunta serramento fallita");
  return data as SrSerramentoRow;
}

export async function updateSerramento(id: string, patch: Partial<SrSerramentoRow>): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("sr_serramenti_progetto").update(patch).eq("id", id);
  if (error) throw new Error("Modifica serramento fallita");
}

export async function deleteSerramento(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("sr_serramenti_progetto").delete().eq("id", id);
  if (error) throw new Error("Eliminazione serramento fallita");
}

// ─── ACCESSORI (BOM) ────────────────────────────────────────────────────────

export async function addAccessorio(
  progetto_id: string,
  accessorio: Partial<SrAccessorioRow>,
): Promise<SrAccessorioRow> {
  const { data: progetto } = await supabase
    .from("sr_progetti" as never)
    .select("company_id")
    .eq("id", progetto_id)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const companyId = (progetto as any)?.company_id;
  if (!companyId) throw new Error("Progetto non trovato");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("sr_accessori_progetto")
    .insert({
      progetto_id,
      company_id: companyId,
      position: accessorio.position ?? 0,
      tipo: accessorio.tipo ?? "avvolgibile",
      descrizione: accessorio.descrizione ?? null,
      quantita: accessorio.quantita ?? 1,
      prezzo_unitario: accessorio.prezzo_unitario ?? null,
      prezzo_totale: accessorio.prezzo_totale ?? null,
      serramento_id: accessorio.serramento_id ?? null,
      note: accessorio.note ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error("Aggiunta accessorio fallita");
  return data as SrAccessorioRow;
}

export async function updateAccessorio(id: string, patch: Partial<SrAccessorioRow>): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("sr_accessori_progetto").update(patch).eq("id", id);
  if (error) throw new Error("Modifica accessorio fallita");
}

export async function deleteAccessorio(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("sr_accessori_progetto").delete().eq("id", id);
  if (error) throw new Error("Eliminazione accessorio fallita");
}

// ─── TEMPLATE PDF (per azienda) ─────────────────────────────────────────────

export async function getTemplatePdf(): Promise<SrTemplatePdfRow | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("sr_template_pdf").select("*").maybeSingle();
  if (error && error.code !== "PGRST116") {
    console.error("[serramenti] getTemplatePdf failed", error);
    return null;
  }
  return data as SrTemplatePdfRow | null;
}

// ─── MEDIA ──────────────────────────────────────────────────────────────────

const SR_MEDIA_TTL_SEC = 60 * 60 * 24 * 7;

export interface UploadMediaInput {
  progetto_id: string;
  kind: import("@/types/serramenti").SrMediaKind;
  caption?: string | null;
  posizione_pdf?: string | null;
  serramento_id?: string | null;
  position?: number;
}

export async function uploadMedia(file: File, opts: UploadMediaInput): Promise<import("@/types/serramenti").SrMediaRow> {
  // 1) Ottieni company_id dal progetto
  const { data: prog } = await supabase
    .from("sr_progetti" as never)
    .select("company_id")
    .eq("id", opts.progetto_id)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const companyId = (prog as any)?.company_id;
  if (!companyId) throw new Error("Progetto non trovato");

  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "bin";
  const filename = `${crypto.randomUUID()}.${ext}`;
  const storagePath = `${companyId}/${opts.progetto_id}/photos/${filename}`;

  const { error: uploadErr } = await supabase.storage
    .from("sr-progetti")
    .upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadErr) {
    console.error("[serramenti] uploadMedia storage failed", uploadErr);
    throw new Error("Upload file fallito");
  }

  // Signed URL
  const { data: signed } = await supabase.storage
    .from("sr-progetti")
    .createSignedUrl(storagePath, SR_MEDIA_TTL_SEC);
  const url = signed?.signedUrl ?? "";

  // 2) Insert row
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("sr_progetti_media")
    .insert({
      progetto_id: opts.progetto_id,
      company_id: companyId,
      kind: opts.kind,
      storage_path: storagePath,
      url,
      caption: opts.caption ?? null,
      posizione_pdf: opts.posizione_pdf ?? null,
      serramento_id: opts.serramento_id ?? null,
      position: opts.position ?? 0,
    })
    .select("*")
    .single();
  if (error) {
    // Rollback storage
    try { await supabase.storage.from("sr-progetti").remove([storagePath]); }
    catch (e) { console.warn("[serramenti] uploadMedia rollback failed", e); }
    throw new Error("Registrazione media fallita");
  }
  return data as import("@/types/serramenti").SrMediaRow;
}

export async function deleteMedia(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from("sr_progetti_media").select("storage_path").eq("id", id).maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const storagePath = (existing as any)?.storage_path;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("sr_progetti_media").delete().eq("id", id);
  if (error) throw new Error("Eliminazione media fallita");
  if (storagePath) {
    try {
      const { error: rmErr } = await supabase.storage.from("sr-progetti").remove([storagePath]);
      if (rmErr) console.warn("[serramenti] deleteMedia cleanup failed", storagePath, rmErr);
    } catch (e) {
      console.warn("[serramenti] deleteMedia exception", e);
    }
  }
}

// ─── EDGE FUNCTIONS ─────────────────────────────────────────────────────────

export async function generaPdf(progetto_id: string): Promise<{ html_url: string; duration_ms: number }> {
  const { data, error } = await supabase.functions.invoke("sr-genera-pdf", {
    body: { progetto_id },
  });
  if (error) {
    console.error("[serramenti] generaPdf failed", error);
    throw new Error("Generazione PDF fallita");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = data as any;
  if (!r?.ok) throw new Error(r?.error ?? "Generazione PDF fallita");
  return { html_url: r.html_url, duration_ms: r.duration_ms };
}

export async function convertiInOrdine(progetto_id: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("sr_converti_in_ordine", {
    p_progetto_id: progetto_id,
  });
  if (error) {
    console.error("[serramenti] convertiInOrdine failed", error);
    throw new Error(error.message || "Conversione in commessa fallita");
  }
  return data as string; // ordine_id
}

export async function importDaSopralluogo(input: {
  progetto_id: string;
  sopralluogo_id: string;
  replace?: boolean;
}): Promise<{ imported_count: number; accessori_imported: number }> {
  const { data, error } = await supabase.functions.invoke("sr-import-da-sopralluogo", {
    body: input,
  });
  if (error) {
    console.error("[serramenti] importDaSopralluogo failed", error);
    throw new Error("Import da sopralluogo fallito");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = data as any;
  if (!r?.ok) throw new Error(r?.error ?? "Import fallito");
  return { imported_count: r.imported_count, accessori_imported: r.accessori_imported };
}

export async function upsertTemplatePdf(patch: Partial<SrTemplatePdfRow>): Promise<void> {
  const { data: profile } = await supabase
    .from("profiles" as never)
    .select("company_id")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const companyId = (profile as any)?.company_id;
  if (!companyId) throw new Error("Profilo senza azienda");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("sr_template_pdf")
    .upsert({ ...patch, company_id: companyId }, { onConflict: "company_id" });
  if (error) {
    console.error("[serramenti] upsertTemplatePdf failed", error);
    throw new Error("Salvataggio template fallito");
  }
}

/**
 * quoteBridge — collega i preventivi dei MODULI (rst/tet/bgn/…) al ciclo di
 * chiusura dei preventivi classici SENZA duplicarne l'infrastruttura.
 *
 * Prima il preventivo di un modulo nasceva e moriva in un PDF scaricato:
 * niente invio tracciato, niente firma, niente reminder. Il bridge crea (o
 * aggiorna) una riga `quotes` "ombra" del progetto modulo:
 *   - PDF caricato su storage `quote-pdfs` → la pagina pubblica di firma lo
 *     mostra così com'è (quote-sign action=view ritorna il signed URL);
 *   - chiave di collegamento = quotes.source: "modulo:<key>:<progetto_id>"
 *     (colonna testo libera, zero migration; upsert per-progetto);
 *   - da lì il flusso ESISTENTE fa tutto: send-quote-signature (email +
 *     signature_token + status 'inviata'), quote-sign (view/sign/refuse),
 *     quote-expiry-reminder (cron sui preventivi 'inviata' in scadenza).
 */
import { supabase } from "@/integrations/supabase/client";

export interface ModuleQuoteInput {
  companyId: string;
  userId: string;
  /** Chiave modulo (rst, tetti, bagni, clm, ele, idr, pav, pis). */
  moduleKey: string;
  progettoId: string;
  titolo: string;
  clientName: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
  /** Totali già calcolati dal wizard (il PDF resta la fonte di dettaglio). */
  subtotal: number;
  vatAmount: number;
  total: number;
  validityDays: number;
  pdfBlob: Blob;
}

export interface ModuleQuoteRow {
  id: string;
  quote_number: string;
  status: string;
  signature_token: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  expires_at: string | null;
}

export function moduleSourceTag(moduleKey: string, progettoId: string): string {
  return `modulo:${moduleKey}:${progettoId}`;
}

/**
 * La riga di `quotes` è solo il documento di firma di un preventivo di modulo:
 * il preventivo vero (voci, prezzi, commessa) sta nella tabella del modulo.
 * Non va elencata né convertita come un preventivo classico.
 */
export function eRigaDiModulo(source: string | null | undefined): boolean {
  return typeof source === "string" && source.startsWith("modulo:");
}

/** Chiave del bridge → pagina del modulo (le stesse chiavi di fea-completa-firma). */
const PAGINE_MODULO: Record<string, { nome: string; base: string }> = {
  rst: { nome: "Ristrutturazione", base: "/azienda/ristrutturazione" },
  bagni: { nome: "Bagni", base: "/azienda/bagni" },
  tetti: { nome: "Tetti", base: "/azienda/tetti" },
  clm: { nome: "Climatizzazione", base: "/azienda/climatizzazione" },
  ele: { nome: "Elettrico", base: "/azienda/elettrico" },
  idr: { nome: "Termoidraulico", base: "/azienda/termoidraulico" },
  pav: { nome: "Pavimenti", base: "/azienda/pavimenti" },
  pis: { nome: "Piscine", base: "/azienda/piscine" },
};

/** Il preventivo del modulo a cui appartiene la riga (null se non è una riga di modulo). */
export function preventivoDelModulo(source: string | null | undefined): { nome: string; href: string } | null {
  const trovato = /^modulo:([a-z]+):([0-9a-f-]{36})$/.exec(String(source ?? ""));
  const pagina = trovato ? PAGINE_MODULO[trovato[1]] : undefined;
  return trovato && pagina ? { nome: pagina.nome, href: `${pagina.base}/${trovato[2]}/modifica` } : null;
}

/** Quote collegata al progetto modulo (null se mai preparata). */
export async function getModuleQuote(
  companyId: string,
  moduleKey: string,
  progettoId: string,
): Promise<ModuleQuoteRow | null> {
  const { data, error } = await supabase
    .from("quotes")
    .select("id, quote_number, status, signature_token, sent_at, viewed_at, signed_at, expires_at")
    .eq("company_id", companyId)
    .eq("source", moduleSourceTag(moduleKey, progettoId))
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ModuleQuoteRow | null) ?? null;
}

/**
 * Crea o aggiorna la quote-ombra del progetto: carica il PDF corrente su
 * storage (sovrascrive: il cliente vede sempre l'ultima versione fino alla
 * firma) e sincronizza titolo/cliente/totali/scadenza.
 */
export async function upsertModuleQuote(input: ModuleQuoteInput): Promise<ModuleQuoteRow> {
  const tag = moduleSourceTag(input.moduleKey, input.progettoId);

  // 1. PDF su storage (path stabile per-progetto, upsert).
  const pdfPath = `${input.companyId}/moduli/${input.moduleKey}-${input.progettoId}.pdf`;
  const { error: upErr } = await supabase.storage
    .from("quote-pdfs")
    .upload(pdfPath, input.pdfBlob, { upsert: true, contentType: "application/pdf" });
  if (upErr) throw new Error(`Upload PDF fallito: ${upErr.message}`);

  const expiresAt = new Date(Date.now() + Math.max(1, input.validityDays) * 86_400_000).toISOString();
  const patch = {
    title: input.titolo,
    client_name: input.clientName,
    client_email: input.clientEmail ?? null,
    client_phone: input.clientPhone ?? null,
    subtotal: input.subtotal,
    vat_amount: input.vatAmount,
    total: input.total,
    validity_days: input.validityDays,
    expires_at: expiresAt,
    pdf_storage_path: pdfPath,
    pdf_generated_at: new Date().toISOString(),
  };

  // 2. Upsert per source-tag. Se già FIRMATA non si tocca (il documento
  //    accettato è immutabile: serve una nuova versione/progetto).
  const existing = await getModuleQuote(input.companyId, input.moduleKey, input.progettoId);
  if (existing) {
    if (existing.signed_at) {
      throw new Error("Questo preventivo è già stato firmato dal cliente: non è più modificabile.");
    }
    const { data, error } = await supabase
      .from("quotes")
      .update(patch)
      .eq("id", existing.id)
      .select("id, quote_number, status, signature_token, sent_at, viewed_at, signed_at, expires_at")
      .single();
    if (error) throw new Error(error.message);
    return data as ModuleQuoteRow;
  }

  const { data: numData } = await supabase.rpc("generate_quote_number", {
    p_company_id: input.companyId,
  } as never);
  const quoteNumber = (numData as string | null) || `OFF-${new Date().getFullYear()}-${Date.now() % 100000}`;

  const { data, error } = await supabase
    .from("quotes")
    .insert({
      company_id: input.companyId,
      created_by: input.userId,
      quote_number: quoteNumber,
      status: "bozza",
      source: tag,
      ...patch,
    } as never)
    .select("id, quote_number, status, signature_token, sent_at, viewed_at, signed_at, expires_at")
    .single();
  if (error) throw new Error(error.message);
  return data as ModuleQuoteRow;
}

/** Invia (o reinvia) l'email di firma tramite il flusso esistente. */
export async function sendModuleQuoteSignature(
  quoteId: string,
  recipientEmail: string,
  recipientName: string,
  customMessage?: string,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke("send-quote-signature", {
    body: {
      quote_id: quoteId,
      recipient_email: recipientEmail,
      recipient_name: recipientName,
      custom_message: customMessage || undefined,
    },
  });
  if (error) throw new Error(error.message);
  const payload = data as { success?: boolean; error?: string } | null;
  if (payload && payload.success === false) {
    throw new Error(payload.error || "Invio non riuscito");
  }
}

/** Link pubblico di firma (stessa route dell'email). `quotes.signature_token` è
 *  un uuid e torna con i trattini; la richiesta FEA conserva la stessa stringa
 *  senza trattini: si normalizza, altrimenti il link non risolve. */
export function signatureLink(token: string): string {
  return `${window.location.origin}/firma-fea/${token.replace(/-/g, "")}`;
}

/** Link di firma della richiesta FEA più recente del preventivo (fonte di verità). */
export async function resolveModuleSignatureLink(quoteId: string): Promise<string | null> {
  const { data } = await supabase
    .from("signature_requests")
    .select("token")
    .eq("quote_id", quoteId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.token ? `${window.location.origin}/firma-fea/${data.token}` : null;
}

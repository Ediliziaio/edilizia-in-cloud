// MP02 — Media handling (download Meta, upload storage, transcribe, analyze).
//
// Bucket privato 'whatsapp-media' (migrazione 20280925235700).
// Path: {company_id}/{YYYY-MM}/{uuid}.{ext}
//
// Fino al 25/09/2026 nessuno chiamava lo scaricamento e il bucket non
// esisteva: la foto del DDT arrivava all'analisi come «wa-media://…» e il
// vocale come messaggio vuoto. Ora scaricaMediaDelMessaggio lo fa al primo
// passaggio del messaggio nel processor.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callOpenAI, transcribeAudioWhisper } from "./openai.ts";
import { downloadMetaMedia } from "./metaMedia.ts";
import { resolveWhatsAppSender } from "../_shared/resolveWhatsAppSender.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { chargeAndLogDirect, estimateWhisperCostUsd } from "../_shared/ai-provider/directApi.ts";
import { precallCheck } from "../_shared/ai-provider/billing.ts";

/** Credito AI dell'azienda finito: il vocale non si trascrive (niente Whisper gratis). */
export class CreditoTrascrizioneEsaurito extends Error {
  constructor(public messaggio: string) { super(messaggio); this.name = "CreditoTrascrizioneEsaurito"; }
}
import { bytesToBase64 } from "../_shared/base64.ts";
import { normalizzaDdtLetto, testoDdtPerAssistente, type DdtLetto } from "../_shared/ddtLetto.ts";
import { tipoDocumento } from "../_shared/documentoInGingresso.ts";
import { PROMPT_LETTORE_DDT, parteFileDdt } from "../_shared/lettoreDdt.ts";
import { acquisisciDdtWhatsapp } from "../_shared/ddtWhatsappPersistente.ts";
import { conRegoleDocumento } from "../_shared/documentoNonFidato.ts";

/** Quanto vale il link a un file salvato: basta per registrare DDT e foto nei giorni seguenti. */
const DURATA_LINK_SECONDI = 60 * 60 * 24 * 30;

export async function uploadMediaToStorage(
  supabase: SupabaseClient,
  companyId: string,
  bytes: Uint8Array,
  mimeType: string,
  messageId: string,
): Promise<{ storagePath: string; publicUrl: string }> {
  // publicUrl resta il nome del campo per chi lo usa già, ma è un link firmato:
  // il bucket è privato.
  const bucket = "whatsapp-media";
  const now = new Date();
  const yyyymm = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const guessedExt =
    (mimeType.includes("jpeg") ? "jpg"
      : mimeType.includes("png") ? "png"
      : mimeType.includes("ogg") ? "ogg"
      : mimeType === "audio/mp4" ? "m4a"
      : mimeType.includes("mp4") ? "mp4"
      : mimeType.includes("pdf") ? "pdf"
      : mimeType.includes("webp") ? "webp"
      : mimeType.includes("mpeg") ? "mp3"
      : mimeType.includes("aac") ? "aac"
      : mimeType.includes("amr") ? "amr"
      : "bin");
  const path = `${companyId}/${yyyymm}/${messageId}.${guessedExt}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, bytes, {
      contentType: mimeType,
      upsert: false,
    });
  // Un timeout dopo l'upload può aver già salvato l'oggetto per questo ID.
  if (error && !/already exists|duplicate/i.test(error.message)) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: firmato, error: signErr } = await supabase.storage.from(bucket).createSignedUrl(path, DURATA_LINK_SECONDI);
  if (signErr || !firmato?.signedUrl) throw new Error(`Signed URL failed: ${signErr?.message ?? "vuoto"}`);

  return { storagePath: path, publicUrl: firmato.signedUrl };
}

export interface MessaggioConMedia {
  id: string;
  company_id: string;
  wa_number_id: string | null;
  message_type: string | null;
  media_url: string | null;
  media_storage_path: string | null;
}

/**
 * Scarica da Meta il file di un messaggio (foto, vocale, documento, video),
 * lo salva nel bucket e aggiorna la riga. Una volta sola: se il file è già
 * salvato non rifà niente. Ritorna il percorso e il link firmato, o null se
 * non c'è niente da scaricare o Meta non lo dà (il chiamante risponde lo stesso).
 */
export async function scaricaMediaDelMessaggio(
  supabase: SupabaseClient,
  msg: MessaggioConMedia,
): Promise<{ storagePath: string; url: string; file?: Blob } | null> {
  const url = String(msg.media_url ?? "");
  if (msg.media_storage_path) return { storagePath: msg.media_storage_path, url };
  if (!url.startsWith("wa-media://")) return null;
  const mediaId = url.slice("wa-media://".length).trim();
  if (!mediaId) return null;

  const mittente = await resolveWhatsAppSender(supabase, msg.company_id, msg.wa_number_id);
  if (!mittente?.accessToken) throw new Error("Nessun token WhatsApp per scaricare il file");

  const { bytes, mimeType } = await downloadMetaMedia(mediaId, mittente.accessToken, mittente.phoneNumberId);
  const { storagePath, publicUrl } = await uploadMediaToStorage(supabase, msg.company_id, bytes, mimeType, msg.id);
  const { error } = await supabase
    .from("whatsapp_messages")
    .update({ media_storage_path: storagePath, media_url: publicUrl })
    .eq("id", msg.id).eq("company_id", msg.company_id).eq("wa_number_id", msg.wa_number_id!);
  if (error) throw new Error("media_salvataggio_non_confermato");
  return { storagePath, url: publicUrl, file: new Blob([new Uint8Array(bytes)], { type: mimeType }) };
}

export async function transcribeAudio(
  supabase: SupabaseClient,
  storagePath: string,
  prompt?: string,
  addebito?: { companyId: string | null; messageId: string },
  originale?: Blob,
): Promise<{ testo: string; lingua: string | null }> {
  // Credito PRIMA di Whisper, come detta-testo (revisione del 15/11/2026).
  if (addebito?.companyId) {
    const pre = await precallCheck(supabase, { company_id: addebito.companyId, task_kind: "audio_transcription" as never, estimated_tokens_total: 2000 });
    if (!pre.allow) throw new CreditoTrascrizioneEsaurito(pre.user_message_it || "Crediti AI esauriti");
  }
  const bucket = "whatsapp-media";
  const { data, error } = originale ? { data: originale, error: null } : await supabase.storage.from(bucket).download(storagePath);
  if (error || !data) throw new Error(`Audio download failed: ${error?.message}`);
  const bytes = new Uint8Array(await data.arrayBuffer());
  const { testo, lingua, durata } = await transcribeAudioWhisper(bytes, storagePath.split("/").pop() ?? "audio.ogg", prompt);
  // Whisper si paga a minuto: prima i vocali WhatsApp non si addebitavano
  // (15/11/2026). Durata misurata dal provider; se manca, stima prudente dai
  // byte (Opus ~16 kbit/s). Nessuna chiave: ogni trascrizione è una chiamata pagata.
  if (addebito) {
    const secondi = durata ?? Math.max(1, (bytes.byteLength * 8) / 16000);
    await chargeAndLogDirect({
      supabase, company_id: addebito.companyId, task_kind: "audio_transcription",
      model_used: "openai/whisper-1", cost_usd_real: estimateWhisperCostUsd(secondi),
      cost_is_estimated: durata === null,
      idempotency_key: `whatsapp-vocale:${addebito.messageId}`,
      metadata: { duration_sec: secondi, canale: "whatsapp", message_id: addebito.messageId },
    });
  }
  return { testo, lingua };
}

export async function analyzeImage(
  publicUrl: string,
  hint: "ddt" | "cantiere" | "generic" = "generic",
): Promise<string> {
  const prompts: Record<string, string> = {
    ddt:
      "Questa immagine è un DDT (Documento di Trasporto) di cantiere. Estrai in italiano: " +
      "numero DDT, data, fornitore (ragione sociale), elenco righe materiali con quantità e unità di misura. " +
      "Se qualcosa non è leggibile scrivi 'non leggibile'.",
    cantiere:
      "Questa immagine è stata scattata in un cantiere edile. Descrivi in italiano cosa si vede, tipo di lavori, " +
      "eventuali problemi visibili. Sii breve (3-5 righe).",
    generic:
      "Descrivi in italiano cosa si vede in questa immagine in modo sintetico (2-4 righe).",
  };

  // 2026-05-27 (AI cost audit): gpt-4o → gpt-4o-mini per hint cantiere/generic.
  // Vision OCR seria (DDT con scritte piccole, numeri, firme) richiede 4o per
  // accuratezza. Descrizione "cosa si vede in foto cantiere" o "descrivi
  // genericamente" è perfettamente gestibile da 4o-mini con detail:low.
  // Risparmio: ~17x per immagine non-DDT (la maggioranza del volume).
  const useFullModel = hint === "ddt";
  const resp = await callOpenAI({
    model: useFullModel ? "gpt-4o" : "gpt-4o-mini",
    temperature: 0.3,
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content: prompts[hint] ?? prompts.generic,
      },
      {
        role: "user",
        // @ts-expect-error: image_url support is OpenAI vision format
        content: [
          {
            type: "image_url",
            image_url: { url: publicUrl, detail: "low" },
          },
        ],
      },
    ],
  });

  return resp.choices[0]?.message?.content ?? "";
}

// Stesso prompt di ai-ddt-analyzer (lettore DDT dell'app, task ddt_ocr).


const PROMPT_FOTO = conRegoleDocumento(
  "Guarda l'immagine. Nella PRIMA riga scrivi solo DDT per una bolla di trasporto, SCONTRINO per una ricevuta o uno scontrino fiscale, " +
  "DOCUMENTO per altri documenti scritti, FOTO per una scena riconoscibile, INCERTO se il contenuto non è leggibile. " +
  "Dalla seconda riga descrivi brevemente in italiano quello che vedi.",
);
const DDT_DICHIARATO = /\b(?:ddt|bolla|documento di trasporto)\b/i;
const SCONTRINO_DICHIARATO = /\b(?:scontrino|ricevuta fiscale)\b/i;

interface OpzioniDocumentoOperativo {
  storagePath: string;
  companyId: string;
  userId: string | null;
  employeeId?: string | null;
  acquisizioneConsentita?: boolean;
  didascalia: string | null;
  messageId: string;
  file?: Blob;
  ricordaBolla?: (id: string, stato?: string) => void;
  ricordaScontrino?: (lettura?: DdtLetto) => void;
}

async function salvaBollaOperativa(supabase: SupabaseClient, opts: OpzioniDocumentoOperativo,
  dati: Pick<Parameters<typeof acquisisciDdtWhatsapp>[1], "result" | "file" | "primaDellaLettura" | "accodaLettura"> = {}): Promise<boolean> {
  if (opts.acquisizioneConsentita === false) return false;
  try {
    const bolla = await acquisisciDdtWhatsapp(supabase, { ...opts, ...dati });
    if (bolla.stessoOperatore) opts.ricordaBolla?.(bolla.id, bolla.status);
    return true;
  } catch {
    console.warn("[ddt-whatsapp] acquisizione non confermata", { message_id: opts.messageId });
    return false;
  }
}

/**
 * La foto mandata su WhatsApp messa in parole per l'assistente di cantiere.
 * Se è un DDT (lo dice l'operaio, o lo riconosce l'AI) passa dal lettore
 * DDT dell'app e tornano fornitore, numero, data e righe; altrimenti una
 * descrizione breve. L'immagine va all'AI come dati, non come link.
 */
export async function leggiFotoOperativa(
  supabase: SupabaseClient,
  opts: OpzioniDocumentoOperativo,
): Promise<string> {
  const { data: file, error } = opts.file ? { data: opts.file, error: null } : await supabase.storage.from("whatsapp-media").download(opts.storagePath);
  if (error || !file) throw new Error(error?.message ?? "foto non scaricabile");
  const didascalia = opts.didascalia?.trim() || null;
  const scontrinoDichiarato = SCONTRINO_DICHIARATO.test(didascalia ?? "");
  const ddtDichiarato = !scontrinoDichiarato && DDT_DICHIARATO.test(didascalia ?? "");
  const bozzaDdT = `[Foto di un DDT — da leggere]\n\nTesto dell'utente: ${didascalia ?? "(nessuno)"}`;
  if (ddtDichiarato && await salvaBollaOperativa(supabase, opts, { file, accodaLettura: true })) return bozzaDdT;
  let bytesFoto = new Uint8Array(await file.arrayBuffer());
  let mimeFoto = file.type || "image/jpeg";
  if (/hei[cf]/i.test(mimeFoto) || /\.hei[cf]$/i.test(opts.storagePath)) {
    const { heicInJpeg } = await import("../_shared/conversioneHeic.ts");
    bytesFoto = new Uint8Array(await heicInJpeg(bytesFoto)); mimeFoto = "image/jpeg";
  }
  const immagine = `data:${mimeFoto};base64,${bytesToBase64(bytesFoto)}`;

  let descrizione = "";
  const descrivi = async () => {
    const resp = await callOpenAI({
      // Nome completo: il modello passa tale e quale a OpenRouter, che
      // senza «openai/» non lo riconosce (27/09/2026).
      model: "openai/gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 300,
      company_id: opts.companyId,
      messages: [{
        role: "user",
        // deno-lint-ignore no-explicit-any
        content: [
          { type: "text", text: PROMPT_FOTO },
          { type: "image_url", image_url: { url: immagine, detail: "low" } },
        ] as any,
      }],
    });
    const out = (resp.choices[0]?.message?.content ?? "").trim();
    const [prima, ...resto] = out.split("\n");
    descrizione = resto.join("\n").trim() || out;
    if (/^DDT\b/i.test(prima ?? "")) return "ddt";
    if (/^SCONTRINO\b/i.test(prima ?? "")) return "scontrino";
    if (/^INCERTO\b/i.test(prima ?? "") || !out) return "incerto";
    return /documento/i.test(prima ?? "") ? "documento" : "foto";
  };

  const tipoFoto = ddtDichiarato ? "ddt" : scontrinoDichiarato ? "scontrino" : await descrivi();
  if (tipoFoto === "ddt" && await salvaBollaOperativa(supabase, opts, { file, accodaLettura: true })) return bozzaDdT;
  if (tipoFoto === "incerto") return "[Allegato WhatsApp da smistare]";
  if (tipoFoto !== "foto") {
    try {
      const letto = await aiRouterComplete({
        supabase,
        taskKey: "ddt_ocr",
        messages: [
          { role: "system", content: conRegoleDocumento(PROMPT_LETTORE_DDT) },
          {
            role: "user",
            content: [
              { type: "text", text: "Identifica il tipo del documento. Leggi esercente/fornitore, data, totale pagato e righe visibili. Mantieni assenti i dati illeggibili." },
              { type: "image_url", image_url: { url: immagine } },
            ],
          },
        ],
        params: { temperature: 0.05, max_tokens: 4500 },
        responseFormat: { type: "json_object" },
        companyId: opts.companyId,
        userId: opts.userId,
        idempotencyKey: `wa_ddt_${opts.messageId}`,
      });
      const raw = JSON.parse(letto.content);
      const documentoLetto = normalizzaDdtLetto(raw);
      if (documentoLetto.tipo === "ddt") {
        await salvaBollaOperativa(supabase, opts, { file, result: raw });
      }
      if (documentoLetto.tipo === "scontrino" || (tipoFoto === "scontrino" && !documentoLetto.tipo)) {
        opts.ricordaScontrino?.(documentoLetto);
        return testoDdtPerAssistente({ ...documentoLetto, tipo: "scontrino" }, didascalia) ?? "[Scontrino ricevuto — totale da verificare]";
      }
      const testo = documentoLetto.tipo && documentoLetto.tipo !== "altro" ? testoDdtPerAssistente(documentoLetto, didascalia) : null;
      if (testo) return testo;
    } catch (e) {
      console.error(JSON.stringify({ level: "error", fn: "leggi_ddt", error: String(e) }));
    }
    if (tipoFoto === "scontrino") {
      opts.ricordaScontrino?.();
      return "[Scontrino ricevuto — totale da verificare]";
    }
    return "[Allegato WhatsApp da smistare]";
  }
  return `[Foto — cosa si vede]: ${descrizione || "non sono riuscito a vederla bene"}\n\nTesto dell'utente: ${didascalia ?? "(nessuno)"}`;
}

/**
 * Legge un documento arrivato al bot: foto → come sempre; PDF → estrae il testo
 * col lettore dell'app (silvio-extract-pdf) e dice che tipo è (28/09/2026).
 * Prima i PDF venivano scaricati e poi ignorati.
 */
export async function leggiDocumentoOperativo(
  supabase: SupabaseClient,
  opts: OpzioniDocumentoOperativo & { mime: string },
): Promise<string> {
  const mime = (opts.mime || "").toLowerCase();
  const isPdf = mime.includes("pdf") || opts.storagePath.toLowerCase().endsWith(".pdf");
  // Solo foto e PDF si leggono (18/10/2026): un Word o un Excel mandato come
  // immagine all'AI falliva sempre e si sprecava una chiamata.
  if (!isPdf && !mime.startsWith("image/")) {
    return `[Documento ricevuto in un formato che non so leggere (${mime || "sconosciuto"}): mandalo come PDF o come foto]`;
  }
  if (!isPdf) {
    return leggiFotoOperativa(supabase, opts);
  }
  const ddtDichiarato = !SCONTRINO_DICHIARATO.test(opts.didascalia ?? "") && DDT_DICHIARATO.test(opts.didascalia ?? "");
  const download = () => opts.file ? Promise.resolve({ data: opts.file, error: null }) : supabase.storage.from("whatsapp-media").download(opts.storagePath);
  const anticipato = ddtDichiarato ? await download() : null;
  const fileIniziale = anticipato?.error ? null : anticipato?.data;
  const limite = 18 * 1024 * 1024;
  const troppoGrande = "[Documento PDF ricevuto: non sono riuscito a leggerlo perché supera il limite di 18 MB. Invia un PDF più piccolo.]";
  if (fileIniziale && fileIniziale.size > limite) return troppoGrande;
  const salvata = !!fileIniziale && await salvaBollaOperativa(supabase, opts, { file: fileIniziale, accodaLettura: true });
  if (salvata) return `[Documento PDF — DDT da leggere]\n\nTesto dell'utente: ${opts.didascalia}`;
  const base = Deno.env.get("SUPABASE_URL")!;
  const chiave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  let testo = "";
  try {
    const res = await fetch(`${base}/functions/v1/silvio-extract-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${chiave}` },
      body: JSON.stringify({
        storage_path: opts.storagePath,
        company_id: opts.companyId,
        per_utente: opts.userId,
        bucket: "whatsapp-media",
        max_chars: 8000,
      }),
    });
    const j = await res.json().catch((): null => null) as { text?: string; error?: string } | null;
    if (!res.ok) console.error(JSON.stringify({ level: "error", fn: "leggi_documento_pdf", status: res.status, error: j?.error ?? null }));
    testo = res.ok ? (j?.text ?? "").trim() : "";
  } catch (e) {
    console.error(JSON.stringify({ level: "error", fn: "leggi_documento_pdf", error: String(e) }));
  }
  if (!testo) {
    // Un PDF scansionato può non avere testo selezionabile: leggiamo le pagine con la visione.
    try {
      const { data: file, error } = fileIniziale ? { data: fileIniziale, error: null } : await download();
      if (error || !file) throw new Error("PDF non disponibile");
      if (file.size > limite) return troppoGrande;
      const letto = await aiRouterComplete({
        supabase, taskKey: "pdf_vision_extract", companyId: opts.companyId, userId: opts.userId,
        idempotencyKey: `wa_ddt_pdf_${opts.companyId}_${opts.messageId}`,
        messages: [
          { role: "system", content: conRegoleDocumento(PROMPT_LETTORE_DDT) },
          { role: "user", content: [
            { type: "text", text: "Leggi questo PDF scansionato. Estrai tutte le righe leggibili, senza inventare dati mancanti." },
            parteFileDdt({ base64: bytesToBase64(new Uint8Array(await file.arrayBuffer())), mime: "application/pdf", fileName: "documento-whatsapp.pdf" }),
          ] },
        ],
        params: { temperature: 0.05, max_tokens: 4500 }, responseFormat: { type: "json_object" },
      });
      const raw = JSON.parse(letto.content);
      const documento = normalizzaDdtLetto(raw);
      if (documento.tipo === "ddt") await salvaBollaOperativa(supabase, opts, { file, result: raw });
      if (documento.tipo === "scontrino") opts.ricordaScontrino?.(documento);
      const risultato = documento.tipo && documento.tipo !== "altro" ? testoDdtPerAssistente(documento, opts.didascalia) : null;
      if (risultato) return risultato;
    } catch (e) {
      console.error(JSON.stringify({ level: "error", fn: "leggi_documento_pdf_vision", error: String(e) }));
    }
    return `[Documento PDF ricevuto — non sono riuscito a leggerlo]\n\nTesto dell'utente: ${opts.didascalia ?? "(nessuno)"}`;
  }
  const etichetta: Record<string, string> = {
    ddt: "DDT (documento di trasporto)",
    fattura: "fattura del fornitore",
    computo: "computo metrico",
    scontrino: "scontrino/ricevuta",
    altro: "documento",
  };
  const tipo = tipoDocumento(testo, opts.didascalia);
  if (tipo === "altro" && !opts.didascalia) return "[Allegato WhatsApp da smistare]";
  if (tipo === "ddt") await salvaBollaOperativa(supabase, opts, { file: fileIniziale ?? opts.file, accodaLettura: true });
  if (tipo === "scontrino") opts.ricordaScontrino?.();
  return `[Documento PDF — ${etichetta[tipo]}, testo letto]:\n${testo}\n\nTesto dell'utente: ${opts.didascalia ?? "(nessuno)"}`;
}

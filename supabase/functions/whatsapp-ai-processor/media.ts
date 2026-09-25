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
import { resolveWhatsAppSender } from "../_shared/resolveWhatsAppSender.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { bytesToBase64 } from "../_shared/base64.ts";
import { normalizzaDdtLetto, sembraDdtDallaDidascalia, testoDdtPerAssistente } from "../_shared/ddtLetto.ts";

/** Quanto vale il link a un file salvato: basta per registrare DDT e foto nei giorni seguenti. */
const DURATA_LINK_SECONDI = 60 * 60 * 24 * 30;

export async function downloadMetaMedia(
  mediaId: string,
  accessToken: string,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  // 1. GET lookup URL
  const lookupResp = await fetch(
    `https://graph.facebook.com/v22.0/${mediaId}`,
    {
      headers: { "Authorization": `Bearer ${accessToken}` },
    },
  );
  if (!lookupResp.ok) {
    throw new Error(
      `Meta media lookup ${lookupResp.status}: ${(await lookupResp.text()).substring(0, 200)}`,
    );
  }
  const meta = (await lookupResp.json()) as { url?: string; mime_type?: string };
  if (!meta.url) throw new Error("Media URL missing in Meta response");

  // 2. Download binary
  const dataResp = await fetch(meta.url, {
    headers: { "Authorization": `Bearer ${accessToken}` },
  });
  if (!dataResp.ok) {
    throw new Error(`Meta media download ${dataResp.status}`);
  }
  const bytes = new Uint8Array(await dataResp.arrayBuffer());
  return { bytes, mimeType: meta.mime_type ?? "application/octet-stream" };
}

export async function uploadMediaToStorage(
  supabase: SupabaseClient,
  companyId: string,
  bytes: Uint8Array,
  mimeType: string,
  ext?: string,
): Promise<{ storagePath: string; publicUrl: string }> {
  // publicUrl resta il nome del campo per chi lo usa già, ma è un link firmato:
  // il bucket è privato.
  const bucket = "whatsapp-media";
  const now = new Date();
  const yyyymm = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const guessedExt =
    ext ??
    (mimeType.includes("jpeg") ? "jpg"
      : mimeType.includes("png") ? "png"
      : mimeType.includes("ogg") ? "ogg"
      : mimeType.includes("mp4") ? "mp4"
      : mimeType.includes("pdf") ? "pdf"
      : mimeType.includes("webp") ? "webp"
      : mimeType.includes("mpeg") ? "mp3"
      : mimeType.includes("aac") ? "aac"
      : "bin");
  const id = crypto.randomUUID();
  const path = `${companyId}/${yyyymm}/${id}.${guessedExt}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, bytes, {
      contentType: mimeType,
      upsert: false,
    });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);

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
): Promise<{ storagePath: string; url: string } | null> {
  const url = String(msg.media_url ?? "");
  if (msg.media_storage_path) return { storagePath: msg.media_storage_path, url };
  if (!url.startsWith("wa-media://")) return null;
  const mediaId = url.slice("wa-media://".length).trim();
  if (!mediaId) return null;

  const mittente = await resolveWhatsAppSender(supabase, msg.company_id, msg.wa_number_id);
  if (!mittente?.accessToken) throw new Error("Nessun token WhatsApp per scaricare il file");

  const { bytes, mimeType } = await downloadMetaMedia(mediaId, mittente.accessToken);
  const { storagePath, publicUrl } = await uploadMediaToStorage(supabase, msg.company_id, bytes, mimeType);
  const { error } = await supabase
    .from("whatsapp_messages")
    .update({ media_storage_path: storagePath, media_url: publicUrl })
    .eq("id", msg.id);
  if (error) console.warn("[media] riga non aggiornata:", error.message);
  return { storagePath, url: publicUrl };
}

export async function transcribeAudio(
  supabase: SupabaseClient,
  storagePath: string,
  prompt?: string,
): Promise<string> {
  const bucket = "whatsapp-media";
  const { data, error } = await supabase.storage.from(bucket).download(storagePath);
  if (error || !data) throw new Error(`Audio download failed: ${error?.message}`);
  const bytes = new Uint8Array(await data.arrayBuffer());
  return transcribeAudioWhisper(bytes, storagePath.split("/").pop() ?? "audio.ogg", prompt);
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
const PROMPT_LETTORE_DDT = `Sei un assistente esperto di logistica edile che legge i Documenti Di Trasporto (DDT) italiani.
Estrai i dati in JSON STRUTTURATO. Non inventare: se un dato non è leggibile metti null.

REGOLE:
- "quantity": numero (usa il punto come separatore decimale). Se non c'è, null.
- "unit": unità di misura (es. "pz", "mq", "ml", "kg", "cf", "bancale"). Se assente "pz".
- "unit_price": prezzo unitario in euro come numero (punto decimale, niente simbolo €). null se il DDT non riporta prezzi (spesso i DDT non hanno prezzi).
- "code": codice articolo/fornitore se presente, altrimenti null.
- "barcode": codice a barre/EAN se presente, altrimenti null.
- "ddt_date": formato ISO "YYYY-MM-DD".
- Includi UNA riga per ogni articolo elencato nel documento. Ignora righe di intestazione, totali, note di trasporto.

OUTPUT JSON ESATTO (no markdown):
{
  "supplier_name": "string | null",
  "supplier_vat": "string | null (P.IVA fornitore)",
  "ddt_number": "string | null",
  "ddt_date": "string | null (YYYY-MM-DD)",
  "items": [
    { "description": "string", "quantity": number|null, "unit": "string", "unit_price": number|null, "code": "string|null", "barcode": "string|null" }
  ],
  "confidenza_estrazione": "alta" | "media" | "bassa"
}`;

const PROMPT_FOTO =
  "Guarda l'immagine. Nella PRIMA riga scrivi solo DOCUMENTO se è un documento stampato o scritto " +
  "(DDT, bolla di consegna, fattura, scontrino, preventivo, modulo), altrimenti FOTO. " +
  "Dalla seconda riga descrivi in italiano, in 2-4 righe, cosa si vede: lavori, materiali, problemi visibili.";

/**
 * La foto mandata su WhatsApp messa in parole per l'assistente di cantiere.
 * Se è un DDT (lo dice l'operaio, o lo riconosce l'AI) passa dal lettore
 * DDT dell'app e tornano fornitore, numero, data e righe; altrimenti una
 * descrizione breve. L'immagine va all'AI come dati, non come link.
 */
export async function leggiFotoOperativa(
  supabase: SupabaseClient,
  opts: { storagePath: string; companyId: string; userId: string | null; didascalia: string | null; messageId: string },
): Promise<string> {
  const { data: file, error } = await supabase.storage.from("whatsapp-media").download(opts.storagePath);
  if (error || !file) throw new Error(error?.message ?? "foto non scaricabile");
  const immagine = `data:${file.type || "image/jpeg"};base64,${bytesToBase64(new Uint8Array(await file.arrayBuffer()))}`;
  const didascalia = opts.didascalia?.trim() || null;

  let descrizione = "";
  const descrivi = async () => {
    const resp = await callOpenAI({
      model: "gpt-4o-mini",
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
    return /documento/i.test(prima ?? "");
  };

  const documento = sembraDdtDallaDidascalia(didascalia) || await descrivi();
  if (documento) {
    try {
      const letto = await aiRouterComplete({
        supabase,
        taskKey: "ddt_ocr",
        messages: [
          { role: "system", content: PROMPT_LETTORE_DDT },
          {
            role: "user",
            content: [
              { type: "text", text: "Estrai fornitore, numero/data DDT e tutte le righe prodotto da questo documento di trasporto." },
              { type: "image_url", image_url: { url: immagine } },
            ],
          },
        ],
        params: { temperature: 0.05, max_tokens: 2500 },
        responseFormat: { type: "json_object" },
        companyId: opts.companyId,
        userId: opts.userId,
        idempotencyKey: `wa_ddt_${opts.messageId}`,
      });
      const testo = testoDdtPerAssistente(normalizzaDdtLetto(JSON.parse(letto.content)), didascalia);
      if (testo) return testo;
    } catch (e) {
      console.error(JSON.stringify({ level: "error", fn: "leggi_ddt", error: String(e) }));
    }
    if (!descrizione) await descrivi().catch(() => false);
  }
  return `[Foto — cosa si vede]: ${descrizione || "non sono riuscito a vederla bene"}\n\nTesto dell'utente: ${didascalia ?? "(nessuno)"}`;
}

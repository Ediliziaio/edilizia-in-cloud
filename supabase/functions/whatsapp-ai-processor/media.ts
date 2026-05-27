// MP02 — Media handling (download Meta, upload storage, transcribe, analyze).
// Usa getMetaCredentials per token fallback platform-level.
//
// Il bucket 'whatsapp-media' deve esistere (storage di Supabase).
// Path: {company_id}/{YYYY-MM}/{uuid}.{ext}

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callOpenAI, transcribeAudioWhisper } from "./openai.ts";

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

  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);

  return { storagePath: path, publicUrl: pub.publicUrl };
}

export async function transcribeAudio(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<string> {
  const bucket = "whatsapp-media";
  const { data, error } = await supabase.storage.from(bucket).download(storagePath);
  if (error || !data) throw new Error(`Audio download failed: ${error?.message}`);
  const bytes = new Uint8Array(await data.arrayBuffer());
  return transcribeAudioWhisper(bytes, storagePath.split("/").pop() ?? "audio.ogg");
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

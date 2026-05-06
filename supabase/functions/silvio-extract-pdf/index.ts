/**
 * Edge Function: silvio-extract-pdf
 *
 * Estrae testo da un PDF residente nel bucket `silvio-uploads`.
 * Usa `pdfjs-dist` (legacy build via esm.sh) compatibile con Deno edge runtime.
 *
 * Body:
 *   { storage_path: "<companyId>/<userId>/<ts>-file.pdf", max_chars?: 50000 }
 *
 * Response:
 *   {
 *     text: "...testo estratto pulito...",
 *     pages_count: 12,
 *     truncated: boolean,
 *     duration_ms: number
 *   }
 *
 * Note tecniche:
 *   - Usiamo `pdfjs-dist@4.0.379/legacy/build/pdf.mjs` perché supporta i polyfill
 *     necessari per Deno (no DOM, no worker fisico).
 *   - `useSystemFonts: false, disableFontFace: true` evita le richieste a font
 *     locali (che in Deno non esistono).
 *   - `disableWorker: true` non è esposto, quindi importiamo il modulo `legacy`
 *     che gira inline senza worker.
 *   - Cap a 50K char (≈12K token) per evitare context overflow lato modello.
 */

import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
// pdfjs-dist legacy entry-point — funziona in ambienti senza Worker (Deno edge)
// `?bundle&no-check` evita di tirare dentro `canvas.node` (binding nativo che
// rompeva il deploy: "Module not found canvas.node?target=denonext")
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pdfjs: any = await import("https://esm.sh/pdfjs-dist@4.0.379/legacy/build/pdf.mjs?bundle&no-check");
// Disabilita worker (richiesto per ambienti senza Web Worker)
if (pdfjs?.GlobalWorkerOptions) {
  pdfjs.GlobalWorkerOptions.workerSrc = "";
}

/** Soglia testo nativo: sotto questo threshold consideriamo il PDF scansionato */
const SCAN_TEXT_THRESHOLD = 50;

interface Payload {
  storage_path: string;
  /** Massimo numero di caratteri da restituire (default 50000) */
  max_chars?: number;
}

const DEFAULT_MAX_CHARS = 50_000;

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, corsHeaders);

  const t0 = Date.now();
  try {
    const auth = await requireAuth(req, corsHeaders);
    const userId = auth.userId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseAdmin = auth.supabaseAdmin as any;

    const { data: profile } = await supabaseAdmin
      .from("profiles").select("company_id").eq("id", userId).maybeSingle();
    const companyId: string | null = profile?.company_id ?? null;
    if (!companyId) return errorResponse("Nessuna azienda associata", 400, corsHeaders);
    await requireCompanyAccess(supabaseAdmin, userId, companyId, corsHeaders);

    const payload = (await req.json()) as Payload;
    const storagePath = (payload?.storage_path ?? "").trim();
    const maxChars = payload?.max_chars ?? DEFAULT_MAX_CHARS;

    if (!storagePath) return errorResponse("storage_path mancante", 400, corsHeaders);
    // Verifica che l'utente abbia accesso (path deve iniziare con companyId)
    if (!storagePath.startsWith(`${companyId}/`)) {
      return errorResponse("storage_path non autorizzato (cross-company)", 403, corsHeaders);
    }

    // ── Download PDF da storage ──────────────────────────────────────────
    const { data: file, error: dlErr } = await supabaseAdmin.storage
      .from("silvio-uploads")
      .download(storagePath);
    if (dlErr || !file) {
      return errorResponse(`Download fallito: ${dlErr?.message ?? "file non trovato"}`, 404, corsHeaders);
    }
    const arrayBuffer = await file.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      return errorResponse("File PDF vuoto", 400, corsHeaders);
    }
    if (arrayBuffer.byteLength > 20 * 1024 * 1024) {
      return errorResponse("PDF troppo grande (>20MB) — l'estrazione non è eseguita", 413, corsHeaders);
    }

    // ── Parse con pdfjs-dist ─────────────────────────────────────────────
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(arrayBuffer),
      useSystemFonts: false,
      disableFontFace: true,
      isEvalSupported: false,
      // Per ambienti senza canvas
      verbosity: 0,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdf: any = await loadingTask.promise;
    const pagesCount: number = pdf.numPages ?? 0;

    let fullText = "";
    let truncated = false;
    for (let i = 1; i <= pagesCount; i++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const page: any = await pdf.getPage(i);
      const content = await page.getTextContent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items: any[] = content?.items ?? [];
      const pageText = items
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((it: any) => (typeof it.str === "string" ? it.str : ""))
        .filter(Boolean)
        .join(" ");
      // Pulizia minimale: rimuovi runs di spazi/newline ridondanti
      const cleaned = pageText
        .replace(/\s+/g, " ")
        .trim();
      if (cleaned.length === 0) continue;
      const blockText = `\n\n--- Pagina ${i} ---\n${cleaned}`;
      if (fullText.length + blockText.length > maxChars) {
        // Tronca al limite
        const remaining = Math.max(0, maxChars - fullText.length);
        fullText += blockText.substring(0, remaining);
        truncated = true;
        break;
      }
      fullText += blockText;
      // page.cleanup() per liberare memoria — non sempre disponibile
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (typeof (page as any).cleanup === "function") (page as any).cleanup();
    }

    const trimmedText = fullText.trim();

    // ── Fallback vision OCR per PDF scansionati ─────────────────────────
    // Se il testo nativo è troppo scarso, il PDF è probabilmente un'immagine
    // scansionata. In quel caso passiamo il PDF al modello multimodal vision
    // (Gemini Flash 2.5 lo gestisce nativamente) per fare OCR.
    if (trimmedText.length < SCAN_TEXT_THRESHOLD) {
      try {
        const { data: signed } = await supabaseAdmin.storage
          .from("silvio-uploads")
          .createSignedUrl(storagePath, 600);
        if (!signed?.signedUrl) {
          return jsonResponse({
            text: trimmedText,
            pages_count: pagesCount,
            truncated,
            duration_ms: Date.now() - t0,
            vision_fallback: false,
            vision_error: "signedUrl non disponibile",
          }, 200, corsHeaders);
        }
        const visionResult = await aiRouterComplete({
          supabase: supabaseAdmin,
          taskKey: "pdf_vision_extract",
          messages: [
            {
              role: "system",
              content:
                "Sei un OCR esperto. L'utente ti manderà un PDF scansionato (immagine). " +
                "Estrai TUTTO il testo leggibile pagina per pagina. " +
                "Mantieni la struttura: usa '--- Pagina N ---' come separatore. " +
                "Se è un documento con tabelle, riporta i dati in formato testuale leggibile. " +
                "Non interpretare, non riassumere — solo trascrivi quello che vedi.",
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Estrai tutto il testo da questo documento PDF scansionato. Riporta una pagina alla volta.",
                },
                {
                  type: "image_url",
                  image_url: { url: signed.signedUrl, detail: "high" },
                },
              ],
            },
          ],
          params: { max_tokens: 4000, temperature: 0.0 },
          companyId,
          userId,
          personaKey: "silvio",
          idempotencyKey: `silvio_pdf_vision_${storagePath}`,
          estimatedCostEur: 0.10,
        });
        const visionText = (visionResult.content ?? "").trim();
        // Cap al limite richiesto
        const finalText = visionText.length > maxChars
          ? visionText.substring(0, maxChars)
          : visionText;
        return jsonResponse({
          text: finalText,
          pages_count: pagesCount,
          truncated: visionText.length > maxChars,
          duration_ms: Date.now() - t0,
          vision_fallback: true,
          vision_model: visionResult.modelUsed,
        }, 200, corsHeaders);
      } catch (visionErr) {
        const msg = visionErr instanceof Error ? visionErr.message : String(visionErr);
        console.warn("[silvio-extract-pdf] Vision fallback fallito:", msg);
        return jsonResponse({
          text: trimmedText,
          pages_count: pagesCount,
          truncated,
          duration_ms: Date.now() - t0,
          vision_fallback: false,
          vision_error: msg.substring(0, 200),
        }, 200, corsHeaders);
      }
    }

    return jsonResponse({
      text: trimmedText,
      pages_count: pagesCount,
      truncated,
      duration_ms: Date.now() - t0,
      vision_fallback: false,
    }, 200, corsHeaders);

  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[silvio-extract-pdf] error:", msg);
    return errorResponse(`Estrazione PDF fallita: ${msg.substring(0, 300)}`, 500, corsHeaders);
  }
});

/**
 * ai-confronto-modelli — lo stesso documento, la stessa istruzione, il modello scelto a ogni chiamata
 * (17/11/2026). Serve a scegliere con i numeri quale AI applica meglio lo standard operativo
 * (docs/piano-standard-operativo-commessa.md §5): voci, tipo, chi compra, costo e tempo.
 *
 * Solo super admin. Il costo è interno alla piattaforma (companyId null → registrato come interno,
 * vedi docs/ai-addebiti-censimento.md): è uno strumento di prova, non una funzionalità per le aziende.
 * Il file si legge con le stesse regole di generic-doc-ai-extract (bucket e cartella dell'azienda).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth, requireCompanyAccess, requireRole } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";
import { BUCKET_LETTURA_GENERICA, valutaFile } from "../_shared/storageAmmesso.ts";
import { conRegoleDocumento } from "../_shared/documentoNonFidato.ts";
import { bytesToBase64 } from "../_shared/base64.ts";
import { leggiJsonDalModello } from "../_shared/rispostaModello.ts";
import { ISTRUZIONI_LETTURA_STANDARD, VERSIONE_LETTURA_STANDARD } from "../_shared/letturaStandardOperativo.ts";

/** Solo provider noti, così un nome sbagliato non diventa una chiamata a chissà cosa. */
const MODELLO_AMMESSO = /^(google|anthropic|openai|x-ai|deepseek|qwen|mistralai|meta-llama)\/[a-z0-9.:_-]{2,60}$/i;

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("Metodo non ammesso", 405, cors);
  try {
    const { userId, supabaseAdmin } = await requireAuth(req, cors);
    await requireRole(supabaseAdmin, userId, ["super_admin"], cors);
    const body = await req.json().catch(() => ({})) as {
      storage_bucket?: string; storage_path?: string; mime_type?: string; company_id?: string; modello?: string; nota?: string;
    };
    const { storage_bucket, storage_path, mime_type, company_id, modello } = body;
    if (!storage_bucket || !storage_path || !company_id || !modello) return errorResponse("Servono storage_bucket, storage_path, company_id e modello", 400, cors);
    if (!MODELLO_AMMESSO.test(modello)) return errorResponse("Modello non ammesso", 400, cors);
    await requireCompanyAccess(supabaseAdmin, userId, company_id, cors);

    const ammesso = valutaFile({ bucket: storage_bucket, path: storage_path }, BUCKET_LETTURA_GENERICA, { companyId: company_id, userId });
    if (!ammesso.ok) return errorResponse("Bucket o percorso del file non validi", 400, cors);
    const scaricatore = ammesso.conChiaveDiServizio
      ? supabaseAdmin
      : createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
          global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
          auth: { persistSession: false },
        });
    const { data: file, error: dlErr } = await scaricatore.storage.from(storage_bucket).download(storage_path);
    if (dlErr || !file) return errorResponse("File non accessibile", 403, cors);
    const buffer = await (file as Blob).arrayBuffer();
    if (buffer.byteLength > 18 * 1024 * 1024) return errorResponse("Documento troppo grande (max 18MB)", 413, cors);

    const nota = typeof body.nota === "string" ? body.nota.trim().slice(0, 300) : "";
    // deno-lint-ignore no-explicit-any
    const contenuto: any[] = [{ type: "text", text: `Estrai e classifica le voci di questo documento.${nota ? `\n${nota}` : ""}` }];
    if ((mime_type ?? "").startsWith("text/")) {
      contenuto.push({ type: "text", text: `TESTO DEL DOCUMENTO:\n${new TextDecoder().decode(buffer).slice(0, 60000)}` });
    } else if ((mime_type ?? "").startsWith("image/")) {
      contenuto.push({ type: "image_url", image_url: { url: `data:${mime_type};base64,${bytesToBase64(buffer)}` } });
    } else {
      contenuto.push({ type: "file", file: { filename: storage_path.split("/").pop() ?? "documento.pdf", file_data: `data:application/pdf;base64,${bytesToBase64(buffer)}` } });
    }

    const chiave = await buildStableAiIdempotencyKey("ai_confronto_modelli", [
      company_id, userId, storage_bucket, storage_path, mime_type ?? null, modello, nota || null, VERSIONE_LETTURA_STANDARD,
    ]);
    const t0 = Date.now();
    const risposta = await aiRouterComplete({
      // deno-lint-ignore no-explicit-any
      supabase: supabaseAdmin as any,
      taskKey: "pdf_vision_extract",
      forceModel: modello,
      messages: [
        { role: "system", content: conRegoleDocumento(ISTRUZIONI_LETTURA_STANDARD) },
        { role: "user", content: contenuto },
      ],
      params: { temperature: 0, max_tokens: 16000 },
      responseFormat: { type: "json_object" },
      companyId: null,
      userId,
      idempotencyKey: chiave,
      cacheKey: chiave,
      cacheTtlDays: 30,
    });
    const estratto = leggiJsonDalModello(risposta.content);
    return jsonResponse({
      ok: !!estratto,
      estratto,
      testo_grezzo: estratto ? null : String(risposta.content ?? "").slice(0, 2000),
      meta: {
        modello_richiesto: modello,
        modello_usato: risposta.modelUsed,
        // Se il modello chiesto fallisce, il router passa ai ripieghi: il confronto lo deve sapere.
        primario: risposta.usedPrimary,
        tentativi_falliti: risposta.failedAttempts ?? [],
        token_ingresso: risposta.promptTokens,
        token_uscita: risposta.completionTokens,
        costo_usd: risposta.costUsd,
        costo_eur: risposta.costRealEur,
        da_cache: risposta.idempotentReplay ?? false,
        ms: Date.now() - t0,
        versione: VERSIONE_LETTURA_STANDARD,
      },
    }, 200, cors);
  } catch (e) {
    if (e instanceof Response) return e;
    return errorResponse(e instanceof Error ? e.message : String(e), 500, cors);
  }
});

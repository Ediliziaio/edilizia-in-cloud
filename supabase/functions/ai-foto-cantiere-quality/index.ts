/**
 * ai-foto-cantiere-quality — FASE G
 *
 * Analizza una foto cantiere via vision (gpt-4o-mini) per:
 *   - qualita lavori (score 0-100 + livello)
 *   - DPI compliance (caschi, scarpe antinfortunistiche, imbracature, occhiali)
 *   - fase lavoro (scavi, fondazioni, muratura, carpenteria, finiture)
 *   - problemi rilevati (es. "ponteggio non a norma", "materiale non protetto")
 *   - riassunto descrittivo
 *
 * Input:  { foto_id: uuid, company_id: uuid }
 *         OR { foto_ids: uuid[], company_id: uuid }    (batch fino a 10)
 * Output: { success, analyzed: [{...}], ai_meta }
 */

import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

const SYSTEM_PROMPT = `Sei un esperto di sicurezza sul lavoro e quality control in edilizia (D.Lgs 81/08).
Analizza la foto cantiere e produci una valutazione strutturata.

CHECK OBBLIGATORI:
- Qualita lavorazioni (fattura, allineamenti, pulizia)
- DPI presenti su lavoratori visibili (casco, scarpe antinfortunistiche, imbracature, occhiali, guanti, mascherine, gilet alta visibilità)
- Sicurezza: ponteggi a norma, parapetti, segnaletica, materiale stoccato correttamente
- Fase lavoro identificabile

LIVELLI QUALITA:
- eccellente (90-100): zero problemi, sicurezza max
- buona (70-89): qualche dettaglio migliorabile
- sufficiente (50-69): alcuni warnings minori
- problematica (25-49): più problemi, richiede attenzione
- grave (0-24): rischio sicurezza serio

OUTPUT JSON ESATTO (no markdown):
{
  "qualita_score": int 0-100,
  "qualita_livello": "eccellente"|"buona"|"sufficiente"|"problematica"|"grave",
  "fase_lavoro": "scavi"|"fondazioni"|"struttura"|"muratura"|"carpenteria"|"impianti"|"intonaci"|"pavimenti"|"finiture"|"esterni"|"non_identificabile",
  "dpi_presenti": ["string"],
  "dpi_mancanti": ["string"],
  "lavoratori_visibili": int,
  "problemi_rilevati": [
    {"tipo": "sicurezza"|"qualita"|"organizzazione", "descrizione": "string max 150 char", "gravita": "bassa"|"media"|"alta"}
  ],
  "raccomandazioni": ["string max 100 char"],
  "riassunto": "string max 200 char descrittivo della foto"
}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  const cors = getCorsHeaders(req);

  try {
    if (req.method !== "POST") {
      return errorResponse("Metodo non consentito", 405, cors);
    }

    const { userId, supabaseAdmin } = await requireAuth(req, cors);

    const body = await req.json().catch(() => ({}));
    const { foto_id, foto_ids, company_id } = body as {
      foto_id?: string;
      foto_ids?: string[];
      company_id?: string;
    };

    if (!company_id) return errorResponse("company_id obbligatorio", 400, cors);
    await requireCompanyAccess(supabaseAdmin, userId, company_id, cors);

    const ids = foto_ids && foto_ids.length > 0 ? foto_ids.slice(0, 10) : foto_id ? [foto_id] : [];
    if (ids.length === 0) return errorResponse("foto_id o foto_ids obbligatorio", 400, cors);

    // Fetch foto records
    const { data: foto, error: fetchErr } = await supabaseAdmin
      .from("foto_cantiere")
      .select("id, storage_path, descrizione, taken_at, order_id")
      .eq("company_id", company_id)
      .in("id", ids);
    if (fetchErr) return errorResponse(`Fetch error: ${fetchErr.message}`, 500, cors);
    if (!foto || foto.length === 0) {
      return errorResponse("Nessuna foto trovata", 404, cors);
    }

    // Need signed URLs (assume bucket "foto-cantiere"). Try common bucket names.
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return errorResponse("Supabase env mancante", 500, cors);
    }
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Try multiple bucket names
    const BUCKET_CANDIDATES = ["foto-cantiere", "foto_cantiere", "cantiere-foto", "uploads"];

    async function getSignedUrl(path: string): Promise<string | null> {
      for (const bucket of BUCKET_CANDIDATES) {
        try {
          const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 3600);
          if (!error && data?.signedUrl) return data.signedUrl;
        } catch { /* skip */ }
      }
      return null;
    }

    const results: AnyObj[] = [];
    let totTokens = 0;
    let totCost = 0;
    let lastModel = "";

    for (const f of foto as AnyObj[]) {
      try {
        const signedUrl = await getSignedUrl(f.storage_path);
        if (!signedUrl) {
          results.push({ foto_id: f.id, error: `Impossibile generare URL firmato per ${f.storage_path}` });
          continue;
        }
        const idempotencyKey = await buildStableAiIdempotencyKey("foto_cantiere_quality", [
          company_id,
          userId,
          f.id,
          f.storage_path,
          f.taken_at ?? null,
          f.descrizione ?? null,
        ]);

        const aiResult = await aiRouterComplete({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          supabase: supabaseAdmin as any,
          taskKey: "foto_cantiere_quality",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                { type: "text", text: `Analizza questa foto cantiere${f.descrizione ? ` (descrizione utente: ${f.descrizione})` : ""}.` },
                { type: "image_url", image_url: { url: signedUrl } },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ] as any,
            },
          ],
          params: { temperature: 0.1, max_tokens: 1000 },
          responseFormat: { type: "json_object" },
          companyId: company_id,
          userId,
          idempotencyKey,
        });

        let parsed: AnyObj = {};
        try { parsed = JSON.parse(aiResult.content); } catch {
          results.push({ foto_id: f.id, error: "AI returned invalid JSON" });
          continue;
        }

        const score = Math.max(0, Math.min(100, parseInt(parsed.qualita_score, 10) || 0));
        const livelloValid = ["eccellente","buona","sufficiente","problematica","grave"];
        const livello = livelloValid.includes(parsed.qualita_livello) ? parsed.qualita_livello : "sufficiente";

        await supabaseAdmin
          .from("foto_cantiere")
          .update({
            ai_qualita_score: score,
            ai_qualita_livello: livello,
            ai_fase_lavoro: parsed.fase_lavoro ?? null,
            ai_problemi_rilevati: Array.isArray(parsed.problemi_rilevati) ? parsed.problemi_rilevati : [],
            ai_dpi_compliance: {
              presenti: Array.isArray(parsed.dpi_presenti) ? parsed.dpi_presenti : [],
              mancanti: Array.isArray(parsed.dpi_mancanti) ? parsed.dpi_mancanti : [],
              lavoratori_visibili: parsed.lavoratori_visibili ?? 0,
            },
            ai_riassunto: String(parsed.riassunto ?? "").slice(0, 500),
            ai_analizzata_at: new Date().toISOString(),
            ai_model_used: aiResult.modelUsed,
          })
          .eq("id", f.id);

        results.push({
          foto_id: f.id,
          qualita_score: score,
          qualita_livello: livello,
          fase_lavoro: parsed.fase_lavoro,
          problemi: parsed.problemi_rilevati ?? [],
          dpi_mancanti: parsed.dpi_mancanti ?? [],
          riassunto: parsed.riassunto,
          raccomandazioni: parsed.raccomandazioni ?? [],
        });
        totTokens += aiResult.totalTokens;
        totCost += aiResult.costRealEur;
        lastModel = aiResult.modelUsed;
      } catch (e) {
        results.push({ foto_id: f.id, error: e instanceof Error ? e.message : String(e) });
      }
    }

    return jsonResponse({
      success: true,
      analyzed: results,
      ai_meta: {
        foto_processate: results.length,
        foto_failed: results.filter((r) => r.error).length,
        model_used: lastModel,
        total_tokens: totTokens,
        total_cost_eur: totCost,
      },
    }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(`Errore interno: ${err instanceof Error ? err.message : String(err)}`, 500, getCorsHeaders(req));
  }
});

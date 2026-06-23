import { getCorsHeaders, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";

/**
 * crm-ai-insights — riepilogo AI per la Dashboard commerciale del super_admin.
 *
 * Riceve dal client i numeri GIÀ aggregati della dashboard (pipeline,
 * conversioni, fonti, segmenti, alert) e restituisce 3-5 insight azionabili in
 * italiano. Il client invia le metriche così non riquerya il DB qui.
 *
 * Strumento interno di piattaforma: aiRouterComplete con skipCharge:true
 * (la Platform Admin CRM non ha metodo di pagamento → il gate carta darebbe 500).
 * Stesso pattern di outreach-ai-summary.
 *
 * Body: { metrics: object }
 * Output: { insights: string[] }
 * Best-effort: qualunque problema → 200 con insights vuoti (mai 5xx, niente
 * crash della UI).
 */

const PLATFORM_COMPANY = "00000000-0000-0000-0000-000000000001";

const SYSTEM_PROMPT = `Sei un analista commerciale B2B in italiano per "Edilizia in Cloud", il gestionale cloud per imprese edili.

Ti vengono dati i numeri AGGREGATI del CRM commerciale (pipeline per stadio, conversioni, fonti dei lead, segmenti per mestiere/zona, temperatura lead, alert). Devi produrre, per il responsabile vendite, 3-5 INSIGHT azionabili e specifici.

Restituisci SOLO un oggetto JSON valido, senza testo attorno, con ESATTAMENTE questo campo:
{"insights": ["...", "..."]}

REGOLE:
- ogni insight: UNA frase in italiano (max ~22 parole), concreta e azionabile, basata SOLO sui numeri forniti.
- dai priorità a: rischi (lead caldi che si raffreddano, trattative ferme, aziende senza decision maker), opportunità (canale o segmento che converte meglio), e cosa fare adesso.
- niente preamboli, niente percentuali o cifre inventate, niente markdown, niente emoji. Vai dritto al punto.
- se i dati sono troppo scarsi per dire qualcosa di utile, restituisci {"insights": []}.`;

interface InsightsOut {
  insights: string[];
}
const EMPTY: InsightsOut = { insights: [] };

function extractJsonObject(text: string): unknown | undefined {
  if (!text) return undefined;
  const raw = text.trim();
  try {
    return JSON.parse(raw);
  } catch {
    /* continua */
  }
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      /* continua */
    }
  }
  const start = raw.indexOf("{");
  if (start >= 0) {
    let depth = 0,
      inStr = false,
      esc = false;
    for (let i = start; i < raw.length; i++) {
      const ch = raw[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(raw.slice(start, i + 1));
          } catch {
            return undefined;
          }
        }
      }
    }
  }
  return undefined;
}

function normalizeInsights(parsed: unknown): string[] {
  if (!parsed || typeof parsed !== "object") return [];
  const arr = (parsed as Record<string, unknown>).insights;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => String(x ?? "").trim())
    .map((t) => (t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1).trim() : t))
    .filter((t) => t.length > 0)
    .slice(0, 6)
    .map((t) => t.slice(0, 240));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const { userId, supabaseAdmin: admin } = await requireAuth(req, corsH);
    await requireRole(admin, userId, ["super_admin"], corsH);

    const body = await req.json().catch(() => ({}));
    const metrics = body?.metrics && typeof body.metrics === "object" ? body.metrics : null;
    if (!metrics) return jsonResponse({ ...EMPTY }, 200, corsH);

    const userPrompt = [
      "Ecco i numeri aggregati del CRM commerciale.",
      "Produci gli insight JSON richiesti.",
      "",
      "=== METRICHE ===",
      JSON.stringify(metrics, null, 2),
      "=== FINE METRICHE ===",
    ].join("\n");

    let result;
    try {
      result = await aiRouterComplete({
        supabase: admin,
        taskKey: "crm_ai_insights",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        params: { temperature: 0.4, max_tokens: 500 },
        responseFormat: { type: "json_object" },
        companyId: PLATFORM_COMPANY,
        userId,
        skipCharge: true,
      });
    } catch (aiErr) {
      console.warn("crm-ai-insights: AI non disponibile:", aiErr instanceof Error ? aiErr.message : aiErr);
      return jsonResponse({ ...EMPTY }, 200, corsH);
    }

    if (result.chargeSkipped && result.prechargeReason && result.prechargeReason !== "cache_hit") {
      return jsonResponse({ ...EMPTY }, 200, corsH);
    }

    const insights = normalizeInsights(extractJsonObject(result.content || ""));
    return jsonResponse({ insights, model: result.modelUsed }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("crm-ai-insights error:", e);
    return jsonResponse({ ...EMPTY }, 200, corsH);
  }
});

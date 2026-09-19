/**
 * silvio-admin-briefing — Genera il briefing mattutino per Florin.
 *
 * Cron giornaliero ore 8:00 IT (Europe/Rome) via pg_cron.
 * Flusso:
 *   1. Esegue snapshot delle metriche chiave (MRR, unpaid, AI cost, top customers)
 *   2. Costruisce snapshot JSONB
 *   3. Chiama AI con system prompt "genera briefing markdown" + snapshot
 *   4. Salva in silvio_admin_briefings (1 row per data)
 *   5. (TODO Sprint 2) Invia su Telegram via bot
 *
 * Body opzionale: { for_date?: 'YYYY-MM-DD', force?: boolean }
 *   force=true → rigenera anche se esiste già per quella data
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
// 🛡️ Anti chain-of-thought leak — strip tool names + opener narrativi dal
// briefing markdown salvato e mostrato nell'admin dashboard.
import { sanitizeAnswer } from "../_shared/structuredOutput.ts";
import { isInternalRequest } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_CRON_SECRET = Deno.env.get("INTERNAL_CRON_SECRET");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SYSTEM_PROMPT = `Sei Silvio, il co-founder AI di Florin. Stai preparando il briefing mattutino.

OBIETTIVO: una scheda markdown breve e operativa con le 5 cose che Florin deve sapere oggi.

FORMATO OBBLIGATORIO:
## Buongiorno Florin — [giorno data]

💰 **Cassa**
- MRR: € XXX (+/-X% vs ieri se disponibile)
- Nuovi paying nel periodo: N (con nomi)
- Pagamenti falliti: N (con quali aziende)

🎯 **Da fare oggi**
- Azione concreta 1
- Azione concreta 2

⚠️ **Attenzione**
- Avviso 1 (con dato numerico)

📊 **AI Cost**
- € costo AI mese in corso vs precedente

→ **Cosa vuoi affrontare per primo?**

REGOLE:
- Massimo 200 parole totali
- Solo dati reali dallo snapshot fornito (NON inventare numeri)
- Tono founder-to-founder: diretto, numerico
- Italiano corretto
- Se uno snapshot manca/è zero, scrivilo onestamente ("nessun pagamento fallito oggi 🎉")`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  // Auth: cron secret OR super_admin.
  // Il cron passa da silvio_invoke_edge, che manda «x-internal-cron-secret»:
  // qui si leggeva solo «x-cron-secret», quindi la chiamata notturna finiva
  // sempre nel ramo utente e tornava 401. isInternalRequest le accetta tutte e due.
  const isCronCall = isInternalRequest(req);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  let triggeredBy = "cron";

  if (!isCronCall) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userRes = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    const userId = userRes.data?.user?.id;
    if (!userId) return jsonRes({ error: "Unauthorized" }, 401);

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!roleData) return jsonRes({ error: "Solo super_admin" }, 403);
    triggeredBy = `manual:${userId}`;
  }

  try {
    const body = await req.json().catch(() => ({}));
    const forDate: string = body.for_date ?? new Date().toISOString().slice(0, 10);
    const force: boolean = body.force === true;

    // 1. Skip se già esiste (idempotenza cron giornaliero)
    if (!force) {
      const { data: existing } = await supabase
        .from("silvio_admin_briefings")
        .select("id")
        .eq("for_date", forDate)
        .maybeSingle();
      if (existing) {
        return jsonRes({ ok: true, skipped: true, reason: "already_exists", briefing_id: existing.id });
      }
    }

    // 2. Costruisci snapshot eseguendo i 5 tool RPC
    const [mrr, unpaid, aiCost, topCustomers] = await Promise.all([
      supabase.rpc("silvio_get_mrr_breakdown", { p_period: "30d" }),
      supabase.rpc("silvio_get_unpaid_customers", { p_limit: 5 }),
      supabase.rpc("silvio_get_ai_costs_summary", { p_period: "mtd" }),
      supabase.rpc("silvio_get_top_customers_by_revenue", { p_limit: 3 }),
    ]);

    const snapshot = {
      mrr: mrr.data,
      unpaid: unpaid.data,
      ai_cost: aiCost.data,
      top_customers: topCustomers.data,
      generated_at: new Date().toISOString(),
    };

    // 3. Chiama AI per generare il briefing markdown
    const userPromptStr = `Genera il briefing per ${forDate}.

SNAPSHOT METRICHE:
${JSON.stringify(snapshot, null, 2)}

Componi la scheda markdown seguendo il formato. Usa SOLO i numeri presenti nello snapshot.`;

    const result = await aiRouterComplete({
      supabase,
      taskKey: "silvio_admin_chat",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPromptStr },
      ],
      personaKey: "silvio_admin_briefing",
      estimatedCostEur: 0.05,
    });

    // 4. Highlights estratti dallo snapshot per UI
    const mrrData = mrr.data as { mrr_eur?: number; companies_paying?: number; companies_unpaid?: number } | null;
    const unpaidData = unpaid.data as { count?: number } | null;
    const highlights = {
      mrr_eur: mrrData?.mrr_eur ?? 0,
      n_paying: mrrData?.companies_paying ?? 0,
      n_unpaid: unpaidData?.count ?? 0,
      ai_cost_mtd_eur: (aiCost.data as { total_cost_real_eur?: number } | null)?.total_cost_real_eur ?? 0,
    };

    // 🛡️ Sanitize briefing content prima del salvataggio.
    const sanitizedBriefing = sanitizeAnswer(result.content ?? "");
    if (sanitizedBriefing.wasModified) {
      console.warn("[silvio-admin-briefing] chain-of-thought leak rimosso dal briefing");
    }
    const cleanedContentMd = sanitizedBriefing.isFullyChainOfThought
      ? "Briefing non disponibile per questa data. Riprova tra qualche minuto."
      : (sanitizedBriefing.cleaned || result.content);

    // 5. Salva in silvio_admin_briefings
    const { data: saved, error: saveErr } = await supabase
      .from("silvio_admin_briefings")
      .upsert(
        {
          for_date: forDate,
          content_md: cleanedContentMd,
          highlights,
          snapshot,
          generated_by: result.modelUsed,
          generation_cost_usd: result.costUsd,
        },
        { onConflict: "for_date" }
      )
      .select("id, for_date")
      .single();

    if (saveErr) {
      return jsonRes({ error: saveErr.message }, 500);
    }

    return jsonRes({
      ok: true,
      briefing_id: saved.id,
      for_date: saved.for_date,
      model_used: result.modelUsed,
      cost_usd: result.costUsd,
      triggered_by: triggeredBy,
    });
  } catch (e) {
    console.error("[silvio-admin-briefing] error:", e);
    return jsonRes({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

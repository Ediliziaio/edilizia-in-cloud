// supabase/functions/ads-bot-chat/index.ts
//
// AdsBot — AI conversazionale specializzato in Meta/Google Ads per edilizia.
// L'utente chiede consigli, spiegazioni, suggerimenti su campagne specifiche.
//
// CONTEXT INJECTION:
//   • Lo stato delle campagne dell'azienda (count bozze, drafts, lead totali)
//   • Eventuale campagna selezionata (campaign_id) con builder_state
//   • Eventuale step del wizard corrente
//
// CASI D'USO:
//   • "Quanto budget mi serve per partire?"
//   • "Perché il mio CPL è alto?"
//   • "Mi consigli una creatività per bagni?"
//   • "Cosa significa CBO vs ABO?"
//   • "Come si configura il pixel Meta?"

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { requireCompanyAccess } from "../_shared/auth.ts";
import { chat, InsufficientCreditsError } from "../_shared/ai-provider/index.ts";

interface AdsBotChatRequest {
  company_id: string;
  /** Storia conversazione (per dare contesto multi-turn) */
  history: Array<{ role: "user" | "assistant"; content: string }>;
  /** Ultimo messaggio utente */
  message: string;
  /** Context: campagna selezionata, step wizard corrente */
  context?: {
    selected_campaign_id?: string;
    current_wizard_step?: number;
    platform?: "meta" | "google";
  };
}

interface AdsBotChatResponse {
  success: boolean;
  reply: string;
  suggestions?: string[]; // Follow-up questions
  actions?: Array<{ label: string; type: "open_wizard" | "open_settings" | "open_help"; url?: string }>;
  model_used?: string;
  cost_eur_cents?: number;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, corsHeaders);

  try {
    // AUTH
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401, corsHeaders);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: { user } } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return json({ error: "unauthorized" }, 401, corsHeaders);

    let body: AdsBotChatRequest;
    try {
      body = (await req.json()) as AdsBotChatRequest;
    } catch {
      return json({ error: "invalid_json" }, 400, corsHeaders);
    }

    if (!body.company_id || !body.message || body.message.trim().length === 0) {
      return json({ error: "missing_required_fields" }, 400, corsHeaders);
    }

    // AUTHZ — requireCompanyAccess gestisce anche gli utenti MULTI-AZIENDA
    // (multi_company_access): il vecchio check su profiles.company_id
    // bloccava con 403 chi lavorava sull'azienda non-primaria.
    try {
      await requireCompanyAccess(admin, user.id, body.company_id, corsHeaders);
    } catch (resp) {
      if (resp instanceof Response) return resp;
      return json({ error: "forbidden" }, 403, corsHeaders);
    }

    // CONTEXT BUILDING — informazioni sull'azienda + PERFORMANCE reali (7gg)
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const [companyRes, campaignsRes, insightsRes, guardRes] = await Promise.all([
      admin.from("companies").select("name, settore").eq("id", body.company_id).maybeSingle(),
      admin
        .from("meta_campaigns")
        .select("id, name, status, daily_budget_cents, objective, last_published_at")
        .eq("company_id", body.company_id)
        .neq("status", "archived")
        .order("updated_at", { ascending: false })
        .limit(10),
      admin
        .from("meta_insights_cache")
        .select("campaign_id, spend_cents, impressions, clicks, leads")
        .eq("company_id", body.company_id)
        .gte("date_start", sevenDaysAgo)
        .not("campaign_id", "is", null)
        .limit(500),
      admin
        .from("ad_spend_guard")
        .select("id")
        .eq("company_id", body.company_id)
        .limit(1),
    ]);

    const companyName = companyRes.data?.name ?? "l'azienda";
    const settore = companyRes.data?.settore ?? "edilizia";
    const allCampaigns = campaignsRes.data ?? [];
    const draftsCount = allCampaigns.filter((c) => c.status === "draft").length;
    const activeCount = allCampaigns.filter((c) => c.status === "active").length;
    const reviewCount = allCampaigns.filter((c) => c.status === "review").length;

    // Performance ultimi 7 giorni per campagna (spesa, lead, CPL, CTR) dalla
    // insights cache — così il bot ragiona su NUMERI reali, non a sensazione.
    const perf = new Map<string, { spend: number; imp: number; clicks: number; leads: number }>();
    for (const r of insightsRes.data ?? []) {
      const k = r.campaign_id as string;
      const p = perf.get(k) ?? { spend: 0, imp: 0, clicks: 0, leads: 0 };
      p.spend += r.spend_cents ?? 0;
      p.imp += r.impressions ?? 0;
      p.clicks += r.clicks ?? 0;
      p.leads += r.leads ?? 0;
      perf.set(k, p);
    }
    let performanceContext = "";
    if (perf.size > 0) {
      const lines: string[] = [];
      for (const [cid, p] of perf) {
        const name = allCampaigns.find((c) => c.id === cid)?.name ?? cid.slice(0, 8);
        const eur = (p.spend / 100).toFixed(0);
        const ctr = p.imp > 0 ? ((p.clicks / p.imp) * 100).toFixed(1) : "0";
        const cpl = p.leads > 0 ? (p.spend / 100 / p.leads).toFixed(0) : "—";
        lines.push(`- ${name}: €${eur} spesi · ${p.imp} impression · CTR ${ctr}% · ${p.leads} lead · CPL €${cpl}`);
      }
      performanceContext = `\n\n## PERFORMANCE ULTIMI 7 GIORNI (dati reali)\n${lines.slice(0, 10).join("\n")}\nUSA questi numeri quando l'utente chiede di performance, CPL o ottimizzazioni.`;
    }
    const hasSpendGuard = (guardRes.data ?? []).length > 0;
    const guardContext = hasSpendGuard
      ? ""
      : "\n\nNOTA: l'azienda NON ha una guardia spesa (ad_spend_guard) configurata — se parlate di budget, suggerisci di attivarla dalle impostazioni Pubblicità.";

    let selectedCampaignInfo = "";
    if (body.context?.selected_campaign_id) {
      const selectedRaw = allCampaigns.find((c) => c.id === body.context!.selected_campaign_id);
      if (selectedRaw) {
        selectedCampaignInfo = `\n\n## CAMPAGNA SELEZIONATA DALL'UTENTE
- Nome: ${selectedRaw.name}
- Obiettivo: ${selectedRaw.objective}
- Stato: ${selectedRaw.status}
- Budget giornaliero: ${selectedRaw.daily_budget_cents ? `${(selectedRaw.daily_budget_cents / 100).toFixed(0)}€` : "non impostato"}`;
      }
    }

    let wizardContext = "";
    if (body.context?.current_wizard_step) {
      const stepNames = ["", "Offerta", "Pubblico", "Modulo lead", "Creatività", "Revisione"];
      wizardContext = `\n\nL'utente è attualmente nello step ${body.context.current_wizard_step} del wizard ("${stepNames[body.context.current_wizard_step] ?? "?"}").`;
    }

    let platformContext = "";
    if (body.context?.platform) {
      platformContext = body.context.platform === "google"
        ? "\n\nL'utente sta lavorando su Google Ads (Search/Display/Video)."
        : "\n\nL'utente sta lavorando su Meta Ads (Facebook/Instagram).";
    }

    // SYSTEM PROMPT
    const systemPrompt = `Sei AdsBot, l'AI consulente Meta/Google Ads dentro EdiliziaInCloud (SaaS per imprese edili italiane).

## RUOLO
Aiuti il titolare di ${companyName} a creare e ottimizzare campagne pubblicitarie su Meta e Google.
Settore azienda: ${settore}.

## CONTESTO ATTUALE
- Bozze locali: ${draftsCount}
- Campagne attive: ${activeCount}
- In attesa approvazione: ${reviewCount}
- Campagne totali: ${allCampaigns.length}${selectedCampaignInfo}${wizardContext}${platformContext}${performanceContext}${guardContext}

## REGOLE OBBLIGATORIE
- Italiano professionale ma diretto, non gergale
- Mai claim non verificabili ("garantito", "il migliore", "primo")
- Mai promesse esagerate sul budget ("con 5€ avrai 50 lead")
- Se la domanda è ambigua, chiedi chiarimenti
- Cita numeri solo se richiesti / se hai dati dell'azienda
- Conforme a policy Meta/Google (no salute/finanza aggressivi)
- Risposte brevi, max 3 paragrafi, no liste lunghissime
- Se l'utente chiede di fare azioni che non puoi fare (creare campagne, modificare budget), spiega che deve usare i bottoni nell'interfaccia

## CONOSCENZA OPERATIVA
- Meta: ODAX objectives, CBO vs ABO, Advantage+ audience, Lead Forms, CAPI
- Google: Performance Max, Search Network, Smart Bidding (TARGET_CPA/ROAS)
- Edilizia: budget 15-50€/g local, CPL realistici 15-40€ per lead caldo, lookalike clienti chiusi

## OUTPUT JSON
{
  "reply": "testo risposta (max 700 caratteri)",
  "suggestions": ["domanda follow-up 1", "..."],  // 0-3 elementi
  "actions": [{"label": "...", "type": "open_wizard|open_settings|open_help"}]  // 0-2 elementi
}

NIENTE altro fuori dal JSON.`;

    // CHIAMATA AI
    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...body.history.map((h) => ({
        role: h.role,
        content: h.content,
      })),
      { role: "user" as const, content: body.message },
    ];

    let aiResp;
    try {
      aiResp = await chat({
        company_id: body.company_id,
        // Task dedicato (ai_router_config): primary claude-sonnet-4.5 — stesso
        // tier premium di Silvio. Prima era chat_routine → gpt-4o-mini.
        task_kind: "ads_bot_chat",
        messages,
        temperature: 0.6,
        max_tokens: 1200,
        json_mode: true,
      });
    } catch (e) {
      if (e instanceof InsufficientCreditsError) {
        return json({
          error: "insufficient_credits",
          user_message: e.user_message_it,
        }, 402, corsHeaders);
      }
      throw e;
    }

    const raw = aiResp.content ?? "{}";
    let parsed: Partial<AdsBotChatResponse> = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          parsed = JSON.parse(m[0]);
        } catch {
          // fallback
        }
      }
    }

    const result: AdsBotChatResponse = {
      success: true,
      reply: parsed.reply ?? "Mi spiace, non ho capito. Puoi riformulare?",
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 3) : [],
      actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 2) : [],
      model_used: aiResp.model_used,
      cost_eur_cents: Math.round((aiResp.cost_usd ?? 0) * 92),
    };

    return json(result, 200, corsHeaders);
  } catch (e) {
    console.error("[ads-bot-chat] uncaught", e);
    return json({ error: "internal_error", detail: String(e) }, 500, corsHeaders);
  }
});

function json(payload: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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

    // AUTHZ
    const { data: profile } = await admin
      .from("profiles")
      .select("company_id, full_name")
      .eq("id", user.id)
      .maybeSingle();
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const isSA = (roles ?? []).some((r) => r.role === "super_admin");
    if (!isSA && profile?.company_id !== body.company_id) {
      return json({ error: "forbidden" }, 403, corsHeaders);
    }

    // CONTEXT BUILDING — informazioni sull'azienda
    const [companyRes, campaignsRes] = await Promise.all([
      admin.from("companies").select("name, settore").eq("id", body.company_id).maybeSingle(),
      admin
        .from("meta_campaigns")
        .select("id, name, status, daily_budget_cents, objective, last_published_at")
        .eq("company_id", body.company_id)
        .neq("status", "archived")
        .order("updated_at", { ascending: false })
        .limit(10),
    ]);

    const companyName = companyRes.data?.name ?? "l'azienda";
    const settore = companyRes.data?.settore ?? "edilizia";
    const allCampaigns = campaignsRes.data ?? [];
    const draftsCount = allCampaigns.filter((c) => c.status === "draft").length;
    const activeCount = allCampaigns.filter((c) => c.status === "active").length;
    const reviewCount = allCampaigns.filter((c) => c.status === "review").length;

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
- Campagne totali: ${allCampaigns.length}${selectedCampaignInfo}${wizardContext}${platformContext}

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
  "reply": "testo risposta (max 400 caratteri)",
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
        task_kind: "chat_routine",
        messages,
        temperature: 0.6,
        max_tokens: 800,
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
